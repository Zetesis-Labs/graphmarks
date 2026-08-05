import { describe, expect, it } from 'vitest'
import { aggregateVisitHeat, matchTabsToBookmarks, summarizeWindows } from './tab-match'

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

describe('aggregateVisitHeat', () => {
  it('acumula visitas sobre el marcador más específico y recuerda la última', () => {
    const agg = aggregateVisitHeat(
      [
        { url: 'https://github.com/acme/webapp/pull/1', visitCount: 3, lastVisitTime: 100 },
        { url: 'https://github.com/acme/webapp', visitCount: 2, lastVisitTime: 50 },
        { url: 'https://otro.dev/x', visitCount: 9 }
      ],
      [{ id: 'repo', url: 'https://github.com/acme/webapp', mHost: 'github.com', mPath: '/acme/webapp' }]
    )
    expect(agg.get('https://github.com/acme/webapp')).toEqual({ v: 5, last: 100 })
    expect(agg.size).toBe(1)
  })

  it('recorta las visitas extremas a 50 por página', () => {
    const agg = aggregateVisitHeat(
      [{ url: 'https://a.com/', visitCount: 500, lastVisitTime: 1 }],
      [{ id: 'a', url: 'https://a.com/', mHost: 'a.com', mPath: '/' }]
    )
    expect(agg.get('https://a.com/')?.v).toBe(50)
  })
})
