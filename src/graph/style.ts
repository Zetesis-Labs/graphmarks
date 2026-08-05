import { COLORS, S } from '../state'
import type { GraphLink, GraphNode } from '../types'

function customOf(id: string | undefined): string | undefined {
  const raw = id ? S.byId.get(id)?.raw : undefined
  return raw ? S.customColors[`f:${raw}`] : undefined
}

export function clusterColor(cid: string | undefined): string {
  const custom = customOf(cid)
  if (custom) return custom
  const c = cid ? S.clusterOf.get(cid) : undefined
  if (!c || (c.slot ?? -1) < 0) return COLORS.other
  return COLORS.series[c.slot ?? 0] ?? COLORS.other
}

export function nodeColor(n: GraphNode): string {
  if (n.type === 'ghost' || n.subtype === 'ghosthub') return COLORS.muted
  // color personalizado: el de la propia carpeta, o el de la carpeta directa
  // del marcador (solo en la vista de carpetas: en tags/dominios manda el hub)
  if (n.type === 'folder' && !n.subtype && n.raw) {
    const own = S.customColors[`f:${n.raw}`]
    if (own) return own
  }
  if (n.type === 'bm') {
    const custom = S.strategy.bmColor?.(n)
    if (custom) return custom
  }
  if (n.type === 'folder' && n.cluster !== n.id && !S.clusterOf.get(n.cluster ?? '')) return COLORS.muted
  return clusterColor(n.cluster)
}

/** Color de arista: la serie del primer extremo con cluster asignado. */
export function linkColor(l: GraphLink): string {
  const pick = (e: string | GraphNode): string | null => {
    if (typeof e !== 'object') return null
    const c = e.cluster ? S.clusterOf.get(e.cluster) : undefined
    if (!c || (c.slot ?? -1) < 0) return null
    return COLORS.series[c.slot ?? 0] ?? null
  }
  return pick(l.source) ?? pick(l.target) ?? COLORS.muted
}

export function radius(n: GraphNode): number {
  if (n.subtype === 'subdomain') return Math.min(5.5 + Math.sqrt(n.count ?? 0) * 1.1, 13)
  if (n.subtype === 'path') return Math.min(4.5 + Math.sqrt(n.count ?? 0) * 0.9, 10)
  if (n.type === 'folder') return Math.min(9 + Math.sqrt(n.count ?? 0) * 1.7, 26)
  if (n.type === 'bm') return 3.9 + (n.heat ?? 0.35) * 2.8
  return 5
}
