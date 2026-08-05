import { type D3DragEvent, drag as d3drag } from 'd3-drag'
import { pointer, select } from 'd3-selection'
import 'd3-transition'
import { type D3ZoomEvent, zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import { app } from './bus'
import { UNTAGGED } from './constants'
import { customIcon, hasCustomColor, pickColor, pickIcon, removeColor, removeIcon } from './custom'
import {
  confirmDelete,
  promptAdopt,
  promptMove,
  promptNewBookmark,
  promptNewFolder,
  promptRename,
  promptTagFolder,
  promptTags,
  promptUrl
} from './dialogs'
import { members } from './graph/build'
import { findAt, findFolderAt, findHit } from './graph/hit'
import { simulation } from './graph/simulation'
import { nodeColor, radius } from './graph/style'
import { t } from './i18n'
import { dropExclusions } from './lib/drop-rules'
import { fitTransform } from './lib/fit'
import { saveStore } from './lib/storage'
import { invalidateGraphGeometry } from './render'
import { pinsOfView, S, saveLayoutSoon } from './state'
import { activateTab, closeTab } from './tabs'
import { exportData, importData } from './transfer'
import type { GraphNode, MenuItem } from './types'
import { canvas, dlg, menuEl, tooltip } from './ui/dom'
import { hideMenu, showMenu } from './ui/menu'
import { toast } from './ui/toast'

/** Tipos de nodo que se convierten en marcador al soltarlos sobre un destino. */
const ADOPTABLE = new Set<string>(['ghost'])

export const zoom = d3zoom<HTMLCanvasElement, unknown>()
  .scaleExtent([0.15, 5])
  .filter(ev => {
    if (ev.type === 'mousedown' || ev.type === 'touchstart') {
      const [px, py] = pointer(ev, canvas)
      return !findHit(px, py).node
    }
    return !(ev as MouseEvent).button
  })
  .on('zoom', (ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
    S.tf = ev.transform
    app.requestDraw()
  })

export function zoomToNodes(list: GraphNode[], pad = 60, duration = 550): void {
  const fit = fitTransform(list, canvas.clientWidth, canvas.clientHeight, pad)
  if (!fit) return
  const t = zoomIdentity.translate(fit.x, fit.y).scale(fit.k)
  select(canvas).transition().duration(duration).call(zoom.transform, t)
}

export function resetZoom(): void {
  S.tf = zoomIdentity.translate(canvas.clientWidth / 2, canvas.clientHeight / 2)
  select(canvas).call(zoom.transform, S.tf)
}

/* --- soltado: mover carpeta, etiquetar o adoptar pestaña --- */

function dropExcludes(subject: GraphNode): Set<string> | null {
  return dropExclusions(
    S.viewMode,
    {
      id: subject.id,
      isBookmark: subject.type === 'bm',
      isAdoptable: ADOPTABLE.has(subject.type),
      parentId: subject.parentId ?? null,
      hubs: subject.hubs ?? [],
      folderMemberIds: subject.type === 'folder' ? members(subject).map(m => m.id) : []
    },
    UNTAGGED
  )
}

function handleDrop(subj: GraphNode, target: GraphNode): void {
  S.strategy.handleDrop(subj, target)
}

type DragEv = D3DragEvent<HTMLCanvasElement, unknown, GraphNode>

export const drag = d3drag<HTMLCanvasElement, unknown>()
  .subject(ev => {
    const h = findHit(ev.x, ev.y)
    return h.aux ? null : h.node // los satélites no se arrastran
  })
  .on('start', (ev: DragEv) => {
    canvas.classList.add('dragging')
    hideMenu()
    if (!ev.active) simulation?.alphaTarget(0.25).restart()
    ev.subject.fx = ev.subject.x
    ev.subject.fy = ev.subject.y
  })
  .on('drag', (ev: DragEv) => {
    const [px, py] = pointer(ev, canvas)
    const [x, y] = S.tf.invert([px, py])
    ev.subject.fx = x
    ev.subject.fy = y
    invalidateGraphGeometry()
    const ex = dropExcludes(ev.subject)
    S.dropTarget = ex ? findFolderAt(px, py, ex) : null
    app.requestDraw()
  })
  .on('end', (ev: DragEv) => {
    canvas.classList.remove('dragging')
    if (!ev.active) simulation?.alphaTarget(0)
    if (!S.dropTarget) {
      // arrastrar fija el nodo: layout manual persistente por vista
      ev.subject.fx = ev.subject.x
      ev.subject.fy = ev.subject.y
      pinsOfView()[ev.subject.id] = { x: ev.subject.x ?? 0, y: ev.subject.y ?? 0 }
      saveLayoutSoon()
    } else {
      ev.subject.fx = null
      ev.subject.fy = null
      const target = S.dropTarget
      S.dropTarget = null
      handleDrop(ev.subject, target)
    }
    app.requestDraw()
  })

/* --- pin / layout manual --- */

function unpinNode(n: GraphNode): void {
  const pins = pinsOfView()
  if (!pins[n.id]) return
  delete pins[n.id]
  n.fx = null
  n.fy = null
  saveLayoutSoon()
  simulation?.alpha(0.25).restart()
}

function unpinAll(): void {
  S.pinned[S.viewMode] = {}
  for (const n of S.nodes) {
    n.fx = null
    n.fy = null
  }
  saveLayoutSoon()
  simulation?.alpha(0.5).restart()
  toast(t('toastUnpinAll'))
}

function pinItem(n: GraphNode): MenuItem[] {
  return pinsOfView()[n.id] ? [{ label: t('menuUnpin'), action: () => unpinNode(n) }] : []
}

/* --- subgrafos y carpetas plegadas --- */

async function rebuildAround(id?: string): Promise<void> {
  await app.rebuild(false)
  const n = id ? S.byId.get(id) : undefined
  zoomToNodes(n ? members(n) : S.nodes, n ? 90 : 80)
}

export function closeSubgraph(): void {
  if (!S.activeSubgraph) return
  S.activeSubgraph = null
  void rebuildAround()
}

function openSubgraph(n: GraphNode): void {
  if (!n.raw || S.activeSubgraph === n.raw) {
    zoomToNodes(members(n), 90)
    return
  }
  S.activeSubgraph = n.raw
  void rebuildAround(n.id)
}

function expandCollapsed(n: GraphNode): void {
  if (!n.raw) return
  S.expandedFolders.add(n.raw)
  void rebuildAround(n.id)
}

function setFolderMode(n: GraphNode, mode: 'subgraph' | 'collapsed' | null): void {
  const raw = n.raw
  if (!raw) return
  if (mode) S.folderPrefs[raw] = { [mode]: true }
  else delete S.folderPrefs[raw]
  S.expandedFolders.delete(raw)
  if (S.activeSubgraph === raw && mode !== 'subgraph') S.activeSubgraph = null
  void (async () => {
    await saveStore('folderPrefs', S.folderPrefs)
    await rebuildAround()
  })()
}

function folderPresentationItems(n: GraphNode): MenuItem[] {
  const raw = n.raw
  if (!raw || !S.strategy.supportsPresentation) return []
  const pref = S.folderPrefs[raw]
  const items: MenuItem[] = [{ sep: true }]

  if (pref?.subgraph) {
    if (S.activeSubgraph !== raw) items.push({ label: t('menuOpenSubgraph'), action: () => openSubgraph(n) })
    else items.push({ label: t('menuBackToGraph'), action: () => closeSubgraph() })
    items.push({ label: t('menuRemoveSubgraph'), action: () => setFolderMode(n, null) })
  } else {
    items.push({ label: t('menuMakeSubgraph'), action: () => setFolderMode(n, 'subgraph') })
  }

  if (pref?.collapsed) {
    if (n.collapsed) items.push({ label: t('menuExpandTemporarily'), action: () => expandCollapsed(n) })
    else {
      items.push({
        label: t('menuCollapseNow'),
        action: () => {
          S.expandedFolders.delete(raw)
          void rebuildAround()
        }
      })
    }
    items.push({ label: t('menuDontCollapseByDefault'), action: () => setFolderMode(n, null) })
  } else {
    items.push({ label: t('menuCollapseByDefault'), action: () => setFolderMode(n, 'collapsed') })
  }
  return items
}

/* --- tooltip --- */

interface TooltipContent {
  title: string
  sub: string
  tagLine: string
}

function bmTooltipContent(n: GraphNode): TooltipContent {
  let sub = n.url ?? ''
  if (n.history) {
    const visits = n.historyVisits ?? 1
    sub += `  ·  ${visits === 1 ? t('historyVisitOne') : t('historyVisits', visits)}`
    if (n.unsaved) sub += `  ·  ${t('historyUnsavedBadge')}`
  }
  const open = S.openTabs.get(n.id)
  if (open?.length) sub += `  ·  ${open.length === 1 ? t('tooltipOpenCountOne') : t('tooltipOpenCount', open.length)}`
  return { title: n.title, sub, tagLine: n.tags?.length ? n.tags.map(tag => `#${tag}`).join('  ') : '' }
}

function folderTooltipSub(n: GraphNode): string {
  const pref = n.raw ? S.folderPrefs[n.raw] : undefined
  if (pref?.subgraph && S.activeSubgraph !== n.raw) return t('tooltipOpenSubgraph', n.count ?? 0)
  if (n.collapsed) return t('tooltipExpandFolder', n.count ?? 0)
  return t('tooltipBookmarks', n.count ?? 0)
}

function tooltipContent(n: GraphNode, aux: ReturnType<typeof findHit>['aux']): TooltipContent {
  if (aux?.type === 'sat') return { title: aux.tab.title, sub: t('tooltipGoToTab'), tagLine: '' }
  if (aux?.type === 'back') return { title: t('menuBackToGraph'), sub: t('tooltipBackToGraph'), tagLine: '' }
  if (aux?.type === 'plus') return { title: t('tooltipOpenNewTab'), sub: n.url ?? '', tagLine: '' }
  if (n.type === 'bm') return bmTooltipContent(n)
  if (n.type === 'ghost') return { title: n.title, sub: n.url ?? '', tagLine: '' }
  return { title: n.title, sub: folderTooltipSub(n), tagLine: '' }
}

function placeTooltip(ev: MouseEvent): void {
  const pad = 14
  let x = ev.clientX + pad
  let y = ev.clientY + pad
  const r = tooltip.getBoundingClientRect()
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad
  tooltip.style.left = `${x}px`
  tooltip.style.top = `${y}px`
}

function updateTooltip(ev: MouseEvent, n: GraphNode, aux: ReturnType<typeof findHit>['aux']): void {
  tooltip.hidden = false
  const { title, sub, tagLine } = tooltipContent(n, aux)
  const span = (cls: string, text: string): HTMLSpanElement => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }
  const tagsEl = span('tags', tagLine)
  tagsEl.style.display = tagLine ? '' : 'none'
  tooltip.replaceChildren(span('t', title), span('u', sub), tagsEl)
  placeTooltip(ev)
}

