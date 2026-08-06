import { describe, expect, it } from 'vitest'
import type { RawBookmarkNode } from '../types'
import { flattenFolders } from './folder-options'

const tree: RawBookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Barra',
        children: [
          { id: '10', title: 'Dev', children: [{ id: '11', title: '', children: [] }] },
          { id: '12', title: 'x', url: 'https://x.com' }
        ]
      },
      { id: '2', title: 'Otros', children: [] }
    ]
  }
]

describe('flattenFolders', () => {
  it('aplana en preorden con profundidad y sin marcadores', () => {
    expect(flattenFolders(tree, '(sin nombre)')).toEqual([
      { id: '1', title: 'Barra', depth: 0 },
      { id: '10', title: 'Dev', depth: 1 },
      { id: '11', title: '(sin nombre)', depth: 2 },
      { id: '2', title: 'Otros', depth: 0 }
    ])
  })

  it('un id excluido poda su subárbol entero', () => {
    expect(flattenFolders(tree, '·', new Set(['10'])).map(f => f.id)).toEqual(['1', '2'])
  })
})
