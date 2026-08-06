import { type ZoomTransform, zoomIdentity } from 'd3-zoom'

export interface ResizeParams {
  oldW: number
  oldH: number
  newW: number
  newH: number
  tf: ZoomTransform
  focusPoint?: { x: number; y: number } | null
}

/**
 * Calcula la nueva transformación del viewport (D3 ZoomTransform) al redimensionar la ventana,
 * de modo que el centro focal del mundo se conserve exactamente en el nuevo centro de la pantalla.
 */
export function computeResizedTransform(params: ResizeParams): ZoomTransform {
  const { oldW, oldH, newW, newH, tf, focusPoint } = params

  if (oldW <= 0 || oldH <= 0 || (newW === oldW && newH === oldH)) {
    return tf
  }

  if (focusPoint && focusPoint.x !== undefined && focusPoint.y !== undefined) {
    const newX = newW / 2 - focusPoint.x * tf.k
    const newY = newH / 2 - focusPoint.y * tf.k
    return zoomIdentity.translate(newX, newY).scale(tf.k)
  }

  const dx = (newW - oldW) / 2
  const dy = (newH - oldH) / 2
  return zoomIdentity.translate(tf.x + dx, tf.y + dy).scale(tf.k)
}
