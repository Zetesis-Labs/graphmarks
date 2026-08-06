import type { FolderOption, RawBookmarkNode } from '../types'

/**
 * Aplana las carpetas del árbol para selects de destino. Un id excluido poda
 * su subárbol entero: mover una carpeta dentro de sí misma no es una opción.
 */
export function flattenFolders(
  tree: RawBookmarkNode[],
  untitled: string,
  excludeIds: Set<string> = new Set()
): FolderOption[] {
  const out: FolderOption[] = []
  const walk = (items: RawBookmarkNode[], depth: number): void => {
    for (const it of items) {
      if (it.url || excludeIds.has(it.id)) continue
      out.push({ id: it.id, title: it.title || untitled, depth })
      walk(it.children ?? [], depth + 1)
    }
  }
  walk(tree[0]?.children ?? [], 0)
  return out
}
