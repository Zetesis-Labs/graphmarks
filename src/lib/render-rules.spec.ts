import { describe, expect, it } from 'vitest'
import { bmLabelVisible, folderLabelVisible, linkAlpha, linkWidth } from './render-rules'

describe('linkAlpha y linkWidth', () => {
  it('con foco: lo enfocado destaca y el resto casi desaparece', () => {
    expect(linkAlpha('tree', true, true)).toBe(0.9)
    expect(linkAlpha('tree', true, false)).toBe(0.04)
  })

  it('sin foco cada tipo tiene su presencia', () => {
    expect(linkAlpha('host', false, false)).toBe(0.14)
    expect(linkAlpha('history', false, false)).toBe(0.24)
    expect(linkAlpha('tree', false, false)).toBe(0.3)
    expect(linkWidth('host')).toBeLessThan(linkWidth('tree'))
  })
})

describe('folderLabelVisible', () => {
  it('con foco activo solo se etiqueta lo enfocado', () => {
    expect(folderLabelVisible(false, 1, false, true, false)).toBe(false)
    expect(folderLabelVisible(false, 1, true, true, false)).toBe(true)
  })

  it('las menores exigen zoom, salvo hover', () => {
    expect(folderLabelVisible(true, 0.5, true, false, false)).toBe(false)
    expect(folderLabelVisible(true, 0.5, true, false, true)).toBe(true)
    expect(folderLabelVisible(true, 0.9, true, false, false)).toBe(true)
  })
})

describe('bmLabelVisible', () => {
  it('marcadores desde k=1.5, ghosts desde 0.8, hover siempre', () => {
    expect(bmLabelVisible(1.5, false, true, false, false, false)).toBe(true)
    expect(bmLabelVisible(1.4, false, true, false, false, false)).toBe(false)
    expect(bmLabelVisible(0.9, true, true, false, false, false)).toBe(true)
    expect(bmLabelVisible(0.2, false, false, false, true, false)).toBe(true)
  })

  it('el foco de búsqueda etiqueta aunque no haya zoom', () => {
    expect(bmLabelVisible(0.2, false, false, false, false, true)).toBe(true)
    expect(bmLabelVisible(0.2, false, true, true, false, false)).toBe(true)
  })
})
