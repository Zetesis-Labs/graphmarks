import { describe, expect, it } from 'vitest'
import { convexHull, type Pt } from './hull'

describe('convexHull', () => {
  it('devuelve los puntos tal cual con 2 o menos', () => {
    expect(convexHull([])).toEqual([])
    expect(convexHull([[1, 2]])).toEqual([[1, 2]])
    expect(
      convexHull([
        [0, 0],
        [3, 1]
      ])
    ).toHaveLength(2)
  })

  it('descarta puntos interiores', () => {
    const square: Pt[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [1, 3]
    ]
    const h = convexHull(square)
    expect(h).toHaveLength(4)
    expect(h).not.toContainEqual([2, 2])
  })

  it('colineales quedan reducidos a los extremos', () => {
    const h = convexHull([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3]
    ])
    expect(h).toHaveLength(2)
  })

  it('tolera duplicados', () => {
    const h = convexHull([
      [0, 0],
      [0, 0],
      [2, 0],
      [1, 2],
      [1, 2]
    ])
    expect(h).toHaveLength(3)
  })
})
