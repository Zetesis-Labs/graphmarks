import { IS_EXT } from './env'
import { loadStore, saveStore } from './lib/storage'
import { bestBookmarkMatch, normPath, strHash } from './lib/utils'
import { S } from './state'
import type { GraphNode } from './types'

interface HistCache {
  ts: number
  heat: Record<string, number>
}

const CACHE_TTL_MS = 30 * 60e3
const WINDOW_MS = 45 * 864e5

/**
 * Calor de cada marcador según el historial reciente (local, cacheado).
 * En la preview el calor es un pseudoaleatorio estable por URL.
 */
export async function computeHistory(): Promise<void> {
  if (!IS_EXT) {
    S.heatByUrl = new Map(S.allBms.map(b => [b.url ?? '', (strHash(b.url ?? '') % 90) / 100]))
    return
  }
  if (!chrome.history) return
  const cached = await loadStore<HistCache | null>('histCache', null)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    S.heatByUrl = new Map(Object.entries(cached.heat))
    return
  }
  const items = await chrome.history.search({ text: '', startTime: Date.now() - WINDOW_MS, maxResults: 5000 })
  const hostIdx = new Map<string, GraphNode[]>()
  for (const b of S.allBms) {
    const host = b.mHost ?? ''
    if (!hostIdx.has(host)) hostIdx.set(host, [])
    hostIdx.get(host)?.push(b)
  }
  const heatAgg = new Map<string, { v: number; last: number }>()
  for (const it of items) {
    if (!/^https?:/.test(it.url ?? '')) continue
    let u: URL
    try {
      u = new URL(it.url ?? '')
    } catch {
      continue
    }
    const host = u.host.toLowerCase()
    const path = normPath(u.pathname)
    const best = bestBookmarkMatch(hostIdx.get(host) ?? [], host, path)
    if (!best?.url) continue
    const a = heatAgg.get(best.url) ?? { v: 0, last: 0 }
    a.v += Math.min(it.visitCount ?? 1, 50)
    a.last = Math.max(a.last, it.lastVisitTime ?? 0)
    heatAgg.set(best.url, a)
  }
  const now = Date.now()
  const recency = (last: number) => (now - last < 7 * 864e5 ? 1 : now - last < 30 * 864e5 ? 0.7 : 0.4)
  S.heatByUrl = new Map(
    [...heatAgg].map(([url, a]) => [url, Math.min(1, Math.log1p(a.v) / Math.log1p(150)) * recency(a.last)])
  )
  await saveStore('histCache', { ts: now, heat: Object.fromEntries(S.heatByUrl) })
}
