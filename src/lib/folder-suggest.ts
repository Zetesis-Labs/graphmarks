import type { RawBookmarkNode } from '../types'
import { domainKey } from './utils'

/**
 * Carpeta sugerida para guardar una URL: aquella donde ya viven más marcadores
 * del mismo dominio. A igualdad, la carpeta más pequeña (más específica).
 */
export function suggestFolder(tree: RawBookmarkNode[], url: string): string | null {
  let dom = ''
  try {
    dom = domainKey(new URL(url).host.toLowerCase())
  } catch {
    return null
  }
  if (!dom) return null

  const stats = new Map<string, { matches: number; size: number }>()

  function tally(items: RawBookmarkNode[], folderId: string): void {
    for (const it of items) {
      if (!it.url) {
        tally(it.children ?? [], it.id)
        continue
      }
      if (!/^https?:/.test(it.url)) continue
      const entry = stats.get(folderId) ?? { matches: 0, size: 0 }
      entry.size += 1
      try {
        if (domainKey(new URL(it.url).host.toLowerCase()) === dom) entry.matches += 1
      } catch {
        /* URL rara: no puntúa */
      }
      stats.set(folderId, entry)
    }
  }

  for (const container of tree[0]?.children ?? []) {
    tally(container.children ?? [], container.id)
  }

  let best: string | null = null
  let bestMatches = 0
  let bestSize = Number.POSITIVE_INFINITY
  for (const [folderId, { matches, size }] of stats) {
    if (matches === 0) continue
    if (matches > bestMatches || (matches === bestMatches && size < bestSize)) {
      best = folderId
      bestMatches = matches
      bestSize = size
    }
  }
  return best
}
