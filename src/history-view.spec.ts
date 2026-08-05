import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./graph/build', async importOriginal => ({
  ...(await importOriginal<typeof import('./graph/build')>()),
  loadFavicon: vi.fn()
}))
vi.mock('./ui/dialog', () => ({ openDialog: vi.fn() }))
vi.mock('./ui/toast', () => ({ toast: vi.fn() }))

import { MOCK_TABS } from './env'
import { buildHistoryGraph, invalidateHistoryGraph } from './history-view'
import { S } from './state'
import { getStrategy } from './view-strategy'

beforeEach(() => {
  S.viewMode = 'history'
  S.strategy = getStrategy('history')
  S.historyRange = { preset: '24h' }
  S.historyGrouping = 'domain'
  S.historyMuted = new Set()
  S.historyUnsavedOnly = false
  S.lastTree = []
  S.tagsMap = {}
  invalidateHistoryGraph()
})

describe('buildHistoryGraph preview', () => {
  it('groups visited URLs by domain and links their referring visits', async () => {
    await buildHistoryGraph()

    const expectedPages = MOCK_TABS.filter(tab => /^https?:/.test(tab.url ?? '')).length
    const pages = S.nodes.filter(n => n.history)
    const domains = S.nodes.filter(n => n.subtype === 'domain')
    const navigation = S.links.filter(link => link.type === 'history')

    expect(pages).toHaveLength(expectedPages)
    expect(domains.length).toBeGreaterThan(0)
    expect(navigation).toHaveLength(expectedPages - 1)
    expect(pages.every(node => node.parentId?.startsWith('hist-domain:'))).toBe(true)
  })

  it('triaje: silencia dominios, marca lo no guardado y filtra', async () => {
    const first = MOCK_TABS.filter(tab => /^https?:/.test(tab.url ?? ''))[0]
    S.lastTree = [{ id: '0', title: '', children: [{ id: 'b1', title: 'guardado', url: first?.url }] }]
    S.historyMuted = new Set(['proton.me'])
    await buildHistoryGraph()

    const pages = S.nodes.filter(n => n.history)
    expect(pages.some(n => (n.mHost ?? '').endsWith('proton.me'))).toBe(false)
    expect(pages.find(n => n.url === first?.url)?.unsaved).toBe(false)
    expect(pages.filter(n => n.unsaved)).toHaveLength(pages.length - 1)

    S.historyUnsavedOnly = true
    await buildHistoryGraph()
    const filtered = S.nodes.filter(n => n.history)
    expect(filtered).toHaveLength(pages.length - 1)
    expect(filtered.every(n => n.unsaved)).toBe(true)
  })

  it('agrupa por sesiones de navegación cuando se selecciona ese modo', async () => {
    S.historyGrouping = 'session'
    await buildHistoryGraph()

    const hubs = S.nodes.filter(n => n.id.startsWith('hist-session:'))
    const pages = S.nodes.filter(n => n.history)
    expect(hubs.length).toBeGreaterThan(0)
    expect(pages.every(node => node.parentId?.startsWith('hist-session:'))).toBe(true)
    expect(pages.every(node => (node.hubs?.length ?? 0) > 0)).toBe(true)
  })
})
