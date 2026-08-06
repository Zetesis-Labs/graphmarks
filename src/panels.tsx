import { For, type JSX } from 'solid-js'
import { Dynamic, render } from 'solid-js/web'
import { app } from './bus'
import { SERIES_VARS, VIEW_KEYS } from './constants'
import { members } from './graph/build'
import { t } from './i18n'
import { closeSubgraph, zoomToNodes } from './interactions'
import { saveStore } from './lib/storage'
import { bumpGraphVersion, graphVersion, S } from './state'
import type { Cluster, GraphNode, ViewMode } from './types'
import { legendEl, listPanel, listToggle, viewsEl } from './ui/dom'
import { strategies } from './view-strategy'

/**
 * Cabecera y panel de lista. Se montan una vez y reaccionan a `graphVersion`,
 * el contador que `rebuild()` incrementa: `S` no es reactivo a propósito (ver
 * state.ts), así que la invalidación es explícita y tiene un único punto.
 */

function clusterDotColor(c: Cluster): string {
  const raw = S.byId.get(c.id)?.raw
  const custom = raw ? S.customColors[`f:${raw}`] : undefined
  if (custom) return custom
  const slot = c.slot ?? -1
  return slot >= 0 ? `var(${SERIES_VARS[slot]})` : 'var(--other)'
}

/** Único punto de cambio de vista: botones de la cabecera y paleta comparten esto. */
export function switchView(mode: ViewMode): void {
  void (async () => {
    if (mode === S.viewMode) return
    S.activeSubgraph = null
    S.expandedFolders.clear()
    S.viewMode = mode
    S.strategy = strategies[mode]
    await saveStore('view', mode)
    refreshPanels()
    await app.rebuild(false)
    zoomToNodes(S.nodes, 80)
  })()
}

function Views(): JSX.Element {
  const modes = Object.entries(VIEW_KEYS) as Array<[ViewMode, (typeof VIEW_KEYS)[ViewMode]]>
  // S.viewMode es reactivo: sin graphVersion
  const activeMode = (): ViewMode => S.viewMode
  return (
    <For each={modes}>
      {([mode, key]) => (
        <button type="button" class={activeMode() === mode ? 'active' : ''} onClick={() => switchView(mode)}>
          {t(key)}
        </button>
      )}
    </For>
  )
}

function Legend(): JSX.Element {
  // activeSubgraph y strategy son reactivos: sin graphVersion
  const inSubgraph = (): boolean => S.activeSubgraph !== null
  const extras = (): ReturnType<NonNullable<typeof S.strategy.legendItems>> => S.strategy.legendItems?.() ?? []

  return (
    <>
      <button
        type="button"
        class="chip"
        title={inSubgraph() ? t('subgraphBackTitle') : t('frameAllTitle')}
        onClick={() => (S.activeSubgraph ? closeSubgraph() : zoomToNodes(S.nodes, 80))}
      >
        {inSubgraph() ? t('subgraphBack') : t('frameAll')}
      </button>
      <For each={extras()}>{item => <Dynamic component={item} />}</For>
    </>
  )
}

/** Vista de lista accesible: los mismos datos sin canvas. */
function BookmarkList(): JSX.Element {
  const clusters = (): Cluster[] => {
    graphVersion()
    return S.clusters.filter(c => S.byId.has(c.id))
  }
  const bookmarksOf = (c: Cluster): GraphNode[] => {
    const hub = S.byId.get(c.id)
    return hub ? members(hub).filter(n => n.type === 'bm') : []
  }

  return (
    <For each={clusters()}>
      {c => (
        <details>
          <summary>
            <span class="dot" style={{ background: clusterDotColor(c) }} />
            <span>{c.title}</span>
            <span class="n">({c.count})</span>
          </summary>
          <For each={bookmarksOf(c)}>
            {node => (
              <a href={node.url ?? ''} title={node.url ?? ''}>
                {node.title}
              </a>
            )}
          </For>
        </details>
      )}
    </For>
  )
}

/** Repinta cabecera y lista: los datos salen de `S`, que no avisa por su cuenta. */
export function refreshPanels(): void {
  bumpGraphVersion()
}

export function initPanels(): void {
  render(() => <Views />, viewsEl)
  render(() => <Legend />, legendEl)
  render(() => <BookmarkList />, listPanel)

  listToggle.addEventListener('click', () => {
    listPanel.hidden = !listPanel.hidden
    listToggle.textContent = listPanel.hidden ? t('listOpen') : t('listClose')
  })
}
