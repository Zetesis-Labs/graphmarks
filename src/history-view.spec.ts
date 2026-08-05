import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./graph/build', () => ({ loadFavicon: vi.fn() }))
vi.mock('./ui/dialog', () => ({ openDialog: vi.fn() }))
vi.mock('./ui/toast', () => ({ toast: vi.fn() }))

import { MOCK_TABS } from './env'
import { buildHistoryGraph, invalidateHistoryGraph } from './history-view'
import { S } from './state'

beforeEach(() => {
  S.viewMode = 'history'
  S.historyRange = { preset: '24h' }
  S.historyGrouping = 'domain'
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
