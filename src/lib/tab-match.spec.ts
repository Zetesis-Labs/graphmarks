import { describe, expect, it } from 'vitest'
import { matchTabsToBookmarks, summarizeWindows } from './tab-match'

const bms = [
  { id: 'root', mHost: 'github.com', mPath: '/' },
  { id: 'repo', mHost: 'github.com', mPath: '/acme/webapp' }
]

describe('summarizeWindows', () => {
  it('cuenta pestañas http(s) por ventana y toma el título de la activa', () => {
    const out = summarizeWindows([
      { windowId: 2, url: 'https://a.com', title: 'A' },
      { windowId: 1, url: 'https://b.com', title: 'B', active: true },
      { windowId: 1, url: 'chrome://settings' },
      { windowId: 1, url: 'https://c.com' }
    ])
    expect(out).toEqual([
      { id: 1, count: 2, title: 'B' },
      { id: 2, count: 1, title: '' }
    ])
  })
})

describe('matchTabsToBookmarks', () => {
  it('ancla cada pestaña a su marcador más específico y ordena por recencia', () => {
    const { map, ghosts } = matchTabsToBookmarks(
      [
        { id: 1, url: 'https://github.com/acme/webapp/pull/1', title: 'PR', lastAccessed: 5 },
        { id: 2, url: 'https://github.com/acme/webapp', title: 'Repo', lastAccessed: 9 },
        { id: 3, url: 'https://github.com/otros', title: 'Otro', lastAccessed: 1 },
        { id: 4, url: 'https://desconocida.dev', title: 'Ghost' }
      ],
      bms
    )
    expect(map.get('repo')?.map(t => t.id)).toEqual([2, 1])
    expect(map.get('root')?.map(t => t.id)).toEqual([3])
    expect(ghosts.map(t => t.id)).toEqual([4])
  })

  it('ignora URLs no http y las que no parsean', () => {
    const { map, ghosts } = matchTabsToBookmarks([{ url: 'chrome://x' }, { url: '' }], bms)
    expect(map.size).toBe(0)
    expect(ghosts).toEqual([])
  })
})
