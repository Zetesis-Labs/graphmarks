import { select } from 'd3-selection'
import { app } from './bus'
import { members } from './graph/build'
import { findAt, findHit } from './graph/hit'
import { radius } from './graph/style'
import { drag } from './interactions/drag-drop'
import { handleKeyboardNav, setKeyboardFocus } from './interactions/keyboard'
import { backgroundMenu, nodeMenu } from './interactions/menus'
import { pinItem, unpinAll, unpinNode } from './interactions/pins'
import { closeSubgraph, expandCollapsed, openSubgraph } from './interactions/subgraph'
import { updateTooltip } from './interactions/tooltip'
import { resetZoom, zoom, zoomToNodes } from './interactions/zoom-pan'
import { S } from './state'
import { activateTab } from './tabs'
import type { GraphNode } from './types'
import { canvas, dlg, menuEl, tooltip } from './ui/dom'
import { hideMenu, showMenu } from './ui/menu'

export {
  closeSubgraph,
  drag,
  nodeMenu,
  openSubgraph,
  pinItem,
  radius,
  resetZoom,
  setKeyboardFocus,
  unpinAll,
  unpinNode,
  zoom,
  zoomToNodes
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
    if (handleKeyboardNav(ev)) return
    if (ev.key !== 'Escape' || !S.activeSubgraph || !menuEl.hidden || dlg.open) return
    closeSubgraph()
  })
}
