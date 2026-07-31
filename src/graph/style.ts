import { COLORS, S } from '../state'
import type { GraphNode } from '../types'

export function clusterColor(cid: string | undefined): string {
  const c = cid ? S.clusterOf.get(cid) : undefined
  if (!c || (c.slot ?? -1) < 0) return COLORS.other
  return COLORS.series[c.slot ?? 0] ?? COLORS.other
}

export function nodeColor(n: GraphNode): string {
  if (n.type === 'ghost' || n.subtype === 'ghosthub') return COLORS.muted
  if (n.type === 'folder' && n.cluster !== n.id && !S.clusterOf.get(n.cluster ?? '')) return COLORS.muted
  return clusterColor(n.cluster)
}

export function radius(n: GraphNode): number {
  if (n.type === 'folder') return Math.min(9 + Math.sqrt(n.count ?? 0) * 1.7, 26)
  if (n.type === 'bm') return 3.9 + (n.heat ?? 0.35) * 2.8
  return 5
}
