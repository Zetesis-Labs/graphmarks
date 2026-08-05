import { IS_EXT, MOCK_TABS } from './env'
import { strHash } from './lib/utils'
import { S } from './state'
import type { RawBookmarkNode } from './types'

/**
 * Puerto de datos del navegador (multinavegador.md): la app consume esta
 * interfaz y los adaptadores absorben `chrome.*` y los datos de muestra.
 * Eventos, permisos y runtime siguen en la cáscara de cada módulo dueño.
 */

export interface PortTab {
  id?: number
  windowId?: number
  index?: number
  title?: string
  url?: string
  active?: boolean
  pinned?: boolean
  groupId?: number
  lastAccessed?: number
}

export interface TabsQueryResult {
  tabs: PortTab[]
  /** Aviso de plataforma que la UI debe mostrar en el badge. */
  warning?: 'no-permission' | 'hidden-urls'
}

export interface PortWindow {
  id?: number
  left?: number
  top?: number
  width?: number
  height?: number
  state?: string
  /** Pestañas en orden; conservan cualquier clave `*split*` que exponga Chrome. */
  tabs: (PortTab & Record<string, unknown>)[]
}

export interface PortGroupMeta {
  title?: string
  color?: string
  collapsed?: boolean
}

export interface PortHistoryPage {
  id: string
  title?: string
  url?: string
  lastVisitTime?: number
  visitCount?: number
}

export interface PortVisit {
  id: string
  visitId: string
  referringVisitId: string
  transition: string
  visitTime?: number
}

export interface BrowserPort {
  bookmarkTree(): Promise<RawBookmarkNode[]>
  queryTabs(): Promise<TabsQueryResult>
  /** Ventanas normales con sus pestañas ya ordenadas (captura de sesiones). */
  sessionWindows(): Promise<PortWindow[]>
  tabGroups(): Promise<Map<number, PortGroupMeta>>
  historySearch(start: number, end: number, maxResults: number): Promise<PortHistoryPage[]>
  historyVisits(url: string, start: number, end: number): Promise<PortVisit[]>
}

const chromePort: BrowserPort = {
  bookmarkTree: () => chrome.bookmarks.getTree() as Promise<RawBookmarkNode[]>,

  async queryTabs() {
    if (!chrome.tabs) return { tabs: [], warning: 'no-permission' }
    const tabs = (await chrome.tabs.query({})) as PortTab[]
    if (tabs.length && !tabs.some(t => t.url)) return { tabs: [], warning: 'hidden-urls' }
    return { tabs }
  },

  async sessionWindows() {
    // las pestañas salen de tabs.query: es la vía que garantiza splitViewId
    // (los Tab de windows.getAll(populate) pueden venir sin ese campo)
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] })
    const all = await chrome.tabs.query({})
    return wins.map(w => ({
      id: w.id,
      left: w.left,
      top: w.top,
      width: w.width,
      height: w.height,
      state: w.state,
      tabs: all.filter(t => t.windowId === w.id).sort((a, b) => a.index - b.index) as unknown as PortWindow['tabs']
    }))
  },

  async tabGroups() {
    const map = new Map<number, PortGroupMeta>()
    if (!chrome.tabGroups) return map
    try {
      for (const g of await chrome.tabGroups.query({})) map.set(g.id, g)
    } catch {
      /* sin permiso tabGroups: se agrupa igual pero sin metadatos */
    }
    return map
  },

  async historySearch(start, end, maxResults) {
    if (!chrome.history) return []
    return (await chrome.history.search({
      text: '',
      startTime: start,
      endTime: end,
      maxResults
    })) as PortHistoryPage[]
  },

  async historyVisits(url) {
    if (!chrome.history) return []
    return (await chrome.history.getVisits({ url })) as PortVisit[]
  }
}

/* El adaptador de muestra reparte las visitas hacia atrás cada 18 minutos y
   las encaja en la franja pedida: la preview y la guía siempre tienen grafo. */

function mockHttpTabs(): typeof MOCK_TABS {
  return MOCK_TABS.filter(tab => /^https?:/.test(tab.url ?? ''))
}

function mockVisitTime(index: number, start: number, end: number): number {
  const now = Math.min(Date.now(), end)
  return Math.max(start, now - (index + 1) * 18 * 60_000)
}

const mockPort: BrowserPort = {
  bookmarkTree: async () => window.MOCK_TREE ?? [],

  queryTabs: async () => ({ tabs: MOCK_TABS }),

  sessionWindows: async () => {
    const byWin = new Map<number, PortWindow>()
    for (const t of MOCK_TABS) {
      let w = byWin.get(t.windowId)
      if (!w) {
        w = { id: t.windowId, left: 80, top: 80, width: 1280, height: 800, state: 'normal', tabs: [] }
        byWin.set(t.windowId, w)
      }
      w.tabs.push({ ...t, groupId: -1 })
    }
    return [...byWin.values()]
  },

  tabGroups: async () => new Map(),

  historySearch: async (start, end) =>
    mockHttpTabs().map((tab, i) => ({
      id: String(strHash(tab.url ?? '')),
      title: tab.title,
      url: tab.url,
      lastVisitTime: mockVisitTime(i, start, end),
      visitCount: 1
    })),

  historyVisits: async (url, start, end) => {
    const i = mockHttpTabs().findIndex(tab => tab.url === url)
    if (i < 0) return []
    return [
      {
        id: String(strHash(url)),
        visitId: `mock:${i}`,
        referringVisitId: i ? `mock:${i - 1}` : '0',
        transition: i ? 'link' : 'typed',
        visitTime: mockVisitTime(i, start, end)
      }
    ]
  }
}

/** El adaptador activo: datos reales en la extensión, muestra en preview y guía. */
export function activePort(): BrowserPort {
  return IS_EXT && !S.demo ? chromePort : mockPort
}
