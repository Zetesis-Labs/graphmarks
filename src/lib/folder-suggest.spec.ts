import { describe, expect, it } from 'vitest'
import type { RawBookmarkNode } from '../types'
import { suggestFolder } from './folder-suggest'

const bm = (id: string, url: string): RawBookmarkNode => ({ id, title: id, url })
const folder = (id: string, children: RawBookmarkNode[]): RawBookmarkNode => ({ id, title: id, children })

const tree: RawBookmarkNode[] = [
  folder('0', [
    folder('1', [
      folder('dev', [bm('a', 'https://github.com/acme/webapp'), bm('b', 'https://gist.github.com/x')]),
      folder('news', [bm('c', 'https://news.ycombinator.com/item?id=1'), bm('d', 'https://github.com/otro/repo')]),
      bm('suelto', 'https://ejemplo.com/')
    ])
  ])
]

describe('suggestFolder', () => {
  it('elige la carpeta con más marcadores del mismo dominio (www y subdominios agrupan)', () => {
    expect(suggestFolder(tree, 'https://www.github.com/nuevo')).toBe('dev')
  })

  it('a igualdad gana la carpeta más específica (menor tamaño)', () => {
    const t2: RawBookmarkNode[] = [
      folder('0', [
        folder('1', [
          folder('grande', [bm('a', 'https://x.com/1'), bm('b', 'https://otra.com'), bm('e', 'https://mas.com')]),
          folder('chica', [bm('c', 'https://x.com/2')])
        ])
      ])
    ]
    expect(suggestFolder(t2, 'https://x.com/3')).toBe('chica')
  })

  it('devuelve null sin dominio conocido o con URL inválida', () => {
    expect(suggestFolder(tree, 'https://desconocido.org/')).toBeNull()
    expect(suggestFolder(tree, 'no-es-url')).toBeNull()
  })

  it('los marcadores sueltos de un contenedor puntúan al contenedor', () => {
    expect(suggestFolder(tree, 'https://ejemplo.com/otra')).toBe('1')
  })
})
