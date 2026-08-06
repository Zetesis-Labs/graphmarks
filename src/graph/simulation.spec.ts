import { beforeEach, describe, expect, it } from 'vitest'
import { S } from '../state'
import type { GraphNode } from '../types'
import { startSimulation, stopSimulation } from './simulation'

describe('simulation', () => {
  beforeEach(() => {
    S.nodes = [
      { id: '1', type: 'bm', title: 'Node 1' },
      { id: '2', type: 'folder', title: 'Node 2' }
    ] as GraphNode[]
    S.links = [{ source: '1', target: '2', type: 'tree' }]
    S.byId = new Map(S.nodes.map(n => [n.id, n]))
  })

  it('inicia la simulación sin errores', () => {
    expect(() => startSimulation(0.3)).not.toThrow()
    expect(() => stopSimulation()).not.toThrow()
  })
})
