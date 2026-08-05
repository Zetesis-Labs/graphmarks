import { describe, expect, it } from 'vitest'
import type { RawBookmarkNode } from '../types'
import { bmCount, bookmarkUrlKeys, clusterDepth, hostPairs } from './graph-shape'

const bm = (id: string): RawBookmarkNode => ({ id, title: id, url: `https://x.com/${id}` })
const folder = (id: string, children: RawBookmarkNode[]): RawBookmarkNode => ({ id, title: id, children })

describe('bmCount', () => {
  it('cuenta marcadores recursivamente', () => {
    expect(bmCount(folder('f', [bm('a'), folder('g', [bm('b'), bm('c')])]))).toBe(3)
    expect(bmCount(folder('vacia', []))).toBe(0)
  })
})

describe('bookmarkUrlKeys', () => {
  it('recoge las claves canónicas de todo el árbol', () => {
    const tree = [
      folder('raiz', [
        { id: 'a', title: 'a', url: 'https://a.com/x?utm_source=tw' },
        folder('sub', [{ id: 'b', title: 'b', url: 'https://b.com/' }])
      ])
    ]
    const keys = bookmarkUrlKeys(tree)
    expect(keys.has('https://a.com/x')).toBe(true)
    expect(keys.has('https://b.com/')).toBe(true)
    expect(keys.size).toBe(2)
  })
})

describe('clusterDepth', () => {
  it('corta en el primer nivel con dos carpetas con contenido', () => {
    const roots = [folder('a', [bm('1')]), folder('b', [bm('2')])]
    expect(clusterDepth(roots)).toBe(1)
  })

  it('baja un nivel cuando solo hay un contenedor arriba', () => {
    const roots = [folder('unica', [folder('a', [bm('1')]), folder('b', [bm('2')])])]
    expect(clusterDepth(roots)).toBe(2)
  })

  it('ignora carpetas vacías al contar', () => {
    const roots = [folder('a', [bm('1')]), folder('vacia', [])]
    expect(clusterDepth(roots)).toBe(1)
  })
})

describe('hostPairs', () => {
  it('conecta en parejas los grupos de 2 a 6 del mismo host', () => {
    const pairs = hostPairs([
      { id: 'a', host: 'x.com' },
      { id: 'b', host: 'x.com' },
      { id: 'c', host: 'x.com' },
      { id: 'solo', host: 'y.com' },
      { id: 'sin' }
    ])
    expect(pairs).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c']
    ])
  })

  it('descarta los grupos de más de 6 (ruido visual)', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, host: 'x.com' }))
    expect(hostPairs(many)).toEqual([])
  })
})