/* --- menú contextual --- */

function backgroundMenu(): MenuItem[] {
  return [
    ...(S.activeSubgraph ? [{ label: t('menuBackToGraph'), action: () => closeSubgraph() }, { sep: true }] : []),
    { label: t('menuNewFolder'), action: () => promptNewFolder() },
    { label: t('menuNewBookmark'), action: () => promptNewBookmark() },
    { sep: true },
    {
      label: S.showGhosts ? t('menuHideGhosts') : t('menuShowGhosts'),
      action: () => {
        void (async () => {
          S.showGhosts = !S.showGhosts
          await saveStore('ghosts', S.showGhosts)
          app.rebuildSoon()
        })()
      }
    },
    { label: t('menuUnpinAll'), action: () => unpinAll() },
    { label: t('menuFrameEverything'), action: () => zoomToNodes(S.nodes, 80) },
    { sep: true },
    { label: t('menuExport'), action: () => exportData() },
    { label: t('menuImport'), action: () => importData() },
    { sep: true },
    { label: t('menuShowGuide'), action: () => app.startGuide() }
  ]
}

function goToOpenItems(n: GraphNode): MenuItem[] {
  const open = S.openTabs.get(n.id) ?? []
  if (!open.length) return []
  return [
    {
      label: open.length > 1 ? t('menuGoToOpenTabs', open.length) : t('menuGoToOpenTab'),
      action: () => {
        const first = open[0]
        if (first) void activateTab(first)
      }
    }
  ]
}

