import { t } from '../i18n'
import { GraphIndex } from '../lib/graph-index'
import { evaluateGraphQuery, parseGraphQuery } from '../lib/graph-query'
import { normPath } from '../lib/utils'
import { S } from '../state'
import { tagsOf } from '../tags'
import type { GraphLink, GraphNode, RawBookmarkNode } from '../types'
import { buildGraphFolders } from './build'

/**
 * Encuentra todos los IDs de carpetas ancestros necesarios para conectar un conjunto
 * de nodos marcadores hasta la raíz del árbol.
 */
function collectAncestors(
  nodes: RawBookmarkNode[],
  targetIds: Set<string>,
  ancestors: Set<string> = new Set()
): boolean {
  let hasTargetChild = false

  for (const n of nodes) {
    if (n.url) {
      if (targetIds.has(`b${n.id}`) || targetIds.has(n.id)) {
        hasTargetChild = true
      }
    } else if (n.children) {
      const childHasTarget = collectAncestors(n.children, targetIds, ancestors)
      if (childHasTarget) {
        ancestors.add(n.id)
        hasTargetChild = true
      }
    }
  }

  return hasTargetChild
}

/**
 * Filtra un árbol de marcadores conservando solo los marcadores que coinciden con el conjunto
 * objetivo y sus carpetas ancestras.
 */
function pruneTreeToSet(nodes: RawBookmarkNode[], targetIds: Set<string>, ancestorIds: Set<string>): RawBookmarkNode[] {
  const result: RawBookmarkNode[] = []

  for (const n of nodes) {
    if (n.url) {
      if (targetIds.has(`b${n.id}`) || targetIds.has(n.id)) {
        result.push(n)
      }
    } else if (n.children && ancestorIds.has(n.id)) {
      const prunedChildren = pruneTreeToSet(n.children, targetIds, ancestorIds)
      if (prunedChildren.length > 0) {
        result.push({
          ...n,
          children: prunedChildren
        })
      }
    }
  }

  return result
}

/**
 * Reconstruye el grafo completo para una vista personalizada a partir de su consulta DSL.
 * Garantiza que la jerarquía del árbol se conserva 100% intacta sin nodos huérfanos.
 */
export function buildCustomGraph(tree: RawBookmarkNode[], queryString: string): void {
  // 1. Construir un grafo completo temporal para evaluar la consulta
  const tempNodes: GraphNode[] = []
  const tempLinks: GraphLink[] = []

  function walkTemp(nodes: RawBookmarkNode[], parentId: string | null): void {
    for (const item of nodes) {
      if (item.url && /^https?:/.test(item.url)) {
        let host = ''
        let mPath = '/'
        try {
          const u = new URL(item.url)
          host = u.host
          mPath = normPath(u.pathname)
        } catch {
          /* URL no estándar */
        }
        tempNodes.push({
          id: `b${item.id}`,
          raw: item.id,
          type: 'bm',
          title: item.title || item.url,
          url: item.url,
          host,
          mHost: host.toLowerCase(),
          mPath,
          folderId: parentId,
          tags: tagsOf(item.url),
          count: 0,
          heat: S.heatByUrl.get(item.url) ?? 0.35
        })
      } else if (item.children) {
        tempNodes.push({
          id: item.id,
          raw: item.id,
          type: 'folder',
          title: item.title || t('folderUnnamed'),
          folderId: parentId
        })
        walkTemp(item.children, item.id)
      }
    }
  }

  walkTemp(tree, null)

  const tempIndex = new GraphIndex(tempNodes, tempLinks)
  const ast = parseGraphQuery(queryString)
  const matchedNodes = evaluateGraphQuery(ast, tempIndex, S.openTabs, new Set(Object.keys(S.pinned)))
  const matchedTargetIds = new Set(matchedNodes.map(n => n.id))

  // 2. Colectar carpetas ancestras para no dejar nodos aislados
  const ancestorIds = new Set<string>()
  collectAncestors(tree, matchedTargetIds, ancestorIds)

  // 3. Podar el árbol conservando marcadores + ancestros
  const prunedTree = pruneTreeToSet(tree, matchedTargetIds, ancestorIds)

  // 4. Reconstruir el grafo nativo sobre el árbol podado
  buildGraphFolders(prunedTree)
}
