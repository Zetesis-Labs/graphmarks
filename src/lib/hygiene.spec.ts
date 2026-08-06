import { describe, expect, it } from 'vitest'
import type { RawBookmarkNode } from '../types'
import { analyzeHygiene, duplicateRemovals, normalizeBookmarkUrl } from './hygiene'

const bm = (id: string, title: string, url: string): RawBookmarkNode => ({ id, title, url })
const folder = (id: string, title: string, children: RawBookmarkNode[] = []): RawBookmarkNode => ({
  id,
  title,
  children
})

const tree: RawBookmarkNode[] = [
  folder('0', '', [
    folder('1', 'Barra', [
      bm('10', 'Docs', 'https://ejemplo.com/docs'),
      bm('30', 'Docs (copia)', 'https://ejemplo.com/docs/#intro'),
      folder('11', 'Dev', [
        bm('12', 'Docs otra vez', 'https://ejemplo.com/docs/'),
        bm('13', 'Bookmarklet', 'javascript:void(0)')
      ]),
      folder('14', 'Vacía', [folder('15', 'Anidada vacía')])
    ]),
    folder('2', 'Otros', [
      folder('20', 'Solo bookmarklet', [bm('21', 'js', 'javascript:alert(1)')]),
      bm('22', 'Config', 'chrome://settings')
    ])
  ])
]

describe('normalizeBookmarkUrl', () => {
  it('iguala anclas y barra final, y deja intactas las URLs raras', () => {
    expect(normalizeBookmarkUrl('https://a.com/x/#top')).toBe(normalizeBookmarkUrl('https://a.com/x'))
    expect(normalizeBookmarkUrl('no-es-url')).toBe('no-es-url')
  })
})

describe('analyzeHygiene', () => {
  const report = analyzeHygiene(tree)

  it('agrupa duplicados por URL normalizada y cruza carpetas', () => {
    expect(report.duplicates).toHaveLength(1)
    expect(report.duplicates[0]?.items.map(i => i.id)).toEqual(['10', '12', '30'])
  })

  it('duplicateRemovals conserva el más antiguo', () => {
    expect(duplicateRemovals(report).map(i => i.id)).toEqual(['12', '30'])
  })

  it('lista solo la cima de las cadenas de carpetas vacías', () => {
    expect(report.emptyFolders.map(f => f.id)).toEqual(['14'])
  })

  it('una carpeta con solo bookmarklets no está vacía', () => {
    expect(report.emptyFolders.some(f => f.id === '20')).toBe(false)
  })

  it('detecta los marcadores invisibles con su ruta y posición', () => {
    expect(report.invisible.map(i => i.id)).toEqual(['13', '21', '22'])
    const js = report.invisible[0]
    expect(js?.path).toBe('Barra / Dev')
    expect(js?.parentId).toBe('11')
    expect(js?.index).toBe(1)
  })
})
