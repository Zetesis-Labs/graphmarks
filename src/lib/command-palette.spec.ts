import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommands, matchCommands, registerCommands } from './command-palette'

describe('command-palette', () => {
  beforeEach(() => {
    registerCommands([
      {
        id: 'cmd-folder',
        titleKey: 'cmdNewFolder',
        icon: '📁',
        keywords: ['folder', 'carpeta', 'nueva'],
        action: vi.fn()
      },
      {
        id: 'cmd-bookmark',
        titleKey: 'cmdNewBookmark',
        icon: '🔖',
        keywords: ['bookmark', 'marcador', 'nuevo'],
        action: vi.fn()
      },
      {
        id: 'cmd-tags-view',
        titleKey: 'cmdViewTags',
        icon: '🏷️',
        keywords: ['tags', 'etiquetas', 'vista'],
        action: vi.fn()
      }
    ])
  })

  it('devuelve todos los comandos si solo se escribe >', () => {
    const mockCatalog = (k: string) => k
    expect(matchCommands('>', mockCatalog)).toHaveLength(3)
    expect(matchCommands('>  ', mockCatalog)).toHaveLength(3)
  })

  it('filtra por título o palabras clave', () => {
    const mockCatalog = (k: string) => {
      if (k === 'cmdNewFolder') return 'Nueva carpeta'
      if (k === 'cmdNewBookmark') return 'Nuevo marcador'
      if (k === 'cmdViewTags') return 'Cambiar a vista Tags'
      return k
    }

    expect(matchCommands('> carpeta', mockCatalog).map(c => c.id)).toEqual(['cmd-folder'])
    expect(matchCommands('> vista', mockCatalog).map(c => c.id)).toEqual(['cmd-tags-view'])
    expect(matchCommands('> nuevo', mockCatalog).map(c => c.id)).toEqual(['cmd-bookmark'])
  })

  it('registra correctamente la lista de comandos', () => {
    expect(getCommands()).toHaveLength(3)
  })
})
