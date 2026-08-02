import { loadTree } from './bookmarks'
import { app } from './bus'
import { loadCustomizations } from './custom'
import { IS_EXT } from './env'
import { addGhostNodes, buildGraph, pruneToOpen, rebuildNeighbors } from './graph/build'
import { simulation, startSimulation } from './graph/simulation'
import { computeHistory } from './history'
import { localizeDom, t } from './i18n'
import { initCanvasInteractions, resetZoom, zoomToNodes } from './interactions'
import { buildLegend, buildList, buildViews, initPanels } from './panels'
import { requestDraw } from './render'
import { applySearch, clearSearch, initSearch } from './search'
import { initSessionsUi, loadSessions } from './sessions'
import { loadPersistedState, readColors, S } from './state'
import { scheduleSurrealSpike } from './surreal/spike'
import {
  checkPermissions,
  clearBadgeWarn,
  computeOpenTabs,
  initTabsUi,
  refreshTabs,
  rescanTabsSoon,
  resolveCurrentWindow,
  sessionKey,
  updateBadge
} from './tabs'
import { loadTags, seedTagsIfEmpty } from './tags'
import type { RawBookmarkNode } from './types'
import { canvas, emptyEl, installErrorSurface } from './ui/dom'
import { installMenuDismiss } from './ui/menu'
import { toast } from './ui/toast'

installErrorSurface()
localizeDom()
readColors()

function renderEmptyState(hasBookmarks: boolean): void {
  emptyEl.hidden = hasBookmarks
  if (hasBookmarks) return
  const title = S.onlyOpen ? t('emptyNoOpenTitle') : t('emptyNoBookmarksTitle')
  const body = S.onlyOpen ? t('emptyNoOpenBody') : t('emptyNoBookmarksBody')
  emptyEl.innerHTML = '<h2></h2><p></p>'
  const h = emptyEl.querySelector('h2')
  const p = emptyEl.querySelector('p')
  if (h) h.textContent = title
  if (p) p.textContent = body
}

/**
 * Reconstruye el grafo conservando posiciones: editar no debe provocar un
 * re-layout brusco. Los nodos nuevos nacen junto a su carpeta.
 */
export async function rebuild(fit: boolean): Promise<void> {
  const prevPos = new Map(S.nodes.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]))
  S.lastTree = await loadTree()
  buildGraph(S.lastTree)
  S.allBms = S.nodes.filter(n => n.type === 'bm')

  clearBadgeWarn()
  const res = await computeOpenTabs(S.allBms)
  S.openTabs = res.map
  S.ghostTabs = res.ghosts
  S.lastOpenKey = sessionKey()
  updateBadge()

  await computeHistory()
  for (const n of S.allBms) n.heat = S.heatByUrl.get(n.url ?? '') ?? 0.35
  addGhostNodes()
  rebuildNeighbors()

  if (S.onlyOpen) {
    pruneToOpen()
    S.clusters = S.clusters.filter(c => S.byId.has(c.id))
  }

  for (const n of S.nodes) {
    const p = prevPos.get(n.id)
    if (p) Object.assign(n, p)
    else n.born = performance.now()
  }
  for (const n of S.nodes) {
    if (n.x === undefined && n.parentId) {
      const par = S.byId.get(n.parentId)
      if (par?.x !== undefined) {
        n.x = par.x + (Math.random() - 0.5) * 50
        n.y = (par.y ?? 0) + (Math.random() - 0.5) * 50
      }
    }
  }
  // layout manual: aplicar posiciones fijadas de esta vista
  const pins = S.pinned[S.viewMode] ?? {}
  for (const n of S.nodes) {
    const p = pins[n.id]
    if (p) {
      n.x = p.x
      n.y = p.y
      n.fx = p.x
      n.fy = p.y
    }
  }

  renderEmptyState(S.nodes.some(n => n.type === 'bm'))
  buildLegend()
  buildList()
  startSimulation(fit ? 1 : 0.5)
  if (fit) {
    resetZoom()
    simulation?.tick(120)
    zoomToNodes(S.nodes, 80, 0)
  }
  if (S.searchQuery) applySearch(S.searchQuery)
  requestDraw()
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined
function rebuildSoon(): void {
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => void rebuild(false), 350)
}

// el bus rompe los ciclos: los módulos de dominio llaman aquí sin importarnos
app.rebuild = rebuild
app.rebuildSoon = rebuildSoon
app.requestDraw = requestDraw
app.zoomToNodes = zoomToNodes
app.applySearch = applySearch
app.clearSearch = clearSearch

function installChromeListeners(): void {
  if (!IS_EXT) return
  chrome.bookmarks.onCreated.addListener(rebuildSoon)
  chrome.bookmarks.onRemoved.addListener(rebuildSoon)
  chrome.bookmarks.onChanged.addListener(rebuildSoon)
  chrome.bookmarks.onMoved.addListener(rebuildSoon)
  chrome.storage?.onChanged?.addListener((ch, area) => {
    if (area === 'sync' && Object.keys(ch).some(k => k.startsWith('tags_'))) {
      void (async () => {
        S.tagsMap = await loadTags()
        rebuildSoon()
      })()
    } else if (area === 'local' && ch.tags) {
      S.tagsMap = (ch.tags.newValue as typeof S.tagsMap) ?? {}
      rebuildSoon()
    }
  })
  if (chrome.tabs) {
    const events = ['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onReplaced', 'onAttached'] as const
    for (const e of events) {
      const evt = chrome.tabs[e] as { addListener?: (cb: () => void) => void } | undefined
      evt?.addListener?.(rescanTabsSoon)
    }
  }
  chrome.windows?.onCreated?.addListener(rescanTabsSoon)
  chrome.windows?.onRemoved?.addListener(rescanTabsSoon)
}

function collectUrls(items: RawBookmarkNode[], acc: Set<string>): void {
  for (const it of items) {
    if (it.url) acc.add(it.url)
    else collectUrls(it.children ?? [], acc)
  }
}

async function boot(): Promise<void> {
  await loadPersistedState(new URLSearchParams(location.search))
  await resolveCurrentWindow()
  await loadSessions()
  await loadCustomizations()
  void checkPermissions()
  S.tagsMap = await loadTags()

  initPanels()
  initTabsUi()
  initSessionsUi()
  initSearch()
  initCanvasInteractions()
  installMenuDismiss()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors()
    requestDraw()
  })
  new ResizeObserver(() => requestDraw()).observe(canvas)
  installChromeListeners()

  buildViews()
  await rebuild(true)
  scheduleSurrealSpike()

  // primera vez: sembrar etiquetas de ejemplo para las URLs presentes
  const urls = new Set<string>()
  collectUrls(S.lastTree[0]?.children ?? [], urls)
  if (await seedTagsIfEmpty(urls)) {
    toast(t('toastTagsSeeded'))
    if (S.viewMode === 'tags') {
      await rebuild(false)
      simulation?.tick(120)
      zoomToNodes(S.nodes, 80, 0)
    }
  }
}

void boot()
void refreshTabs
