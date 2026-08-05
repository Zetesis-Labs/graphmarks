import { IS_EXT } from './env'
import { loadStore, saveStore } from './lib/storage'
import { aggregateVisitHeat } from './lib/tab-match'
import { strHash } from './lib/utils'
import { S } from './state'

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
  if (!IS_EXT || S.demo) {
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
  const heatAgg = aggregateVisitHeat(items, S.allBms)
  const now = Date.now()
  const recency = (last: number) => (now - last < 7 * 864e5 ? 1 : now - last < 30 * 864e5 ? 0.7 : 0.4)
  S.heatByUrl = new Map(
    [...heatAgg].map(([url, a]) => [url, Math.min(1, Math.log1p(a.v) / Math.log1p(150)) * recency(a.last)])
  )
  await saveStore('histCache', { ts: now, heat: Object.fromEntries(S.heatByUrl) })
}
