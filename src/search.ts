import { select } from 'd3-selection'
import { app } from './bus'
import { promptNewBookmark, promptNewFolder } from './dialogs'
import { members } from './graph/build'
import { nodeColor } from './graph/style'
import { openHygieneDialog } from './hygiene'
import { t } from './i18n'
import { unpinAll, zoom, zoomToNodes } from './interactions'
import { type CommandItem, matchCommands, registerCommands } from './lib/command-palette'
import { matchesQuery, type SearchCandidate, scoreCandidate } from './lib/search-score'
import { saveStore } from './lib/storage'
import { buildViews } from './panels'
import { openSettingsPanel } from './settings'
import { S } from './state'
import { activateTab, toggleOnlyOpen } from './tabs'
import { exportData, importData } from './transfer'
import type { GraphNode, ViewMode } from './types'
import { canvas, dlg, resultsEl, searchBox } from './ui/dom'
import { strategies } from './view-strategy'

const MAX_RESULTS = 12
const DWELL_MS = 3000

let searchItems: GraphNode[] = []
let commandItems: CommandItem[] = []
let isCommandMode = false
let searchSel = -1
let dwellTimer: ReturnType<typeof setTimeout> | undefined
let preSearchTf: typeof S.tf | null = null

export function setupDefaultCommands(): void {
  registerCommands([
    {
      id: 'cmd-new-folder',
      titleKey: 'cmdNewFolder',
      icon: '📁',
      keywords: ['nueva', 'carpeta', 'folder', 'new'],
      action: () => promptNewFolder()
    },
    {
      id: 'cmd-new-bookmark',
      titleKey: 'cmdNewBookmark',
      icon: '🔖',
      keywords: ['nuevo', 'marcador', 'bookmark', 'add'],
      action: () => promptNewBookmark()
    },
    {
      id: 'cmd-view-folders',
      titleKey: 'cmdViewFolders',
      icon: '📂',
      keywords: ['carpetas', 'folders', 'vista'],
      action: () => switchViewMode('folders')
    },
    {
      id: 'cmd-view-tags',
      titleKey: 'cmdViewTags',
      icon: '🏷️',
      keywords: ['tags', 'etiquetas', 'vista'],
      action: () => switchViewMode('tags')
    },
    {
      id: 'cmd-view-domains',
      titleKey: 'cmdViewDomains',
      icon: '🌐',
      keywords: ['dominios', 'domains', 'vista'],
      action: () => switchViewMode('domains')
    },
    {
      id: 'cmd-view-history',
      titleKey: 'cmdViewHistory',
      icon: '◷',
      keywords: ['historial', 'history', 'vista'],
      action: () => switchViewMode('history')
    },
    {
      id: 'cmd-toggle-only-open',
      titleKey: 'cmdToggleOnlyOpen',
      icon: '⧉',
      shortcut: 'º',
      keywords: ['abiertas', 'open', 'filtro'],
      action: () => void toggleOnlyOpen()
    },
    {
      id: 'cmd-toggle-ghosts',
      titleKey: 'cmdToggleGhosts',
      icon: '👻',
      keywords: ['fantasmas', 'ghosts', 'pestañas'],
      action: () => {
        void (async () => {
          S.showGhosts = !S.showGhosts
          await saveStore('ghosts', S.showGhosts)
          app.rebuildSoon()
        })()
      }
    },
    {
      id: 'cmd-unpin-all',
      titleKey: 'cmdUnpinAll',
      icon: '📍',
      keywords: ['desfijar', 'unpin', 'posiciones', 'layout'],
      action: () => unpinAll()
    },
    {
      id: 'cmd-frame-all',
      titleKey: 'cmdFrameAll',
      icon: '⌂',
      keywords: ['encuadrar', 'frame', 'todo', 'zoom'],
      action: () => zoomToNodes(S.nodes, 80)
    },
    {
      id: 'cmd-export',
      titleKey: 'cmdExport',
      icon: '📤',
      keywords: ['exportar', 'export', 'json'],
      action: () => exportData()
    },
    {
      id: 'cmd-import',
      titleKey: 'cmdImport',
      icon: '📥',
      keywords: ['importar', 'import', 'json'],
      action: () => importData()
    },
    {
      id: 'cmd-show-guide',
      titleKey: 'cmdShowGuide',
      icon: '💡',
      keywords: ['guia', 'tour', 'ayuda', 'guide'],
      action: () => app.startGuide()
    },
    {
      id: 'cmd-settings',
      titleKey: 'cmdSettings',
      icon: '⚙',
      keywords: ['ajustes', 'settings', 'preferencias', 'configuracion'],
      action: () => openSettingsPanel()
    },
    {
      id: 'cmd-hygiene',
      titleKey: 'cmdHygiene',
      icon: '🧹',
      keywords: ['higiene', 'duplicados', 'limpiar', 'hygiene', 'duplicates', 'cleanup'],
      action: () => openHygieneDialog()
    }
  ])
}

function switchViewMode(mode: ViewMode): void {
  if (S.viewMode === mode) return
  S.activeSubgraph = null
  S.expandedFolders.clear()
  S.viewMode = mode
  S.strategy = strategies[mode]
  void saveStore('view', mode)
  buildViews()
  void app.rebuild(false)
  zoomToNodes(S.nodes, 80)
}

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
  commandItems = []
  isCommandMode = false
  searchSel = -1
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

function renderCommandResults(): void {
  resultsEl.replaceChildren()
  resultsEl.hidden = !commandItems.length
  commandItems.forEach((cmd, i) => {
    const li = document.createElement('li')
    li.classList.toggle('sel', i === searchSel)
    const icon = document.createElement('span')
    icon.className = 'dot'
    icon.textContent = cmd.icon
    icon.style.background = 'transparent'
    icon.style.textAlign = 'center'
    icon.style.fontSize = '12px'
    const tEl = document.createElement('span')
    tEl.className = 'rt'
    tEl.textContent = t(cmd.titleKey)
    const kind = document.createElement('span')
    kind.className = 'kind'
    kind.textContent = cmd.shortcut ?? t('cmdCategory')
    li.append(icon, tEl, kind)
    li.addEventListener('mousedown', ev => {
      ev.preventDefault()
      runCommandResult(cmd)
    })
    li.addEventListener('mouseenter', () => selectResult(i, false))
    resultsEl.appendChild(li)
  })
}

function renderResults(): void {
  if (isCommandMode) {
    renderCommandResults()
    return
  }
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
  if (isCommandMode) {
    if (scroll) resultsEl.children[i]?.scrollIntoView({ block: 'nearest' })
    return
  }
  const n = searchItems[i] ?? null
  S.searchFocusNode = n
  clearTimeout(dwellTimer)
  if (n) {
    dwellTimer = setTimeout(() => zoomToNodes([n], 150), DWELL_MS)
    if (scroll) resultsEl.children[i]?.scrollIntoView({ block: 'nearest' })
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
    isCommandMode = true
    S.searchQuery = q.trim()
    S.focusSet = null
    S.searchFocusNode = null
    commandItems = matchCommands(q, t)
    searchSel = commandItems.length ? 0 : -1
    renderResults()
    app.requestDraw()
    return
  }

  isCommandMode = false
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
  setupDefaultCommands()
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
    const listLen = isCommandMode ? commandItems.length : searchItems.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!listLen) return
      const d = e.key === 'ArrowDown' ? 1 : -1
      selectResult((searchSel + d + listLen) % listLen)
    } else if (e.key === 'Enter') {
      if (isCommandMode) runCommandResult(commandItems[searchSel] ?? commandItems[0])
      else runResult(searchItems[searchSel] ?? searchItems[0])
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
