/** Utilidades puras — sin dependencias de DOM ni de las APIs de Chrome. */

/**
 * Hash estable no criptográfico (buckets de sync, calor simulado).
 * La fase final de mezcla evita que URLs muy parecidas caigan siempre en los
 * mismos buckets: sin ella, 200 URLs seriadas ocupaban solo la mitad.
 */
export function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return Math.abs(h | 0)
}

/** Normaliza una ruta: sin barras finales, nunca vacía. */
export function normPath(p: string | undefined): string {
  const trimmed = (p || '/').replace(/\/+$/, '')
  return trimmed || '/'
}

/** Agrupa hosts por dominio registrable aproximado (www fuera, IPs/localhost tal cual). */
export function domainKey(host: string): string {
  const h = host.replace(/^www\./, '')
  if (/^[\d.:]+$/.test(h) || h.includes('localhost')) return h
  const parts = h.split('.')
  return parts.length <= 2 ? h : parts.slice(-2).join('.')
}

export function short(s: string, n = 34): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'yclid',
  'wbraid',
  'gbraid',
  'igshid',
  'mc_cid',
  'mc_eid'
])

/**
 * Clave de deduplicación: la misma página aunque cambien los trackers, el orden
 * de los parámetros o el fragmento. Los hash de rutas SPA (`#/`, `#!`) sí son
 * páginas distintas y se conservan. No es una URL para abrir: solo una clave.
 */
export function canonicalUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  const params = [...u.searchParams].filter(([k]) => {
    const key = k.toLowerCase()
    return !key.startsWith('utm_') && !TRACKING_PARAMS.has(key)
  })
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ''
  const hash = u.hash.startsWith('#/') || u.hash.startsWith('#!') ? u.hash : ''
  return `${u.protocol}//${u.host}${normPath(u.pathname)}${query}${hash}`
}

export interface Matchable {
  mHost?: string
  mPath?: string
}

/**
 * Mejor marcador para una URL: mismo host y coincidencia de ruta por prefijo
 * con corte en `/` (para que `/nexus` no capture `/nexus-ci`), ganando el
 * prefijo más largo (el marcador más específico).
 */
export function bestBookmarkMatch<T extends Matchable>(candidates: readonly T[], host: string, path: string): T | null {
  let best: T | null = null
  for (const b of candidates) {
    if (b.mHost !== host) continue
    const hit = b.mPath === '/' || path === b.mPath || (b.mPath !== undefined && path.startsWith(`${b.mPath}/`))
    if (hit && (!best || (b.mPath?.length ?? 0) > (best.mPath?.length ?? 0))) best = b
  }
  return best
}
