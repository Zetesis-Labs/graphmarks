/** Encuadre de viewport: matemática pura del zoom-para-encajar. */

export interface FitTransform {
  k: number
  x: number
  y: number
}

/**
 * Escala y traslación que encajan los puntos en un lienzo `width`×`height`
 * con margen `pad`, ocupando el 95% y sin acercar más de `maxK`.
 */
export function fitTransform(
  points: ReadonlyArray<{ x?: number; y?: number }>,
  width: number,
  height: number,
  pad = 60,
  maxK = 4
): FitTransform | null {
  if (!points.length) return null
  const xs = points.map(p => p.x ?? 0)
  const ys = points.map(p => p.y ?? 0)
  const x0 = Math.min(...xs) - pad
  const x1 = Math.max(...xs) + pad
  const y0 = Math.min(...ys) - pad
  const y1 = Math.max(...ys) + pad
  const k = Math.min(maxK, 0.95 / Math.max((x1 - x0) / width, (y1 - y0) / height))
  return { k, x: width / 2 - (k * (x0 + x1)) / 2, y: height / 2 - (k * (y0 + y1)) / 2 }
}
