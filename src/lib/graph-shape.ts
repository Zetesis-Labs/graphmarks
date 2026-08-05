import type { RawBookmarkNode } from '../types'
import { canonicalUrl } from './utils'

/** Forma del grafo: decisiones puras sobre el árbol de marcadores. */

/** Claves canónicas de todas las URLs guardadas — la base del triaje del historial. */
export function bookmarkUrlKeys(tree: readonly RawBookmarkNode[]): Set<string> {
  const keys = new Set<string>()
  const walk = (items: readonly RawBookmarkNode[]): void => {
    for (const it of items) {
      if (it.url) keys.add(canonicalUrl(it.url))
      else if (it.children) walk(it.children)
    }
  }
  walk(tree)
  return keys
}

export const bmCount = (n: RawBookmarkNode): number =>
  n.url ? 1 : (n.children ?? []).reduce((s, c) => s + bmCount(c), 0)

/** Profundidad de clúster: primer nivel con ≥ 2 carpetas con contenido. */
export function clusterDepth(roots: readonly RawBookmarkNode[]): number {
  const perDepth: RawBookmarkNode[][] = []
  const scan = (items: readonly RawBookmarkNode[], d: number): void => {
    for (const it of items) {
      if (!it.url && it.children) {
        if (bmCount(it) > 0) {
          perDepth[d] ??= []
          perDepth[d]?.push(it)
        }
        scan(it.children, d + 1)
      }
    }
  }
  scan(roots, 1)
  for (let d = 1; d < perDepth.length + 1; d++) {
    if ((perDepth[d] ?? []).length >= 2) return d
  }
  return 1
}

/** Parejas de nodos del mismo host (grupos de 2 a 6) para las aristas 'host'. */
export function hostPairs(nodes: ReadonlyArray<{ id: string; host?: string }>): Array<[string, string]> {
  const byHost = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.host) continue
    if (!byHost.has(n.host)) byHost.set(n.host, [])
    byHost.get(n.host)?.push(n.id)
  }
  const pairs: Array<[string, string]> = []
  for (const group of byHost.values()) {
    if (group.length < 2 || group.length > 6) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (a !== undefined && b !== undefined) pairs.push([a, b])
      }
    }
  }
  return pairs
}
