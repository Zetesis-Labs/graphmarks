import { describe, expect, it } from 'vitest'
import type { SavedSession } from '../types'
import { mergeImport, parseImportPayload } from './import-merge'

const session = (id: string): SavedSession => ({ id, name: id, created: '', windows: [] })
const current = {
  tagsMap: { 'https://a.com': ['dev'], 'https://b.com': ['docs'] },
  folderPrefs: { f1: { collapsed: true } },
  savedSessions: [session('s1')]
}

describe('parseImportPayload', () => {
  it('acepta solo exportaciones de graphmarks', () => {
    expect(parseImportPayload({ app: 'graphmarks', version: 1 })).not.toBeNull()
    expect(parseImportPayload({ app: 'otra', version: 1 })).toBeNull()
    expect(parseImportPayload('texto')).toBeNull()
    expect(parseImportPayload(null)).toBeNull()
  })
})

describe('mergeImport', () => {
  it('las etiquetas mezclan y lo importado gana clave a clave', () => {
    const patch = mergeImport(current, {
      app: 'graphmarks',
      version: 1,
      exported: '',
      tags: { 'https://a.com': ['infra'], 'https://c.com': ['nuevo'] }
    })
    expect(patch.tagsMap).toEqual({
      'https://a.com': ['infra'],
      'https://b.com': ['docs'],
      'https://c.com': ['nuevo']
    })
  })

  it('las sesiones se añaden deduplicadas por id', () => {
    const patch = mergeImport(current, {
      app: 'graphmarks',
      version: 1,
      exported: '',
      sessions: [session('s1'), session('s2')]
    })
    expect(patch.savedSessions?.map(s => s.id)).toEqual(['s1', 's2'])
  })

  it('solo devuelve las piezas presentes en el payload', () => {
    const patch = mergeImport(current, { app: 'graphmarks', version: 1, exported: '' })
    expect(patch).toEqual({})
  })

  it('el rango y los silenciados reemplazan en vez de mezclar', () => {
    const patch = mergeImport(current, {
      app: 'graphmarks',
      version: 1,
      exported: '',
      historyRange: { preset: '7d' },
      historyMuted: ['google.com']
    })
    expect(patch.historyRange).toEqual({ preset: '7d' })
    expect(patch.historyMuted).toEqual(['google.com'])
  })
})
