import type { TabInfo, WindowSummary } from '../types'
import { bestBookmarkMatch, type Matchable, normPath } from './utils'

/** Inventario y matching de pestañas abiertas — decisión pura sobre datos crudos. */

export interface OpenTabLike {
  id?: number
  windowId?: number
  title?: string
  url?: string
  active?: boolean
  lastAccessed?: number
}

/** Inventario de ventanas con pestañas http(s), para el chip ⊞. */
export function summarizeWindows(tabs: readonly OpenTabLike[]): WindowSummary[] {
  const byWin = new Map<number, WindowSummary>()
  for (const t of tabs) {
    if (!/^https?:/.test(t.url ?? '')) continue
    const winId = t.windowId ?? 0
    const w = byWin.get(winId) ?? { id: winId, count: 0, title: '' }
    w.count++
    if (t.active) w.title = t.title ?? w.title
    byWin.set(winId, w)
  }
  return [...byWin.values()].sort((a, b) => a.id - b.id)
}

export interface TabMatchResult {
  /** Pestañas por id de marcador, las más recientes primero. */
  map: Map<string, TabInfo[]>
  /** Pestañas sin marcador que las ancle. */
  ghosts: TabInfo[]
}

export function matchTabsToBookmarks<B extends Matchable & { id: string }>(
  tabs: readonly OpenTabLike[],
  bms: readonly B[]
): TabMatchResult {
  const map = new Map<string, TabInfo[]>()
  const ghosts: TabInfo[] = []
  for (const t of tabs) {
    if (!/^https?:/.test(t.url ?? '')) continue
    let u: URL
    try {
      u = new URL(t.url ?? '')
    } catch {
      continue
    }
    const best = bestBookmarkMatch(bms, u.host.toLowerCase(), normPath(u.pathname))
    const info: TabInfo = {
      id: t.id ?? 0,
      windowId: t.windowId ?? 0,
      title: t.title ?? t.url ?? '',
      url: t.url ?? '',
      host: u.host,
      active: !!t.active,
      last: t.lastAccessed ?? 0
    }
    if (best) {
      if (!map.has(best.id)) map.set(best.id, [])
      map.get(best.id)?.push(info)
    } else {
      ghosts.push(info)
    }
  }
  for (const list of map.values()) list.sort((a, b) => b.last - a.last)
  return { map, ghosts }
}
