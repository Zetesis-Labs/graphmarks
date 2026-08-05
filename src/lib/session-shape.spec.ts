import { describe, expect, it } from 'vitest'
import type { SavedTab } from '../types'
import { planSplitSets, planTabGroups, readSplitId, shapeSessionWindows, windowCreateSpec } from './session-shape'

const tab = (over: Partial<SavedTab> = {}): SavedTab => ({
  url: 'https://a.com',
  title: 'A',
  pinned: false,
  active: false,
  groupIdx: null,
  splitId: null,
  ...over
})

describe('readSplitId', () => {
  it('acepta cualquier clave *split* con valor real', () => {
    expect(readSplitId({ splitViewId: 7 })).toBe(7)
    expect(readSplitId({ splitId: 3 })).toBe(3)
    expect(readSplitId({ splitViewId: -1 })).toBeNull()
    expect(readSplitId({ id: 1, url: 'x' })).toBeNull()
  })
})

describe('shapeSessionWindows', () => {
  const wins = [
    {
      id: 1,
      left: 10,
      top: 20,
      width: 800,
      height: 600,
      state: 'normal',
      tabs: [
        { url: 'https://a.com', title: 'A', groupId: 77 },
        { url: 'https://b.com', title: 'B', groupId: 77, splitViewId: 5 },
        { url: 'chrome://newtab/', title: 'nt' },
        { url: '' }
      ]
    },
    { id: 2, tabs: [{ url: 'https://c.com', title: 'C', active: true }] }
  ]
  const groups = new Map([[77, { title: 'Dev', color: 'blue', collapsed: true }]])

  it('filtra URLs excluidas, indexa grupos y lee splits', () => {
    const out = shapeSessionWindows(wins, groups, 'all', ['chrome://newtab'])
    expect(out).toHaveLength(2)
    expect(out[0]?.tabs).toHaveLength(2)
    expect(out[0]?.groups).toEqual([{ title: 'Dev', color: 'blue', collapsed: true }])
    expect(out[0]?.tabs[0]?.groupIdx).toBe(0)
    expect(out[0]?.tabs[1]?.splitId).toBe(5)
    expect(out[1]?.tabs[0]?.active).toBe(true)
  })

  it('respeta el ámbito de una sola ventana', () => {
    const out = shapeSessionWindows(wins, groups, 2, [])
    expect(out).toHaveLength(1)
    expect(out[0]?.tabs[0]?.url).toBe('https://c.com')
  })

  it('descarta ventanas sin pestañas guardables', () => {
    const out = shapeSessionWindows([{ id: 3, tabs: [{ url: 'chrome://newtab/' }] }], groups, 'all', ['chrome://'])
    expect(out).toEqual([])
  })

  it('grupos sin metadatos caen a los valores por defecto', () => {
    const out = shapeSessionWindows([{ id: 1, tabs: [{ url: 'https://a.com', groupId: 99 }] }], new Map(), 'all', [])
    expect(out[0]?.groups).toEqual([{ title: '', color: 'grey', collapsed: false }])
  })
})

describe('planTabGroups', () => {
  it('agrupa los ids creados por índice de grupo', () => {
    const tabs = [tab({ groupIdx: 0 }), tab(), tab({ groupIdx: 0 }), tab({ groupIdx: 1 })]
    const plan = planTabGroups(tabs, [11, 12, 13, null])
    expect(plan.get(0)).toEqual([11, 13])
    expect(plan.has(1)).toBe(false)
  })
})

describe('planSplitSets', () => {
  it('solo devuelve divisiones con al menos dos pestañas reales', () => {
    const tabs = [tab({ splitId: 5 }), tab({ splitId: 5 }), tab({ splitId: 9 })]
    expect(planSplitSets(tabs, [1, 2, 3])).toEqual([[1, 2]])
    expect(planSplitSets(tabs, [1, null, 3])).toEqual([])
  })
})

describe('windowCreateSpec', () => {
  it('estados especiales ganan a la geometría', () => {
    expect(windowCreateSpec({ state: 'maximized', left: 5 }, ['u'])).toEqual({ url: ['u'], state: 'maximized' })
  })

  it('geometría explícita cuando el estado es normal', () => {
    expect(windowCreateSpec({ state: 'normal', left: 5, top: 6, width: 7, height: 8 }, ['u'])).toEqual({
      url: ['u'],
      left: 5,
      top: 6,
      width: 7,
      height: 8
    })
  })

  it('sin geometría finita solo van las URLs', () => {
    expect(windowCreateSpec({ state: 'normal' }, ['u'])).toEqual({ url: ['u'] })
  })
})
