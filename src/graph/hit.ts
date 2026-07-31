import { MAX_SATS, PLUS_R, SAT_R } from '../constants'
import { S } from '../state'
import type { GraphNode, HitResult, TabInfo } from '../types'
import { simulation } from './simulation'
import { radius } from './style'

export interface SatellitePoint {
  x: number
  y: number
  tab: TabInfo
}

/** Tamaño constante en pantalla: al alejar el zoom crecen en unidades de mundo. */
export function satScale(): number {
  return 1 / Math.min(S.tf.k, 1)
}

export function satPositions(n: GraphNode): SatellitePoint[] {
  const tabs = (S.openTabs.get(n.id) ?? []).slice(0, MAX_SATS)
  const dist = radius(n) + 9 * satScale()
  const m = tabs.length
  return tabs.map((tab, i) => {
    const a = ((-90 + (i - (m - 1) / 2) * 34) * Math.PI) / 180
    return { x: (n.x ?? 0) + dist * Math.cos(a), y: (n.y ?? 0) + dist * Math.sin(a), tab }
  })
}

export function plusPosition(n: GraphNode): { x: number; y: number } {
  const dist = radius(n) + 9 * satScale()
  const a = (45 * Math.PI) / 180
  return { x: (n.x ?? 0) + dist * Math.cos(a), y: (n.y ?? 0) + dist * Math.sin(a) }
}

export function findAt(px: number, py: number): GraphNode | null {
  const [x, y] = S.tf.invert([px, py])
  const n = simulation?.find(x, y, 30 / S.tf.k)
  if (!n) return null
  const d = Math.hypot((n.x ?? 0) - x, (n.y ?? 0) - y)
  return d <= radius(n) + 7 / S.tf.k ? n : null
}

/** Nodo o elemento auxiliar (satélite de pestaña / botón «+») bajo el puntero. */
export function findHit(px: number, py: number): HitResult {
  const [x, y] = S.tf.invert([px, py])
  for (const id of S.openTabs.keys()) {
    const n = S.byId.get(id)
    if (!n) continue
    for (const s of satPositions(n))
      if (Math.hypot(s.x - x, s.y - y) <= SAT_R * satScale() + 4 / S.tf.k)
        return { node: n, aux: { type: 'sat', tab: s.tab } }
    if (S.hoverNode === n) {
      const p = plusPosition(n)
      if (Math.hypot(p.x - x, p.y - y) <= PLUS_R * satScale() + 4 / S.tf.k) return { node: n, aux: { type: 'plus' } }
    }
  }
  return { node: findAt(px, py), aux: null }
}

/** Carpeta/hub válido como destino de soltado bajo el puntero. */
export function findFolderAt(px: number, py: number, exclude: Set<string> = new Set()): GraphNode | null {
  const [x, y] = S.tf.invert([px, py])
  let best: GraphNode | null = null
  let bestD = Infinity
  for (const n of S.nodes) {
    if (n.type !== 'folder' || exclude.has(n.id)) continue
    if (S.viewMode === 'folders' && n.subtype) continue
    if (S.viewMode === 'tags' && n.subtype !== 'tag') continue
    const d = Math.hypot((n.x ?? 0) - x, (n.y ?? 0) - y)
    if (d <= radius(n) + 10 / S.tf.k && d < bestD) {
      best = n
      bestD = d
    }
  }
  return best
}
