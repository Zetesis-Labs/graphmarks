import { zoomIdentity } from 'd3-zoom'
import { describe, expect, it } from 'vitest'
import { computeResizedTransform } from './viewport-resize'

describe('viewport-resize', () => {
  const initialTf = zoomIdentity.translate(100, 50).scale(2)

  it('conserva el punto central del mundo al agrandar la ventana', () => {
    const res = computeResizedTransform({
      oldW: 1000,
      oldH: 800,
      newW: 1400,
      newH: 1000,
      tf: initialTf
    })

    // (1400 - 1000) / 2 = +200 => x = 100 + 200 = 300
    // (1000 - 800) / 2 = +100 => y = 50 + 100 = 150
    expect(res.x).toBe(300)
    expect(res.y).toBe(150)
    expect(res.k).toBe(2)
  })

  it('mantiene un nodo enfocado exactamente en el centro de la nueva pantalla', () => {
    const res = computeResizedTransform({
      oldW: 1000,
      oldH: 800,
      newW: 1200,
      newH: 900,
      tf: initialTf,
      focusPoint: { x: 50, y: 50 }
    })

    // newX = 1200 / 2 - 50 * 2 = 600 - 100 = 500
    // newY = 900 / 2 - 50 * 2 = 450 - 100 = 350
    expect(res.x).toBe(500)
    expect(res.y).toBe(350)
    expect(res.k).toBe(2)
  })

  it('devuelve el mismo transform si las dimensiones no cambian', () => {
    const res = computeResizedTransform({
      oldW: 1000,
      oldH: 800,
      newW: 1000,
      newH: 800,
      tf: initialTf
    })
    expect(res).toBe(initialTf)
  })
})
