import type { RawBookmarkNode } from '../types'

/**
 * Higiene de marcadores: detección pura de duplicados por URL, carpetas sin
 * contenido y marcadores invisibles en el grafo (URLs no http/https). La
 * cáscara (src/hygiene.ts) presenta el informe y ejecuta los borrados.
 */

export interface HygieneItem {
  id: string
  title: string
  url?: string
  /** Ruta legible «Barra / Dev / Frontend» de la carpeta contenedora. */
  path: string
  /** Dónde estaba: permite deshacer un borrado recreando en el mismo sitio. */
  parentId: string
  index: number
}

export interface DuplicateGroup {
  /** URL normalizada compartida; items del más antiguo al más nuevo. */
  url: string
  items: HygieneItem[]
}

export interface HygieneReport {
  duplicates: DuplicateGroup[]
  /** Solo las cimas: una carpeta vacía dentro de otra vacía no se lista. */
  emptyFolders: HygieneItem[]
  /** Marcadores que el grafo nunca pinta: javascript:, chrome:, file:… */
  invisible: HygieneItem[]
}

/** Copias a eliminar: todas menos la más antigua de cada grupo. */
export function duplicateRemovals(report: HygieneReport): HygieneItem[] {
  return report.duplicates.flatMap(g => g.items.slice(1))
}

/** Ancla y barra final fuera: el mismo documento cuenta como la misma página. */
export function normalizeBookmarkUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

function subtreeBmCount(n: RawBookmarkNode): number {
  if (n.url) return 1
  return (n.children ?? []).reduce((acc, c) => acc + subtreeBmCount(c), 0)
}

/** Los ids de Chrome crecen con la creación: menor id = marcador más antiguo. */
function byAge(a: HygieneItem, b: HygieneItem): number {
  const na = Number(a.id)
  const nb = Number(b.id)
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.id.localeCompare(b.id)
  return na - nb
}

export function analyzeHygiene(tree: RawBookmarkNode[]): HygieneReport {
  const byUrl = new Map<string, HygieneItem[]>()
  const emptyFolders: HygieneItem[] = []
  const invisible: HygieneItem[] = []

  function walk(items: RawBookmarkNode[], parentId: string, path: string): void {
    items.forEach((it, index) => {
      const item: HygieneItem = { id: it.id, title: it.title || (it.url ?? ''), url: it.url, path, parentId, index }
      if (it.url) {
        if (/^https?:/.test(it.url)) {
          const key = normalizeBookmarkUrl(it.url)
          const list = byUrl.get(key)
          if (list) list.push(item)
          else byUrl.set(key, [item])
        } else {
          invisible.push(item)
        }
        return
      }
      if (subtreeBmCount(it) === 0) emptyFolders.push(item)
      else walk(it.children ?? [], it.id, `${path} / ${it.title}`)
    })
  }

  for (const container of tree[0]?.children ?? []) {
    walk(container.children ?? [], container.id, container.title)
  }

  const duplicates = [...byUrl.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([url, items]) => ({ url, items: [...items].sort(byAge) }))
    .sort((a, b) => b.items.length - a.items.length)

  return { duplicates, emptyFolders, invisible }
}
