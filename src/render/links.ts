import { linkColor, nodeColor } from '../graph/style'
import { curveCtrl, quadPoint, quadTangent } from '../lib/curve'
import { linkAlpha, linkWidth } from '../lib/render-rules'
import { strHash } from '../lib/utils'
import { COLORS, S } from '../state'
import type { GraphLink, GraphNode } from '../types'
import { ctx } from '../ui/dom'
import { type Viewport, visibleCurve } from './viewport'

const PARTICLE_PERIOD_MS = 2600

function drawHistoryArrow(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number, k: number): void {
  const u = 0.72
  const p = quadPoint(sx, sy, cx, cy, tx, ty, u)
  const d = quadTangent(sx, sy, cx, cy, tx, ty, u)
  const angle = Math.atan2(d.y, d.x)
  const size = 3.5 / k
  ctx.beginPath()
  ctx.moveTo(p.x + Math.cos(angle) * size, p.y + Math.sin(angle) * size)
  ctx.lineTo(p.x + Math.cos(angle + 2.5) * size, p.y + Math.sin(angle + 2.5) * size)
  ctx.lineTo(p.x + Math.cos(angle - 2.5) * size, p.y + Math.sin(angle - 2.5) * size)
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
}

function drawLink(l: GraphLink, focus: Set<string> | null, k: number, vp: Viewport): void {
  const source = l.source as GraphNode
  const target = l.target as GraphNode
  const on = !!focus && focus.has(source.id) && focus.has(target.id)
  ctx.globalAlpha = linkAlpha(l.type, !!focus, on)
  ctx.strokeStyle = on ? COLORS.ink2 : linkColor(l)
  ctx.lineWidth = linkWidth(l.type) / k
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
  if (!visibleCurve(sx, sy, tx, ty, cx, cy, vp)) return
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cx, cy, tx, ty)
  ctx.stroke()
  if (l.type === 'history' && k >= 0.45) drawHistoryArrow(sx, sy, tx, ty, cx, cy, k)
}

export function drawLinks(focus: Set<string> | null, k: number, vp: Viewport): void {
  for (const l of S.links) drawLink(l, focus, k, vp)
}

function drawParticle(l: GraphLink, focus: Set<string> | null, k: number, now: number, vp: Viewport): void {
  const source = l.source as GraphNode
  const target = l.target as GraphNode
  const open = S.openTabs.has(target.id) ? target : S.openTabs.has(source.id) ? source : null
  if (!open) return
  if (focus && !(focus.has(source.id) && focus.has(target.id))) return
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
  if (!visibleCurve(sx, sy, tx, ty, cx, cy, vp)) return
  const phase = (strHash(`${source.id}|${target.id}`) % 1000) / 1000
  const t = (now / PARTICLE_PERIOD_MS + phase) % 1
  const p = quadPoint(sx, sy, cx, cy, tx, ty, open === target ? t : 1 - t)
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1.1, 1.6 / k), 0, Math.PI * 2)
  ctx.fillStyle = nodeColor(open)
  ctx.fill()
}

export function drawParticles(focus: Set<string> | null, k: number, now: number, vp: Viewport): void {
  if (!S.openTabs.size) return
  for (const l of S.links) {
    if (l.type === 'tree') drawParticle(l, focus, k, now, vp)
  }
}
