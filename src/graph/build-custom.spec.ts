import { beforeEach, describe, expect, it } from 'vitest'
import { S } from '../state'
import type { RawBookmarkNode } from '../types'
import { getStrategy } from '../view-strategy'
import { buildCustomGraph } from './build-custom'

describe('build-custom', () => {
  const tree: RawBookmarkNode[] = [
    {
      id: 'root',
      title: 'Marcadores',
      children: [
        {
          id: 'f1',
          title: 'Work',
          children: [
            { id: 'b1', title: 'GitHub', url: 'https://github.com' },
            { id: 'b2', title: 'Vite', url: 'https://vitejs.dev' }
          ]
        },
        {
          id: 'f2',
          title: 'Personal',
          children: [{ id: 'b3', title: 'Reddit', url: 'https://reddit.com' }]
        }
      ]
    }
  ]

  beforeEach(() => {
    S.viewMode = 'folders'
    S.strategy = getStrategy('folders')
    S.folderPrefs = {}
    S.activeSubgraph = null
    S.expandedFolders = new Set()
    S.tagsMap = { 'https://github.com': ['dev'] }
    S.openTabs = new Map()
    S.pinned = {}
    S.heatByUrl = new Map()
  })

  it('construye un grafo conectado conservando carpetas ancestras para coincidencias', () => {
    buildCustomGraph(tree, 'tag:dev')

    expect(S.nodes.map(n => n.title)).toContain('GitHub')
    expect(S.nodes.map(n => n.title)).toContain('Work')
    expect(S.nodes.map(n => n.title)).not.toContain('Personal')
    expect(S.nodes.map(n => n.title)).not.toContain('Reddit')

    // Verificar que los enlaces de árbol conectan la carpeta con el marcador
    const bmNode = S.nodes.find(n => n.title === 'GitHub')
    expect(bmNode?.parentId).toBe('f1')
  })
})
