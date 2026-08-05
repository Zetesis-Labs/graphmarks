import { radius } from '../graph/style'
import { bmLabelVisible, folderLabelVisible } from '../lib/render-rules'
import { COLORS, S } from '../state'
import type { GraphNode } from '../types'
import { ctx } from '../ui/dom'
import { type Viewport, visibleNode } from './viewport'

function drawLabelHalo(x: number, y: number, text: string, k: number): void {
  ctx.lineWidth = 3 / k
  ctx.strokeStyle = COLORS.page
  ctx.strokeText(text, x, y)
}

function drawFolderLabel(n: GraphNode, k: number, focused: boolean, hasFocus: boolean): void {
  const minor = n.subtype === 'subdomain' || n.subtype === 'path'
  const isKeyFocused = n === S.keyboardFocusNode
  if (!isKeyFocused && !folderLabelVisible(minor, k, focused, hasFocus, n === S.hoverNode)) return
  const r = radius(n)
  ctx.globalAlpha = focused ? 1 : 0.5
  ctx.font = minor ? `${10 / k}px system-ui, sans-serif` : `600 ${12 / k}px system-ui, sans-serif`
  drawLabelHalo(n.x ?? 0, (n.y ?? 0) + r + 4 / k, n.title, k)
  ctx.fillStyle =
    n === S.hoverNode || n === S.dropTarget || isKeyFocused ? COLORS.ink : minor ? COLORS.muted : COLORS.ink2
  ctx.fillText(n.title, n.x ?? 0, (n.y ?? 0) + r + 4 / k)
}

function drawBmLabel(n: GraphNode, k: number, focused: boolean, hasFocus: boolean): void {
  const isKeyFocused = n === S.keyboardFocusNode
  if (
    !isKeyFocused &&
    !bmLabelVisible(k, n.type === 'ghost', focused, hasFocus, n === S.hoverNode, n === S.searchFocusNode)
  )
    return
  const r = radius(n)
  ctx.globalAlpha = 1
  ctx.font = `${10.5 / k}px system-ui, sans-serif`
  const label = n.title.length > 42 ? `${n.title.slice(0, 41)}…` : n.title
  drawLabelHalo(n.x ?? 0, (n.y ?? 0) + r + 3 / k, label, k)
  ctx.fillStyle = n === S.hoverNode || isKeyFocused ? COLORS.ink : COLORS.muted
  ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 3 / k)
}

export function drawLabels(focus: Set<string> | null, k: number, vp: Viewport): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const n of S.nodes) {
    if (!visibleNode(n, vp)) continue
    const focused = !focus || focus.has(n.id)
    if (n.type === 'folder') drawFolderLabel(n, k, focused, !!focus)
    else drawBmLabel(n, k, focused, !!focus)
  }
}
