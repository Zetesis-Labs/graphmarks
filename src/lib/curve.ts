import type { LinkKind } from '../types'

/** Geometría de las aristas curvas — la misma Bézier para trazo, flechas y partículas. */

/* El control se desplaza en perpendicular con signo fijo para que la curva
   no cambie de lado entre frames. */
export function curveCtrl(sx: number, sy: number, tx: number, ty: number, kind: LinkKind): { cx: number; cy: number } {
  const bend = kind === 'host' ? 0.22 : kind === 'history' ? 0.17 : 0.12
  return { cx: (sx + tx) / 2 - (ty - sy) * bend, cy: (sy + ty) / 2 + (tx - sx) * bend }
}

/** Punto de la Bézier cuadrática en u ∈ [0, 1]. */
export function quadPoint(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  u: number
): { x: number; y: number } {
  const v = 1 - u
  return { x: v * v * sx + 2 * v * u * cx + u * u * tx, y: v * v * sy + 2 * v * u * cy + u * u * ty }
}

/** Dirección (tangente) de la Bézier cuadrática en u ∈ [0, 1]. */
export function quadTangent(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  u: number
): { x: number; y: number } {
  const v = 1 - u
  return { x: 2 * (v * (cx - sx) + u * (tx - cx)), y: 2 * (v * (cy - sy) + u * (ty - cy)) }
}
