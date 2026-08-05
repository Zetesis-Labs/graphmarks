/** Colocación del popover de la visita guiada — geometría pura. */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  w: number
  h: number
}

/** Caja envolvente de dos rects; cualquiera de los dos puede faltar. */
export function unionRects(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/**
 * Preferencia: debajo del objetivo; si no cabe, encima; si tampoco, al lado.
 * Sin objetivo, centrado. Siempre dentro del viewport con 8px de margen.
 */
export function placePopover(target: Rect | null, pop: Size, vp: Size, gap = 12): { x: number; y: number } {
  if (!target) return { x: (vp.w - pop.w) / 2, y: (vp.h - pop.h) / 2 }
  const clampX = (x: number): number => Math.max(8, Math.min(x, vp.w - pop.w - 8))
  const clampY = (y: number): number => Math.max(8, Math.min(y, vp.h - pop.h - 8))
  const centered = clampX(target.x + target.w / 2 - pop.w / 2)
  const below = target.y + target.h + gap
  if (below + pop.h <= vp.h - 8) return { x: centered, y: below }
  const above = target.y - gap - pop.h
  if (above >= 8) return { x: centered, y: above }
  const right = target.x + target.w + gap
  if (right + pop.w <= vp.w - 8) return { x: right, y: clampY(target.y) }
  return { x: clampX(target.x - gap - pop.w), y: clampY(target.y) }
}
