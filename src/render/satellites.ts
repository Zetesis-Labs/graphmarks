import { BACK_R, PLUS_R, SAT_R } from '../constants'
import { backPosition, plusPosition, satPositions, satScale } from '../graph/hit'
import { nodeColor } from '../graph/style'
import { COLORS, S } from '../state'
import { ctx } from '../ui/dom'
import { type Viewport, visibleNode } from './viewport'

export function drawSatellites(focus: Set<string> | null, vp: Viewport): void {
  const inFocus = (id: string): boolean => !focus || focus.has(id)
  for (const id of S.openTabs.keys()) {
    const n = S.byId.get(id)
    if (!n) continue
    if (!visibleNode(n, vp)) continue
    ctx.globalAlpha = inFocus(n.id) ? 1 : 0.12
    const col = nodeColor(n)
    const ss = satScale()
    for (const s of satPositions(n)) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, SAT_R * ss, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.lineWidth = 1.2 * ss
      ctx.strokeStyle = COLORS.page
      ctx.stroke()
      if (s.tab.active) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1.4 * ss, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.page
        ctx.fill()
      }
    }
    if (S.hoverNode === n) {
      const p = plusPosition(n)
      ctx.beginPath()
      ctx.arc(p.x, p.y, PLUS_R * ss, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.surface
      ctx.fill()
      ctx.lineWidth = 1.5 * ss
      ctx.strokeStyle = col
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x - 2.4 * ss, p.y)
      ctx.lineTo(p.x + 2.4 * ss, p.y)
      ctx.moveTo(p.x, p.y - 2.4 * ss)
      ctx.lineTo(p.x, p.y + 2.4 * ss)
      ctx.strokeStyle = COLORS.ink
      ctx.lineWidth = 1.4 * ss
      ctx.stroke()
    }
  }
}

export function drawSubgraphBack(vp: Viewport): void {
  if (!S.activeSubgraph) return
  const root = S.byId.get(S.activeSubgraph)
  if (!root || !visibleNode(root, vp)) return
  const p = backPosition(root)
  const ss = satScale()
  const r = BACK_R * ss
  const col = nodeColor(root)

  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.surface
  ctx.fill()
  ctx.lineWidth = 1.5 * ss
  ctx.strokeStyle = col
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(p.x + 2.5 * ss, p.y)
  ctx.lineTo(p.x - 2.5 * ss, p.y)
  ctx.moveTo(p.x - 2.5 * ss, p.y)
  ctx.lineTo(p.x - 0.3 * ss, p.y - 2.2 * ss)
  ctx.moveTo(p.x - 2.5 * ss, p.y)
  ctx.lineTo(p.x - 0.3 * ss, p.y + 2.2 * ss)
  ctx.lineWidth = 1.5 * ss
  ctx.lineCap = 'round'
  ctx.strokeStyle = COLORS.ink
  ctx.stroke()
}
