import { radius } from '../graph/style'
import { S } from '../state'
import type { GraphNode } from '../types'
import { canvas } from '../ui/dom'

const VIEWPORT_PAD = 80

export interface Viewport {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function viewport(k: number): Viewport {
  const pad = VIEWPORT_PAD / k
  return {
    x0: -S.tf.x / k - pad,
    y0: -S.tf.y / k - pad,
    x1: (canvas.clientWidth - S.tf.x) / k + pad,
    y1: (canvas.clientHeight - S.tf.y) / k + pad
  }
}

export function contains(vp: Viewport, x: number, y: number, pad = 0): boolean {
  return x >= vp.x0 - pad && x <= vp.x1 + pad && y >= vp.y0 - pad && y <= vp.y1 + pad
}

export function visibleNode(n: GraphNode, vp: Viewport): boolean {
  return contains(vp, n.x ?? 0, n.y ?? 0, radius(n) + 16)
}

export function visibleCurve(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  cx: number,
  cy: number,
  vp: Viewport
): boolean {
  return !(
    Math.max(sx, tx, cx) < vp.x0 ||
    Math.min(sx, tx, cx) > vp.x1 ||
    Math.max(sy, ty, cy) < vp.y0 ||
    Math.min(sy, ty, cy) > vp.y1
  )
}
