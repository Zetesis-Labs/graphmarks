import { describe, expect, it } from 'vitest'
import { curveCtrl, quadPoint, quadTangent } from './curve'

describe('curveCtrl', () => {
  it('desplaza el control en perpendicular según el tipo de arista', () => {
    const tree = curveCtrl(0, 0, 100, 0, 'tree')
    const host = curveCtrl(0, 0, 100, 0, 'host')
    expect(tree.cx).toBe(50)
    expect(tree.cy).toBe(12)
    expect(host.cy).toBe(22)
  })

  it('el signo es estable al invertir extremos', () => {
    const ab = curveCtrl(0, 0, 100, 0, 'tree')
    const ba = curveCtrl(100, 0, 0, 0, 'tree')
    expect(ab.cy).toBe(-ba.cy)
  })
})

describe('quadPoint', () => {
  it('empieza en el origen y acaba en el destino', () => {
    expect(quadPoint(0, 0, 50, 12, 100, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(quadPoint(0, 0, 50, 12, 100, 0, 1)).toEqual({ x: 100, y: 0 })
  })

  it('a mitad de camino pasa por el punto medio ponderado', () => {
    expect(quadPoint(0, 0, 50, 12, 100, 0, 0.5)).toEqual({ x: 50, y: 6 })
  })
})

describe('quadTangent', () => {
  it('apunta del origen al control al salir y del control al destino al llegar', () => {
    expect(quadTangent(0, 0, 50, 12, 100, 0, 0)).toEqual({ x: 100, y: 24 })
    expect(quadTangent(0, 0, 50, 12, 100, 0, 1)).toEqual({ x: 100, y: -24 })
  })
})