function historyBmMenu(n: GraphNode): MenuItem[] {
  return [
    ...goToOpenItems(n),
    { label: t('menuOpen'), action: () => (window.location.href = n.url ?? '') },
    { label: t('menuOpenNewTab'), action: () => window.open(n.url ?? '') },
    { sep: true },
    { label: t('menuSaveAsBookmark'), action: () => promptAdopt(n) },
    ...pinItem(n)
  ]
}

function bmMenu(n: GraphNode): MenuItem[] {
  return [
    ...goToOpenItems(n),
    {
      label: t('menuOpen'),
      action: () => {
        window.location.href = n.url ?? ''
      }
    },
    { label: t('menuOpenNewTab'), action: () => window.open(n.url ?? '') },
    { sep: true },
    { label: t('menuTags'), action: () => promptTags(n) },
    { label: t('menuRename'), action: () => promptRename(n) },
    { label: t('menuEditUrl'), action: () => promptUrl(n) },
    { label: t('menuMoveToFolder'), action: () => promptMove(n) },
    { label: t('menuCustomIcon'), action: () => pickIcon(n) },
    ...(customIcon(n) ? [{ label: t('menuCustomIconRemove'), action: () => void removeIcon(n) }] : []),
    ...pinItem(n),
    { sep: true },
    { label: t('menuDelete'), danger: true, action: () => confirmDelete(n) }
  ]
}

function ghostMenu(n: GraphNode): MenuItem[] {
  return [
    { label: t('menuGoToTab'), action: () => n.tab && void activateTab(n.tab) },
    { label: t('menuSaveAsBookmark'), action: () => promptAdopt(n) },
    { sep: true },
    { label: t('menuCloseTab'), danger: true, action: () => n.tab && void closeTab(n.tab) }
  ]
}

