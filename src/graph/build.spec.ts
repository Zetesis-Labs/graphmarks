import { beforeEach, describe, expect, it } from 'vitest'
import { S } from '../state'
import type { GraphNode, TabInfo } from '../types'
import { applyFolderPresentation } from './presentation'

const folder = (id: string, parentId: string | null = null): GraphNode => ({
  id,
  raw: id,
  type: 'folder',
  title: id,
  count: 2,
  cluster: 'root',
  parentId
})

const bookmark = (id: string, parentId: string): GraphNode => ({
  id,
  raw: id.slice(1),
  type: 'bm',
  title: id,
  cluster: 'root',
  parentId,
  folderId: parentId
})

const openTab: TabInfo = {
  id: 1,
  windowId: 1,
  title: 'open',
  url: 'https://example.com',
  host: 'example.com',
  active: true,
  last: 1
}

function seedGraph(): void {
  const nodes = [
    folder('root'),
    folder('nested', 'root'),
    bookmark('bopen', 'nested'),
    bookmark('bclosed', 'nested'),
    folder('outside')
  ]
  S.nodes = nodes
  S.byId = new Map(nodes.map(n => [n.id, n]))
  S.links = [
    { source: 'root', target: 'nested', type: 'tree' },
    { source: 'nested', target: 'bopen', type: 'tree' },
    { source: 'nested', target: 'bclosed', type: 'tree' }
  ]
  S.clusters = [
    { id: 'root', title: 'root', count: 2, slot: 0 },
    { id: 'outside', title: 'outside', count: 0, slot: 1 }
  ]
  S.clusterOf = new Map(S.clusters.map(c => [c.id, c]))
  S.openTabs = new Map([['bopen', [openTab]]])
}

beforeEach(() => {
  S.viewMode = 'folders'
  S.folderPrefs = {}
  S.activeSubgraph = null
  S.expandedFolders = new Set()
  seedGraph()
})

describe('applyFolderPresentation', () => {
  it('promotes only open bookmarks out of a collapsed branch', () => {
    S.folderPrefs.root = { collapsed: true }

    applyFolderPresentation()

    expect(S.nodes.map(n => n.id)).toEqual(['root', 'bopen', 'outside'])
    expect(S.byId.get('root')?.collapsed).toBe(true)
    expect(S.byId.get('bopen')?.parentId).toBe('root')
    expect(S.links).toContainEqual({ source: 'root', target: 'bopen', type: 'tree' })
    expect(S.links.filter(l => l.target === 'bopen')).toHaveLength(1)
  })

  it('shows the complete branch inside its subgraph dashboard', () => {
    S.folderPrefs.root = { subgraph: true }
    S.activeSubgraph = 'root'

    applyFolderPresentation()

    expect(S.nodes.map(n => n.id)).toEqual(['root', 'nested', 'bopen', 'bclosed'])
    expect(S.byId.get('root')?.collapsed).toBe(false)
    expect(S.clusters.map(c => c.id)).toEqual(['root'])
  })

  it('honours a temporary expansion without changing the saved preference', () => {
    S.folderPrefs.root = { collapsed: true }
    S.expandedFolders.add('root')

    applyFolderPresentation()

    expect(S.nodes.map(n => n.id)).toEqual(['root', 'nested', 'bopen', 'bclosed', 'outside'])
    expect(S.folderPrefs.root).toEqual({ collapsed: true })
  })

  it('promotes open bookmarks to the outermost collapsed folder', () => {
    S.folderPrefs.root = { collapsed: true }
    S.folderPrefs.nested = { subgraph: true }

    applyFolderPresentation()

    expect(S.nodes.map(n => n.id)).toEqual(['root', 'bopen', 'outside'])
    expect(S.byId.get('bopen')?.parentId).toBe('root')
    expect(S.links).toContainEqual({ source: 'root', target: 'bopen', type: 'tree' })
  })
})
