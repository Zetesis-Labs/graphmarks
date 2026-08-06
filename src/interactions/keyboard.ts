import { app } from '../bus'
import { members } from '../graph/build'
import { findNearestNodeInDirection, findNextSequentialNode } from '../lib/spatial-nav'
import { S } from '../state'
import { activateTab } from '../tabs'
import type { GraphNode } from '../types'
import { canvas, dlg, menuEl, searchBox } from '../ui/dom'
import { showMenu } from '../ui/menu'
import { nodeMenu } from './menus'
import { expandCollapsed, openSubgraph } from './subgraph'
import { zoomToNodes } from './zoom-pan'

export function setKeyboardFocus(n: GraphNode | null, autoPan = true): void {
  S.keyboardFocusNode = n
  if (n && autoPan) {
    zoomToNodes([n], 120, 250)
  }
  app.requestDraw()
}

function handleArrowNav(key: string, candidates: GraphNode[]): boolean {
  const dir = key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : key === 'ArrowUp' ? 'up' : 'down'
  const current = S.keyboardFocusNode ?? candidates[0]
  if (!current) return false
  const next = findNearestNodeInDirection(current, candidates, dir)
  if (next) setKeyboardFocus(next, true)
  return true
}

function handleEnterKey(n: GraphNode): void {
  if (n.type === 'ghost') {
    if (n.tab) void activateTab(n.tab)
    return
  }
  if (n.type === 'bm') {
    const open = S.openTabs.get(n.id)
    const first = open?.[0]
    if (first) void activateTab(first)
    else window.location.href = n.url ?? ''
    return
  }
  if (n.raw && S.folderPrefs[n.raw]?.subgraph && S.activeSubgraph !== n.raw) openSubgraph(n)
  else if (n.collapsed) expandCollapsed(n)
  else zoomToNodes(members(n), 90)
}

function handleSpaceKey(n: GraphNode): void {
  const rect = canvas.getBoundingClientRect()
  const px = (n.x ?? 0) * S.tf.k + S.tf.x + rect.left
  const py = (n.y ?? 0) * S.tf.k + S.tf.y + rect.top
  showMenu(px, py, nodeMenu(n))
}

export function handleKeyboardNav(ev: KeyboardEvent): boolean {
  if (dlg.open || !menuEl.hidden) return false
  const active = document.activeElement
  const typing = active === searchBox || /^(INPUT|SELECT|TEXTAREA)$/.test(active?.tagName ?? '')
  if (typing) return false

  const candidates = S.nodes.filter(n => n.x !== undefined && n.y !== undefined)
  if (!candidates.length) return false

  if (ev.key === 'Tab') {
    ev.preventDefault()
    setKeyboardFocus(findNextSequentialNode(S.keyboardFocusNode, candidates, ev.shiftKey), true)
    return true
  }

  if (ev.key.startsWith('Arrow')) {
    ev.preventDefault()
    return handleArrowNav(ev.key, candidates)
  }

  if (ev.key === 'Enter' && S.keyboardFocusNode) {
    ev.preventDefault()
    handleEnterKey(S.keyboardFocusNode)
    return true
  }

  if (ev.key === ' ' && S.keyboardFocusNode) {
    ev.preventDefault()
    handleSpaceKey(S.keyboardFocusNode)
    return true
  }

  if (ev.key === 'Escape' && S.keyboardFocusNode) {
    setKeyboardFocus(null, false)
    return true
  }

  return false
}
