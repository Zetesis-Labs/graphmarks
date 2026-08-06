import { describe, expect, it } from 'vitest'
import { isGraphTabUrl } from './graph-url'

const BASE = 'chrome-extension://abc/newtab.html'

describe('isGraphTabUrl', () => {
  it('la URL de la extensión es el grafo, con o sin query', () => {
    expect(isGraphTabUrl(`${BASE}?source=action`, BASE, false)).toBe(true)
    expect(isGraphTabUrl(BASE, BASE, true)).toBe(true)
  })

  it('chrome://newtab solo es el grafo mientras la override está activa', () => {
    expect(isGraphTabUrl('chrome://newtab/', BASE, true)).toBe(true)
    expect(isGraphTabUrl('chrome://newtab/', BASE, false)).toBe(false)
  })

  it('cualquier otra URL no lo es', () => {
    expect(isGraphTabUrl('https://ejemplo.com', BASE, true)).toBe(false)
    expect(isGraphTabUrl('chrome://new-tab-page/', BASE, true)).toBe(false)
  })
})
