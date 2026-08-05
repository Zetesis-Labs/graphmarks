/** Puntuación y matching del buscador — decisión pura, sin estado global. */

export interface SearchCandidate {
  title: string
  url: string
  /** Etiquetas del nodo, sin `#`. */
  tags: readonly string[]
  /** Nombre del hub de etiqueta si el nodo lo es (null para el hub sin-etiquetar). */
  tagHub: string | null
  kind: 'bm' | 'folder' | 'ghost'
  isOpen: boolean
  heat: number
}

/** Puntuación: prefijo > substring en título > URL > tags; la sesión abierta sube. */
export function scoreCandidate(c: SearchCandidate, query: string): number {
  const title = c.title.toLowerCase()
  const url = c.url.toLowerCase()
  const tagText = c.tags.map(tag => `#${tag}`).join(' ')
  if (!query) {
    // sin texto: la sesión abierta primero, luego lo más usado
    if (c.kind === 'bm' && c.isOpen) return 90
    if (c.kind === 'ghost') return 80
    if (c.kind === 'bm') return c.heat * 50
    return -1
  }
  if (query.startsWith('#')) {
    const tq = query.slice(1)
    if (c.tagHub?.includes(tq)) return 100
    if (c.tags.some(tag => tag.includes(tq))) return 60
    return -1
  }
  let s = -1
  if (title.startsWith(query)) s = 100
  else if (title.includes(query)) s = 70
  else if (url.includes(query)) s = 50
  else if (tagText.includes(query)) s = 40
  if (s > 0 && c.kind === 'bm' && c.isOpen) s += 15
  if (s > 0 && c.kind === 'folder') s -= 10
  return s
}

/** ¿Casa el nodo con la búsqueda? (`#tag` busca solo en etiquetas). */
export function matchesQuery(c: Pick<SearchCandidate, 'title' | 'url' | 'tags' | 'tagHub'>, query: string): boolean {
  if (query.startsWith('#')) {
    const tq = query.slice(1)
    return c.tagHub !== null ? c.tagHub.includes(tq) : c.tags.some(tag => tag.includes(tq))
  }
  return `${c.title} ${c.url} ${c.tags.map(tag => `#${tag}`).join(' ')}`.toLowerCase().includes(query)
}
