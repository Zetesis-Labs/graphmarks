import Graph from 'graphology'
import type { GraphLink, GraphNode } from '../types'

export class GraphIndex {
  public readonly graph: Graph
  public readonly nodeMap: Map<string, GraphNode> = new Map()
  public readonly tagIndex: Map<string, Set<string>> = new Map()
  public readonly domainIndex: Map<string, Set<string>> = new Map()
  public readonly folderIndex: Map<string, Set<string>> = new Map()

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    this.graph = new Graph({ multi: true, type: 'mixed' })
    this.build(nodes, links)
  }

  private indexNode(n: GraphNode): void {
    this.nodeMap.set(n.id, n)
    if (!this.graph.hasNode(n.id)) {
      this.graph.addNode(n.id, { ...n })
    }

    for (const t of n.tags ?? []) {
      const normTag = t.toLowerCase()
      let set = this.tagIndex.get(normTag)
      if (!set) {
        set = new Set()
        this.tagIndex.set(normTag, set)
      }
      set.add(n.id)
    }

    if (n.mHost) {
      const dom = n.mHost.toLowerCase()
      let set = this.domainIndex.get(dom)
      if (!set) {
        set = new Set()
        this.domainIndex.set(dom, set)
      }
      set.add(n.id)
    }

    if (n.folderId) {
      let set = this.folderIndex.get(n.folderId)
      if (!set) {
        set = new Set()
        this.folderIndex.set(n.folderId, set)
      }
      set.add(n.id)
    }
  }

  private build(nodes: GraphNode[], links: GraphLink[]): void {
    for (const n of nodes) this.indexNode(n)
    for (const l of links) {
      const sourceId = typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source)
      const targetId = typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target)
      if (this.graph.hasNode(sourceId) && this.graph.hasNode(targetId)) {
        this.graph.addEdge(sourceId, targetId, { type: l.type })
      }
    }
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodeMap.get(id)
  }

  public getNeighbors(id: string): GraphNode[] {
    if (!this.graph.hasNode(id)) return []
    return this.graph
      .neighbors(id)
      .map(nid => this.nodeMap.get(nid))
      .filter((n): n is GraphNode => !!n)
  }

  public getDegree(id: string): number {
    return this.graph.hasNode(id) ? this.graph.degree(id) : 0
  }

  public getAncestorFolderTitles(id: string): string[] {
    const titles: string[] = []
    let currId = this.nodeMap.get(id)?.folderId ?? null
    const visited = new Set<string>()

    while (currId && !visited.has(currId)) {
      visited.add(currId)
      const folderNode = this.nodeMap.get(currId)
      if (folderNode) {
        if (folderNode.title) titles.push(folderNode.title.toLowerCase())
        currId = folderNode.folderId ?? null
      } else {
        break
      }
    }

    return titles
  }

  public filterNodes(predicate: (n: GraphNode) => boolean): GraphNode[] {
    const results: GraphNode[] = []
    for (const n of this.nodeMap.values()) {
      if (predicate(n)) results.push(n)
    }
    return results
  }
}
