import { describe, expect, it } from 'vitest'
import { splitSessions } from './history-sessions'

const MIN = 60_000

describe('splitSessions', () => {
  it('corta cuando el hueco supera el umbral', () => {
    const sessions = splitSessions(
      [
        { id: 'a', time: 0 },
        { id: 'b', time: 10 * MIN },
        { id: 'c', time: 50 * MIN },
        { id: 'a', time: 55 * MIN }
      ],
      30 * MIN
    )
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toEqual({ start: 0, end: 10 * MIN, ids: ['a', 'b'], visits: 2 })
    expect(sessions[1]).toEqual({ start: 50 * MIN, end: 55 * MIN, ids: ['c', 'a'], visits: 2 })
  })

  it('no repite ids dentro de una sesión pero cuenta cada visita', () => {
    const sessions = splitSessions(
      [
        { id: 'a', time: 0 },
        { id: 'a', time: MIN },
        { id: 'b', time: 2 * MIN }
      ],
      30 * MIN
    )
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.ids).toEqual(['a', 'b'])
    expect(sessions[0]?.visits).toBe(3)
  })

  it('ordena aunque los eventos lleguen desordenados', () => {
    const sessions = splitSessions(
      [
        { id: 'b', time: 5 * MIN },
        { id: 'a', time: 0 }
      ],
      30 * MIN
    )
    expect(sessions[0]?.ids).toEqual(['a', 'b'])
  })

  it('devuelve vacío sin eventos', () => {
    expect(splitSessions([])).toEqual([])
  })
})
