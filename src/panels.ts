import { app } from './bus'
import { SERIES_VARS, VIEW_KEYS } from './constants'
import { members } from './graph/build'
import { t } from './i18n'
import { closeSubgraph, zoomToNodes } from './interactions'
import { saveStore } from './lib/storage'
import { S } from './state'
import type { Cluster, ViewMode } from './types'
import { promptCustomViewDialog } from './ui/custom-view-dialog'
import { legendEl, listPanel, listToggle, viewsEl } from './ui/dom'
import { createCustomStrategy, getStrategy } from './view-strategy'

function clusterDotColor(c: Cluster): string {
  const raw = S.byId.get(c.id)?.raw
  const custom = raw ? S.customColors[`f:${raw}`] : undefined
  if (custom) return custom
  const slot = c.slot ?? -1
  return slot >= 0 ? `var(${SERIES_VARS[slot]})` : 'var(--other)'
}

export function buildViews(): void {
  viewsEl.replaceChildren()
  for (const [mode, key] of Object.entries(VIEW_KEYS) as Array<[ViewMode, (typeof VIEW_KEYS)[ViewMode]]>) {
    const b = document.createElement('button')
    b.textContent = t(key)
    b.classList.toggle('active', mode === S.viewMode)
    b.addEventListener('click', () => {
      void (async () => {
        if (mode === S.viewMode) return
        S.activeSubgraph = null
        S.expandedFolders.clear()
        S.viewMode = mode
        S.strategy = getStrategy(mode)
        await saveStore('view', mode)
        buildViews()
        await app.rebuild(false)
        zoomToNodes(S.nodes, 80)
      })()
    })
    viewsEl.appendChild(b)
  }

  // Vistas personalizadas del usuario
  for (const spec of S.customViews) {
    const b = document.createElement('button')
    b.textContent = `${spec.icon} ${spec.name}`
    b.title = `${spec.name} (${spec.query}) · Clic derecho para editar`
    b.classList.toggle('active', spec.id === S.viewMode)
    b.addEventListener('click', () => {
      void (async () => {
        if (spec.id === S.viewMode) return
        S.activeSubgraph = null
        S.expandedFolders.clear()
        S.viewMode = spec.id
        S.strategy = createCustomStrategy(spec)
        await saveStore('view', spec.id)
        buildViews()
        await app.rebuild(false)
        zoomToNodes(S.nodes, 80)
      })()
    })
    b.addEventListener('contextmenu', ev => {
      ev.preventDefault()
      promptCustomViewDialog(spec)
    })
    viewsEl.appendChild(b)
  }

  // Botón + Nueva vista
  const addBtn = document.createElement('button')
  addBtn.textContent = '+'
  addBtn.title = t('newCustomView')
  addBtn.addEventListener('click', () => promptCustomViewDialog())
  viewsEl.appendChild(addBtn)
}

export function buildLegend(): void {
  legendEl.replaceChildren()
  const all = document.createElement('button')
  all.className = 'chip'
  all.textContent = S.activeSubgraph ? t('subgraphBack') : t('frameAll')
  all.title = S.activeSubgraph ? t('subgraphBackTitle') : t('frameAllTitle')
  all.addEventListener('click', () => {
    if (S.activeSubgraph) closeSubgraph()
    else zoomToNodes(S.nodes, 80)
  })
  legendEl.appendChild(all)

  for (const item of S.strategy.legendItems?.() ?? []) {
    legendEl.appendChild(item)
  }
}

/** Vista de lista accesible: los mismos datos sin canvas. */
export function buildList(): void {
  listPanel.replaceChildren()
  for (const c of S.clusters) {
    const hub = S.byId.get(c.id)
    if (!hub) continue
    const det = document.createElement('details')
    const sum = document.createElement('summary')
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.style.background = clusterDotColor(c)
    const name = document.createElement('span')
    name.textContent = c.title
    const n = document.createElement('span')
    n.className = 'n'
    n.textContent = `(${c.count})`
    sum.append(dot, name, n)
    det.appendChild(sum)
    for (const node of members(hub)) {
      if (node.type !== 'bm') continue
      const a = document.createElement('a')
      a.href = node.url ?? ''
      a.textContent = node.title
      a.title = node.url ?? ''
      det.appendChild(a)
    }
    listPanel.appendChild(det)
  }
}

export function initPanels(): void {
  listToggle.addEventListener('click', () => {
    listPanel.hidden = !listPanel.hidden
    listToggle.textContent = listPanel.hidden ? t('listOpen') : t('listClose')
  })
}
