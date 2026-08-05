import { describe, expect, it } from 'vitest'
import { fitTransform } from './fit'

describe('fitTransform', () => {
  it('centra el conjunto y lo encaja al 95% del lienzo', () => {
    const t = fitTransform(
      [
        { x: 0, y: 0 },
        { x: 900, y: 0 }
      ],
      1000,
      500,
      50
    )
    expect(t).not.toBeNull()
    if (!t) return
    expect(t.k).toBeCloseTo(0.95)
    expect(t.k * 450 + t.x).toBeCloseTo(500)
    expect(t.k * 0 + t.y).toBeCloseTo(250)
  })

  it('no acerca más del tope con conjuntos pequeños', () => {
    expect(fitTransform([{ x: 0, y: 0 }], 1000, 500, 50)?.k).toBe(4)
  })

  it('devuelve null sin puntos', () => {
    expect(fitTransform([], 800, 600)).toBeNull()
  })

  it('trata las coordenadas ausentes como origen', () => {
    const t = fitTransform([{}, { x: 100, y: 100 }], 1000, 1000, 0)
    expect(t).not.toBeNull()
    if (!t) return
    expect(t.k * 50 + t.x).toBeCloseTo(500)
    expect(t.k * 50 + t.y).toBeCloseTo(500)
  })
})
