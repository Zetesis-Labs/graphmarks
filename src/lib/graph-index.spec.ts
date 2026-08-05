import { describe, expect, it } from 'vitest'
import type { GraphLink, GraphNode } from '../types'
import { GraphIndex } from './graph-index'

describe('graph-index', () => {
  const nodes: GraphNode[] = [
    { id: '1', type: 'bm', title: 'GitHub', url: 'https://github.com', mHost: 'github.com', tags: ['dev', 'code'] },
    { id: '2', type: 'bm', title: 'Vite', url: 'https://vitejs.dev', mHost: 'vitejs.dev', tags: ['dev', 'build'] },
    { id: '3', type: 'folder', title: 'Work', folderId: 'root' }
  ]

  const links: GraphLink[] = [{ source: '1', target: '2', type: 'host' }]

  it('construye e indexa correctamente nodos, dominios y etiquetas', () => {
    const idx = new GraphIndex(nodes, links)

    expect(idx.nodeMap.size).toBe(3)
    expect(idx.graph.order).toBe(3)
    expect(idx.graph.size).toBe(1)

    expect(idx.tagIndex.get('dev')?.has('1')).toBe(true)
    expect(idx.tagIndex.get('dev')?.has('2')).toBe(true)
    expect(idx.domainIndex.get('github.com')?.has('1')).toBe(true)
  })

  it('calcula vecinos y grados correctamente', () => {
    const idx = new GraphIndex(nodes, links)

    expect(idx.getDegree('1')).toBe(1)
    expect(idx.getNeighbors('1').map(n => n.id)).toEqual(['2'])
    expect(idx.getDegree('3')).toBe(0)
  })

  it('filtra nodos mediante predicados', () => {
    const idx = new GraphIndex(nodes, links)
    const devNodes = idx.filterNodes(n => n.tags?.includes('dev') ?? false)

    expect(devNodes).toHaveLength(2)
  })
})