export function nodeMenu(n: GraphNode): MenuItem[] {
  if (n.type === 'bm' && n.history) return historyBmMenu(n)
  if (n.type === 'bm') return bmMenu(n)
  if (n.type === 'ghost') return ghostMenu(n)
  if (
    n.subtype === 'ghosthub' ||
    n.subtype === 'domain' ||
    n.subtype === 'subdomain' ||
    n.subtype === 'path' ||
    n.subtype === 'tag'
  ) {
    return S.strategy.hubMenu?.(n) ?? [{ label: t('menuFrame'), action: () => zoomToNodes(members(n), 90) }]
  }
  return [
    { label: t('menuFrameCluster'), action: () => zoomToNodes(members(n), 90) },
    { sep: true },
    { label: t('menuRename'), action: () => promptRename(n) },
    { label: t('menuTagContents'), action: () => promptTagFolder(n) },
    { label: t('menuNewSubfolder'), action: () => promptNewFolder(n) },
    { label: t('menuNewBookmarkHere'), action: () => promptNewBookmark(n) },
    { label: t('menuMoveToFolder'), action: () => promptMove(n) },
    { sep: true },
    { label: t('menuFolderColor'), action: () => pickColor(n, nodeColor(n)) },
    ...(hasCustomColor(n) ? [{ label: t('menuFolderColorRemove'), action: () => void removeColor(n) }] : []),
    { label: t('menuCustomIcon'), action: () => pickIcon(n) },
    ...(customIcon(n) ? [{ label: t('menuCustomIconRemove'), action: () => void removeIcon(n) }] : []),
    ...pinItem(n),
    ...folderPresentationItems(n),
    { sep: true },
    { label: t('menuDeleteFolder', n.count ?? 0), danger: true, action: () => confirmDelete(n) }
  ]
}

/* --- clic principal: activar, abrir o navegar según el objetivo --- */

function handleAuxClick(n: GraphNode, aux: NonNullable<ReturnType<typeof findHit>['aux']>): void {
  if (aux.type === 'sat') void activateTab(aux.tab)
  else if (aux.type === 'back') closeSubgraph()
  else window.open(n.url ?? '')
}

function handleBmClick(n: GraphNode, ev: MouseEvent): void {
  if (ev.metaKey || ev.ctrlKey) {
    window.open(n.url ?? '')
    return
  }
  const first = S.openTabs.get(n.id)?.[0]
  if (first) void activateTab(first)
  else window.location.href = n.url ?? ''
}

function handleFolderClick(n: GraphNode): void {
  if (n.raw && S.folderPrefs[n.raw]?.subgraph && S.activeSubgraph !== n.raw) openSubgraph(n)
  else if (n.collapsed) expandCollapsed(n)
  else zoomToNodes(members(n), 90)
}

/* --- instalación --- */

export function initCanvasInteractions(): void {
  select(canvas).call(drag).call(zoom)

  canvas.addEventListener('mousemove', ev => {
    if (ev.buttons) return
    const h = findHit(ev.offsetX, ev.offsetY)
    const n = h.node
    const changed = n !== S.hoverNode || h.aux?.type !== S.hoverAux?.type
    S.hoverNode = n
    S.hoverAux = h.aux
    if (changed) {
      canvas.classList.toggle('pointing', !!n)
      app.requestDraw()
    }
    if (n) updateTooltip(ev, n, h.aux)
    else tooltip.hidden = true
  })

  canvas.addEventListener('mouseleave', () => {
    S.hoverNode = null
    S.hoverAux = null
    tooltip.hidden = true
    app.requestDraw()
  })

  canvas.addEventListener('click', ev => {
    if (!menuEl.hidden) {
      hideMenu()
      return
    }
    const h = findHit(ev.offsetX, ev.offsetY)
    const n = h.node
    if (!n) {
      app.clearSearch()
      return
    }
    if (h.aux) handleAuxClick(n, h.aux)
    else if (n.type === 'ghost') {
      if (n.tab) void activateTab(n.tab)
    } else if (n.type === 'bm') handleBmClick(n, ev)
    else handleFolderClick(n)
  })

  canvas.addEventListener('dblclick', ev => {
    const n = findAt(ev.offsetX, ev.offsetY)
    if (n?.type === 'folder') unpinNode(n)
  })

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault()
    tooltip.hidden = true
    const n = findAt(ev.offsetX, ev.offsetY)
    showMenu(ev.clientX, ev.clientY, n ? nodeMenu(n) : backgroundMenu())
  })

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !S.activeSubgraph || !menuEl.hidden || dlg.open) return
    closeSubgraph()
  })
}

export { radius }
