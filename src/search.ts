import { select } from 'd3-selection'
import { app } from './bus'
import { members } from './graph/build'
import { nodeColor } from './graph/style'
import { t } from './i18n'
import { zoom, zoomToNodes } from './interactions'
import { S } from './state'
import { activateTab, toggleOnlyOpen } from './tabs'
import type { GraphNode } from './types'
import { canvas, dlg, resultsEl, searchBox } from './ui/dom'

const MAX_RESULTS = 12
const DWELL_MS = 3000

let searchItems: GraphNode[] = []
let searchSel = -1
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
  searchItems = []
  searchSel = -1
}

function nodeKind(n: GraphNode): string {
  if (n.type === 'ghost') return t('kindTab')
  if (n.type === 'bm') return S.openTabs.has(n.id) ? t('kindOpen') : t('kindBookmark')
  if (n.subtype === 'tag') return t('kindTag')
  return t('kindFolder')
}

/** Puntuación: prefijo > substring en título > URL > tags; la sesión abierta sube. */
function scoreNode(n: GraphNode, query: string): number {
  const title = n.title.toLowerCase()
  const url = (n.url ?? '').toLowerCase()
  const tagText = (n.tags ?? []).map(t => `#${t}`).join(' ')
  if (!query) {
    // sin texto: la sesión abierta primero, luego lo más usado
    if (n.type === 'bm' && S.openTabs.has(n.id)) return 90
    if (n.type === 'ghost') return 80
    if (n.type === 'bm') return (n.heat ?? 0) * 50
    return -1
  }
  if (query.startsWith('#')) {
    const tq = query.slice(1)
    if (n.subtype === 'tag' && n.tag?.includes(tq)) return 100
    if ((n.tags ?? []).some(t => t.includes(tq))) return 60
    return -1
  }
  let s = -1
  if (title.startsWith(query)) s = 100
  else if (title.includes(query)) s = 70
  else if (url.includes(query)) s = 50
  else if (tagText.includes(query)) s = 40
  if (s > 0 && n.type === 'bm' && S.openTabs.has(n.id)) s += 15
  if (s > 0 && n.type === 'folder') s -= 10
  return s
}

function buildResults(q: string): GraphNode[] {
  const query = q.trim().toLowerCase()
  return S.nodes
    .map(n => ({ n, s: scoreNode(n, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_RESULTS)
    .map(x => x.n)
}

function renderResults(): void {
  resultsEl.replaceChildren()
  resultsEl.hidden = !searchItems.length
  searchItems.forEach((n, i) => {
    const li = document.createElement('li')
    li.classList.toggle('sel', i === searchSel)
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.style.background = nodeColor(n)
    const t = document.createElement('span')
    t.className = 'rt'
    t.textContent = n.title
    t.title = n.url ?? n.title
    const kind = document.createElement('span')
    kind.className = 'kind'
    kind.textContent = nodeKind(n)
    li.append(dot, t, kind)
    li.addEventListener('mousedown', ev => {
      ev.preventDefault()
      runResult(n)
    })
    li.addEventListener('mouseenter', () => selectResult(i, false))
    resultsEl.appendChild(li)
  })
}

function selectResult(i: number, scroll = true): void {
  searchSel = i
  ;[...resultsEl.children].forEach((li, j) => {
    li.classList.toggle('sel', j === i)
  })
  const n = searchItems[i] ?? null
  S.searchFocusNode = n
  clearTimeout(dwellTimer)
  if (n) {
    // quedarse 3 s sobre un resultado focaliza ese nodo en el grafo
    dwellTimer = setTimeout(() => zoomToNodes([n], 150), DWELL_MS)
    if (scroll) resultsEl.children[i]?.scrollIntoView({ block: 'nearest' })
  }
  app.requestDraw()
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
  S.searchQuery = q.trim().toLowerCase()
  if (!S.searchQuery) {
    S.focusSet = null
  } else {
    const tagQuery = S.searchQuery.startsWith('#') ? S.searchQuery.slice(1) : null
    const s = new Set<string>()
    for (const n of S.nodes) {
      let hit: boolean
      if (tagQuery !== null) {
        hit = n.subtype === 'tag' ? !!n.tag?.includes(tagQuery) : (n.tags ?? []).some(t => t.includes(tagQuery))
      } else {
        const hay = `${n.title} ${n.url ?? ''} ${(n.tags ?? []).map(t => `#${t}`).join(' ')}`.toLowerCase()
        hit = hay.includes(S.searchQuery)
      }
      if (hit) {
        s.add(n.id)
        for (const h of n.hubs ?? []) s.add(h)
        if (n.parentId) s.add(n.parentId)
      }
    }
    S.focusSet = s
  }
  searchItems = buildResults(q)
  searchSel = searchItems.length ? 0 : -1
  renderResults()
  selectResult(searchSel, false)
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
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!searchItems.length) return
      const d = e.key === 'ArrowDown' ? 1 : -1
      selectResult((searchSel + d + searchItems.length) % searchItems.length)
    } else if (e.key === 'Enter') {
      runResult(searchItems[searchSel] ?? searchItems[0])
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
