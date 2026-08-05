import { describe, expect, it } from 'vitest'
import { placePopover, unionRects } from './tour-place'

const vp = { w: 1000, h: 600 }
const pop = { w: 300, h: 120 }

describe('placePopover', () => {
  it('sin objetivo, centra en el viewport', () => {
    expect(placePopover(null, pop, vp)).toEqual({ x: 350, y: 240 })
  })

  it('prefiere colocarse debajo, centrado sobre el objetivo', () => {
    const p = placePopover({ x: 400, y: 100, w: 200, h: 40 }, pop, vp)
    expect(p).toEqual({ x: 350, y: 152 })
  })

  it('si no cabe debajo, va encima', () => {
    const p = placePopover({ x: 400, y: 520, w: 200, h: 40 }, pop, vp)
    expect(p.y).toBe(520 - 12 - 120)
  })

  it('pegado a un borde no se sale del viewport', () => {
    const p = placePopover({ x: 0, y: 10, w: 40, h: 20 }, pop, vp)
    expect(p.x).toBe(8)
  })

  it('sin hueco vertical se coloca a un lado', () => {
    const p = placePopover({ x: 100, y: 60, w: 200, h: 480 }, pop, vp)
    expect(p.x).toBe(100 + 200 + 12)
  })
})

describe('unionRects', () => {
  it('envuelve ambos rects', () => {
    expect(unionRects({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 20 })).toEqual({
      x: 0,
      y: 0,
      w: 30,
      h: 25
    })
  })

  it('tolera que falte cualquiera de los dos', () => {
    const r = { x: 1, y: 2, w: 3, h: 4 }
    expect(unionRects(r, null)).toEqual(r)
    expect(unionRects(null, r)).toEqual(r)
    expect(unionRects(null, null)).toBeNull()
  })
})
