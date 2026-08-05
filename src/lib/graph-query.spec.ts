import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../types'
import { GraphIndex } from './graph-index'
import { evaluateGraphQuery, parseGraphQuery } from './graph-query'

describe('graph-query', () => {
  const nodes: GraphNode[] = [
    {
      id: '1',
      type: 'bm',
      title: 'GitHub GraphMarks',
      url: 'https://github.com/graphmarks',
      mHost: 'github.com',
      tags: ['dev', 'tools'],
      count: 15,
      heat: 0.9
    },
    {
      id: '2',
      type: 'bm',
      title: 'Vite Build Tool',
      url: 'https://vitejs.dev',
      mHost: 'vitejs.dev',
      tags: ['dev', 'build'],
      count: 3,
      heat: 0.4
    },
    {
      id: '3',
      type: 'ghost',
      title: 'Google Search',
      url: 'https://google.com',
      mHost: 'google.com',
      tags: [],
      count: 0,
      heat: 0.1
    }
  ]

  const index = new GraphIndex(nodes, [])

  it('parsea tokens de consulta correctamente', () => {
    const ast = parseGraphQuery('tag:dev is:open visits:>5 sort:heat limit:10')

    expect(ast.conditions).toEqual([
      { field: 'tag', operator: 'eq', value: 'dev' },
      { field: 'is', operator: 'eq', value: 'open' },
      { field: 'visits', operator: 'gt', value: 5 }
    ])
    expect(ast.sort).toEqual({ field: 'heat', order: 'desc' })
    expect(ast.limit).toBe(10)
  })

  it('evalúa consultas de filtro por tag y visitas', () => {
    const ast = parseGraphQuery('tag:dev visits:>5')
    const res = evaluateGraphQuery(ast, index)

    expect(res).toHaveLength(1)
    expect(res[0]?.id).toBe('1')
  })

  it('evalúa consultas con ordenación y límite', () => {
    const ast = parseGraphQuery('tag:dev sort:heat limit:1')
    const res = evaluateGraphQuery(ast, index)

    expect(res).toHaveLength(1)
    expect(res[0]?.id).toBe('1')
  })

  it('evalúa flag de estado is:ghost', () => {
    const ast = parseGraphQuery('is:ghost')
    const res = evaluateGraphQuery(ast, index)

    expect(res).toHaveLength(1)
    expect(res[0]?.id).toBe('3')
  })
})
