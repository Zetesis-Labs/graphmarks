import { S } from '../state'
import type { Cluster, GraphNode } from '../types'

const endpointId = (e: string | GraphNode): string => (typeof e === 'object' ? e.id : e)

function rebuildVisibleNeighbors(): void {
  S.neighbors = new Map(S.nodes.map(n => [n.id, new Set<string>()]))
  for (const l of S.links) {
    const source = endpointId(l.source)
    const target = endpointId(l.target)
    S.neighbors.get(source)?.add(target)
    S.neighbors.get(target)?.add(source)
  }
}

function realFolder(n: GraphNode): boolean {
  return n.type === 'folder' && !n.subtype && !!n.raw
}

function inside(n: GraphNode, rootId: string): boolean {
  let id: string | null | undefined = n.id
  while (id) {
    if (id === rootId) return true
    id = S.byId.get(id)?.parentId
  }
  return false
}

function collapsedBoundaries(activeRoot?: GraphNode): Set<string> {
  const candidates = new Set<string>()
  for (const n of S.nodes) {
    if (!realFolder(n) || n.id === activeRoot?.id) continue
    const pref = S.folderPrefs[n.raw ?? '']
    if (pref?.subgraph || (pref?.collapsed && !S.expandedFolders.has(n.raw ?? ''))) {
      candidates.add(n.id)
      n.collapsed = true
    }
  }

  // Si hay carpetas plegadas anidadas solo sobrevive la exterior; será quien
  // reciba directamente todos los marcadores abiertos de la rama oculta.
  const boundaries = new Set<string>()
  for (const id of candidates) {
    let parent = S.byId.get(id)?.parentId
    let behindAnotherBoundary = false
    while (parent) {
      if (candidates.has(parent)) {
        behindAnotherBoundary = true
        break
      }
      parent = S.byId.get(parent)?.parentId
    }
    if (!behindAnotherBoundary) boundaries.add(id)
  }
  return boundaries
}

function nearestBoundary(n: GraphNode, boundaries: Set<string>): string | null {
  let parent = n.parentId
  while (parent) {
    if (boundaries.has(parent)) return parent
    parent = S.byId.get(parent)?.parentId
  }
  return null
}

function visibleIds(
  activeRoot: GraphNode | undefined,
  boundaries: Set<string>
): {
  keep: Set<string>
  promoted: Map<string, string>
} {
  const keep = new Set<string>()
  const promoted = new Map<string, string>()
  for (const n of S.nodes) {
    if (activeRoot && !inside(n, activeRoot.id)) continue
    const boundary = nearestBoundary(n, boundaries)
    if (!boundary) keep.add(n.id)
    else if (n.type === 'bm' && S.openTabs.has(n.id)) {
      keep.add(n.id)
      promoted.set(n.id, boundary)
    }
  }
  return { keep, promoted }
}

function promoteOpenBookmarks(keep: Set<string>, promoted: Map<string, string>): void {
  S.nodes = S.nodes.filter(n => keep.has(n.id))
  S.byId = new Map(S.nodes.map(n => [n.id, n]))
  S.links = S.links.filter(
    l =>
      keep.has(endpointId(l.source)) &&
      keep.has(endpointId(l.target)) &&
      !(l.type === 'tree' && promoted.has(endpointId(l.target)))
  )
  for (const [nodeId, boundaryId] of promoted) {
    const n = S.byId.get(nodeId)
    if (!n || !S.byId.has(boundaryId)) continue
    n.parentId = boundaryId
    S.links.push({ source: boundaryId, target: nodeId, type: 'tree' })
  }
}

function scopeClusters(activeRoot?: GraphNode): void {
  if (!activeRoot) {
    S.clusters = S.clusters.filter(c => S.byId.has(c.id))
    return
  }
  for (const n of S.nodes) n.cluster = activeRoot.id
  const cluster: Cluster = { id: activeRoot.id, title: activeRoot.title, count: activeRoot.count ?? 0, slot: 0 }
  S.clusters = [cluster]
  S.clusterOf = new Map([[cluster.id, cluster]])
}

/**
 * Aplica las carpetas-portal y las plegadas por defecto. Una rama plegada
 * conserva su carpeta y promociona hasta ella únicamente los marcadores que
 * tengan pestañas abiertas; así el estado vivo sigue visible sin desplegarla.
 */
export function applyFolderPresentation(): void {
  if (S.viewMode !== 'folders') return

  let activeRoot = S.activeSubgraph ? S.byId.get(S.activeSubgraph) : undefined
  if (S.activeSubgraph && (!activeRoot || !realFolder(activeRoot))) {
    S.activeSubgraph = null
    activeRoot = undefined
  }

  for (const n of S.nodes) n.collapsed = false
  const boundaries = collapsedBoundaries(activeRoot)
  const { keep, promoted } = visibleIds(activeRoot, boundaries)
  promoteOpenBookmarks(keep, promoted)
  scopeClusters(activeRoot)
  rebuildVisibleNeighbors()
}
