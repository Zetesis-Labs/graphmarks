import { select } from 'd3-selection'
import { createSignal, For, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { app } from './bus'
import { members } from './graph/build'
import { nodeColor } from './graph/style'
import { t } from './i18n'
import { zoom, zoomToNodes } from './interactions'
import { type CommandItem, matchCommands } from './lib/command-palette'
import { matchesQuery, type SearchCandidate, scoreCandidate } from './lib/search-score'
import { S } from './state'
import { activateTab, toggleOnlyOpen } from './tabs'
import type { GraphNode } from './types'
import { canvas, dlg, resultsEl, searchBox } from './ui/dom'

const MAX_RESULTS = 12
const DWELL_MS = 3000

const [searchItems, setSearchItems] = createSignal<GraphNode[]>([])
const [commandItems, setCommandItems] = createSignal<CommandItem[]>([])
const [isCommandMode, setIsCommandMode] = createSignal(false)
const [searchSel, setSearchSel] = createSignal(-1)
/** Referencias a las filas pintadas: `scrollIntoView` necesita el elemento. */
const rowEls: HTMLElement[] = []
let dwellTimer: ReturnType<typeof setTimeout> | undefined
let preSearchTf: typeof S.tf | null = null

function enterSearchMode(): void {
  if (preSearchTf) return
  preSearchTf = S.tf
  zoomToNodes(S.nodes, 80, 450) // el grafo se ve amplio, sin zoom
}

function exitSearchMode(): void {
  if (preSearchTf) {
    select(canvas).transition().duration(450).call(zoom.transform, preSearchTf)
    preSearchTf = null
  }
  clearTimeout(dwellTimer)
  S.searchFocusNode = null
  resultsEl.hidden = true
  setSearchItems([])
  setCommandItems([])
  setIsCommandMode(false)
  setSearchSel(-1)
}

function nodeKind(n: GraphNode): string {
  if (n.type === 'ghost') return t('kindTab')
  if (n.history) return t('kindHistory')
  if (n.type === 'bm') return S.openTabs.has(n.id) ? t('kindOpen') : t('kindBookmark')
  if (n.subtype === 'tag') return t('kindTag')
  return t('kindFolder')
}

function candidateOf(n: GraphNode): SearchCandidate {
  return {
    title: n.title,
    url: n.url ?? '',
    tags: n.tags ?? [],
    tagHub: n.subtype === 'tag' ? (n.tag ?? null) : null,
    kind: n.type === 'ghost' ? 'ghost' : n.type === 'bm' ? 'bm' : 'folder',
    isOpen: n.type === 'bm' && S.openTabs.has(n.id),
    heat: n.heat ?? 0
  }
}

function buildResults(q: string): GraphNode[] {
  const query = q.trim().toLowerCase()
  return S.nodes
    .map(n => ({ n, s: scoreCandidate(candidateOf(n), query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_RESULTS)
    .map(x => x.n)
}

function Results(): JSX.Element {
  const row = (i: number, el: HTMLElement): void => {
    rowEls[i] = el
  }
  return (
    <Show
      when={isCommandMode()}
      fallback={
        <For each={searchItems()}>
          {(n, i) => (
            <li
              ref={el => row(i(), el)}
              class={searchSel() === i() ? 'sel' : ''}
              onMouseDown={ev => {
                ev.preventDefault()
                runResult(n)
              }}
              onMouseEnter={() => selectResult(i(), false)}
            >
              <span class="dot" style={{ background: nodeColor(n) }} />
              <span class="rt" title={n.url ?? n.title}>
                {n.title}
              </span>
              <span class="kind">{nodeKind(n)}</span>
            </li>
          )}
        </For>
      }
    >
      <For each={commandItems()}>
        {(cmd, i) => (
          <li
            ref={el => row(i(), el)}
            class={searchSel() === i() ? 'sel' : ''}
            onMouseDown={ev => {
              ev.preventDefault()
              runCommandResult(cmd)
            }}
            onMouseEnter={() => selectResult(i(), false)}
          >
            <span class="dot cmd">{cmd.icon}</span>
            <span class="rt">{t(cmd.titleKey)}</span>
            <span class="kind">{cmd.shortcut ?? t('cmdCategory')}</span>
          </li>
        )}
      </For>
    </Show>
  )
}

function selectResult(i: number, scroll = true): void {
  setSearchSel(i)
  if (isCommandMode()) {
    if (scroll) rowEls[i]?.scrollIntoView({ block: 'nearest' })
    return
  }
  const n = searchItems()[i] ?? null
  S.searchFocusNode = n
  clearTimeout(dwellTimer)
  if (n) {
    dwellTimer = setTimeout(() => zoomToNodes([n], 150), DWELL_MS)
    if (scroll) rowEls[i]?.scrollIntoView({ block: 'nearest' })
  }
  app.requestDraw()
}

function runCommandResult(cmd: CommandItem | undefined): void {
  if (!cmd) return
  clearSearch()
  searchBox.blur()
  void cmd.action()
}

function runResult(n: GraphNode | undefined): void {
  if (!n) return
  if (n.type === 'ghost') {
    if (n.tab) void activateTab(n.tab)
    return
  }
  if (n.type === 'bm') {
    const open = S.openTabs.get(n.id)
    const first = open?.[0]
    if (first) {
      void activateTab(first)
      return
    }
    window.location.href = n.url ?? ''
    return
  }
  if (n.subtype === 'tag') {
    searchBox.value = `#${n.tag}`
    applySearch(searchBox.value)
    return
  }
  zoomToNodes(members(n), 90)
  searchBox.blur()
}

export function applySearch(q: string): void {
  if (q.trim().startsWith('>')) {
    const matches = matchCommands(q, t)
    rowEls.length = 0
    setIsCommandMode(true)
    S.searchQuery = q.trim()
    S.focusSet = null
    S.searchFocusNode = null
    setCommandItems(matches)
    setSearchSel(matches.length ? 0 : -1)
    resultsEl.hidden = !matches.length
    app.requestDraw()
    return
  }

  setIsCommandMode(false)
  S.searchQuery = q.trim().toLowerCase()
  if (!S.searchQuery) {
    S.focusSet = null
  } else {
    const s = new Set<string>()
    for (const n of S.nodes) {
      if (!matchesQuery(candidateOf(n), S.searchQuery)) continue
      s.add(n.id)
      for (const h of n.hubs ?? []) s.add(h)
      if (n.parentId) s.add(n.parentId)
    }
    S.focusSet = s
  }
  const items = buildResults(q)
  rowEls.length = 0
  setSearchItems(items)
  resultsEl.hidden = !items.length
  selectResult(items.length ? 0 : -1, false)
  app.requestDraw()
}

export function clearSearch(): void {
  searchBox.value = ''
  S.searchQuery = ''
  S.focusSet = null
  exitSearchMode()
  app.requestDraw()
}

export function initSearch(): void {
  render(() => <Results />, resultsEl)
  searchBox.addEventListener('input', e => applySearch((e.target as HTMLInputElement).value))
  searchBox.addEventListener('focus', () => {
    enterSearchMode()
    applySearch(searchBox.value)
  })
  searchBox.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== searchBox) {
        resultsEl.hidden = true
        clearTimeout(dwellTimer)
        S.searchFocusNode = null
        app.requestDraw()
      }
    }, 150)
  })
  searchBox.addEventListener('keydown', e => {
    const listLen = isCommandMode() ? commandItems().length : searchItems().length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!listLen) return
      const d = e.key === 'ArrowDown' ? 1 : -1
      selectResult((searchSel() + d + listLen) % listLen)
    } else if (e.key === 'Enter') {
      if (isCommandMode()) runCommandResult(commandItems()[searchSel()] ?? commandItems()[0])
      else runResult(searchItems()[searchSel()] ?? searchItems()[0])
    } else if (e.key === 'Escape') {
      clearSearch()
      searchBox.blur()
    }
  })

  document.addEventListener('keydown', e => {
    if (dlg.open) return
    const active = document.activeElement
    const typing = active === searchBox || /^(INPUT|SELECT|TEXTAREA)$/.test(active?.tagName ?? '')
    if (e.key === 'º' || e.key === 'ª') {
      if (!typing) {
        e.preventDefault()
        void toggleOnlyOpen()
      }
      return
    }
    if (typing) return
    if (e.key === '/') {
      e.preventDefault()
      searchBox.focus()
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // escribir en cualquier parte activa el buscador directamente
      e.preventDefault()
      searchBox.focus()
      searchBox.value += e.key
      applySearch(searchBox.value)
    }
  })
}
