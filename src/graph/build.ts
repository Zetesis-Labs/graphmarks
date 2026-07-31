import { app } from '../bus'
import { LOOSE_DOM, MAX_SLOTS, UNTAGGED } from '../constants'
import { IS_EXT } from '../env'
import { domainKey, normPath } from '../lib/utils'
import { S } from '../state'
import { tagsOf } from '../tags'
import type { Cluster, GraphNode, LinkKind, RawBookmarkNode } from '../types'

export const bmCount = (n: RawBookmarkNode): number =>
  n.url ? 1 : (n.children ?? []).reduce((s, c) => s + bmCount(c), 0)

function makeBmNode(it: RawBookmarkNode, folderId: string | null): GraphNode {
  let host = ''
  let mPath = '/'
  try {
    const u = new URL(it.url ?? '')
    host = u.host
    mPath = normPath(u.pathname)
  } catch {
    /* URL rara: nodo sin host */
  }
  return {
    id: `b${it.id}`,
    raw: it.id,
    type: 'bm',
    title: it.title || (it.url ?? ''),
    url: it.url,
    host,
    mHost: host.toLowerCase(),
    mPath,
    folderId,
    tags: tagsOf(it.url ?? '')
  }
}

function initCommon(): void {
  S.nodes = []
  S.links = []
  S.byId = new Map()
  S.clusterOf = new Map()
  S.clusters = []
}

const addNode = (n: GraphNode): GraphNode => {
  S.nodes.push(n)
  S.byId.set(n.id, n)
  return n
}

const addLink = (source: string, target: string, type: LinkKind): void => {
  S.links.push({ source, target, type })
}

const endpointId = (e: string | GraphNode): string => (typeof e === 'object' ? e.id : e)

export function rebuildNeighbors(): void {
  S.neighbors = new Map(S.nodes.map(n => [n.id, new Set<string>()]))
  for (const l of S.links) {
    const s = endpointId(l.source)
    const t = endpointId(l.target)
    S.neighbors.get(s)?.add(t)
    S.neighbors.get(t)?.add(s)
  }
}

function assignSlots(list: Cluster[], noSlotIds: Set<string> = new Set()): void {
  S.clusters = list.sort((a, b) => b.count - a.count)
  let slot = 0
  for (const c of S.clusters) {
    c.slot = !noSlotIds.has(c.id) && slot < MAX_SLOTS ? slot++ : -1
    S.clusterOf.set(c.id, c)
  }
}

function finishGraph(withHostLinks: boolean): void {
  if (withHostLinks) {
    const byHost = new Map<string, GraphNode[]>()
    for (const n of S.nodes) {
      if (n.type === 'bm' && n.host) {
        if (!byHost.has(n.host)) byHost.set(n.host, [])
        byHost.get(n.host)?.push(n)
      }
    }
    for (const group of byHost.values()) {
      if (group.length < 2 || group.length > 6) continue
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]
          const b = group[j]
          if (a && b) addLink(a.id, b.id, 'host')
        }
    }
  }
  rebuildNeighbors()
  if (IS_EXT) for (const n of S.nodes) if (n.type === 'bm' && n.url) loadFavicon(n.url)
}

/* --- vista carpetas --- */

function buildGraphFolders(tree: RawBookmarkNode[]): void {
  initCommon()
  const containers = tree[0]?.children ?? []

  // profundidad de clúster: primer nivel con >= 2 carpetas con contenido
  const perDepth: RawBookmarkNode[][] = []
  const scan = (items: RawBookmarkNode[], d: number): void => {
    for (const it of items) {
      if (!it.url && it.children) {
        if (bmCount(it) > 0) {
          perDepth[d] ??= []
          perDepth[d]?.push(it)
        }
        scan(it.children, d + 1)
      }
    }
  }
  scan(
    containers.flatMap(c => c.children ?? []),
    1
  )
  let clusterDepth = 1
  for (let d = 1; d < perDepth.length + 1; d++) {
    if ((perDepth[d] ?? []).length >= 2) {
      clusterDepth = d
      break
    }
  }

  const walk = (items: RawBookmarkNode[], parent: GraphNode | null, depth: number, clusterId: string | null): void => {
    for (const it of items) {
      if (it.url) {
        if (!/^https?:/.test(it.url)) continue
        const n = makeBmNode(it, parent ? parent.id : null)
        n.cluster = clusterId ?? (parent ? parent.id : 'misc')
        n.parentId = parent ? parent.id : null
        addNode(n)
        if (parent) addLink(parent.id, n.id, 'tree')
      } else if (it.children && bmCount(it) > 0) {
        const isCluster = depth === clusterDepth
        const node = addNode({
          id: it.id,
          raw: it.id,
          type: 'folder',
          title: it.title || '(sin nombre)',
          count: bmCount(it),
          cluster: isCluster ? it.id : (clusterId ?? undefined),
          parentId: parent ? parent.id : null
        })
        if (parent) addLink(parent.id, it.id, 'tree')
        walk(it.children, node, depth + 1, isCluster ? it.id : clusterId)
      }
    }
  }

  for (const c of containers) {
    const loose = (c.children ?? []).filter(x => x.url)
    let parent: GraphNode | null = null
    if (loose.length) {
      parent = addNode({
        id: c.id,
        raw: c.id,
        type: 'folder',
        title: c.title || 'Marcadores',
        count: loose.length,
        cluster: c.id,
        parentId: null
      })
    }
    walk(
      (c.children ?? []).filter(x => !x.url),
      null,
      1,
      null
    )
    if (parent) walk(loose, parent, 1, c.id)
  }

  assignSlots(
    S.nodes
      .filter(n => n.type === 'folder' && n.cluster === n.id)
      .map(n => ({ id: n.id, title: n.title, count: n.count ?? 0 }))
  )
  finishGraph(true)
}

/* --- marcadores planos (vistas tags/dominios) --- */

function flatBookmarks(tree: RawBookmarkNode[]): GraphNode[] {
  const out: GraphNode[] = []
  const walk = (items: RawBookmarkNode[], folderId: string | null): void => {
    for (const it of items) {
      if (it.url) {
        if (/^https?:/.test(it.url)) out.push(makeBmNode(it, folderId))
      } else if (it.children) {
        walk(it.children, it.id)
      }
    }
  }
  walk(tree[0]?.children ?? [], null)
  return out
}

function buildGraphTags(tree: RawBookmarkNode[]): void {
  initCommon()
  const bms = flatBookmarks(tree)
  const hubCount = new Map<string, number>()
  for (const b of bms) {
    b.hubs = b.tags?.length ? b.tags.map(t => `t:${t}`) : [UNTAGGED]
    for (const h of b.hubs) hubCount.set(h, (hubCount.get(h) ?? 0) + 1)
  }
  for (const [hid, count] of hubCount) {
    addNode({
      id: hid,
      type: 'folder',
      subtype: 'tag',
      tag: hid === UNTAGGED ? null : hid.slice(2),
      title: hid === UNTAGGED ? '· sin etiquetar' : `#${hid.slice(2)}`,
      count,
      cluster: hid,
      parentId: null
    })
  }
  for (const b of bms) {
    b.cluster = b.hubs?.[0]
    b.parentId = b.hubs?.[0] ?? null
    addNode(b)
    for (const h of b.hubs ?? []) addLink(h, b.id, 'tree')
  }
  assignSlots(
    [...hubCount.entries()].map(([id, count]) => ({ id, title: S.byId.get(id)?.title ?? id, count })),
    new Set([UNTAGGED])
  )
  finishGraph(false)
}

function buildGraphDomains(tree: RawBookmarkNode[]): void {
  initCommon()
  const bms = flatBookmarks(tree)
  const groups = new Map<string, GraphNode[]>()
  for (const b of bms) {
    const d = b.host ? domainKey(b.host) : '·'
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d)?.push(b)
  }
  const loose: GraphNode[] = []
  for (const [dom, list] of groups) {
    if (list.length < 2) {
      loose.push(...list)
      continue
    }
    const hid = `d:${dom}`
    addNode({
      id: hid,
      type: 'folder',
      subtype: 'domain',
      title: dom,
      count: list.length,
      cluster: hid,
      parentId: null
    })
    for (const b of list) {
      b.hubs = [hid]
      b.cluster = hid
      b.parentId = hid
      addNode(b)
      addLink(hid, b.id, 'tree')
    }
  }
  if (loose.length) {
    addNode({
      id: LOOSE_DOM,
      type: 'folder',
      subtype: 'domain',
      title: '· sueltos',
      count: loose.length,
      cluster: LOOSE_DOM,
      parentId: null
    })
    for (const b of loose) {
      b.hubs = [LOOSE_DOM]
      b.cluster = LOOSE_DOM
      b.parentId = LOOSE_DOM
      addNode(b)
      addLink(LOOSE_DOM, b.id, 'tree')
    }
  }
  assignSlots(
    S.nodes.filter(n => n.type === 'folder').map(n => ({ id: n.id, title: n.title, count: n.count ?? 0 })),
    new Set([LOOSE_DOM])
  )
  finishGraph(false)
}

export function buildGraph(tree: RawBookmarkNode[]): void {
  if (S.viewMode === 'tags') buildGraphTags(tree)
  else if (S.viewMode === 'domains') buildGraphDomains(tree)
  else buildGraphFolders(tree)
}

/* --- fantasmas: pestañas sin marcador, agrupadas por dominio --- */

export function addGhostNodes(): void {
  if (!S.showGhosts) return
  const byDom = new Map<string, typeof S.ghostTabs>()
  for (const g of S.ghostTabs) {
    const dom = domainKey(g.host.toLowerCase())
    if (!byDom.has(dom)) byDom.set(dom, [])
    byDom.get(dom)?.push(g)
  }
  for (const [dom, list] of byDom) {
    let hubId: string | null = null
    if (list.length >= 2) {
      hubId = `gh:${dom}`
      addNode({
        id: hubId,
        type: 'folder',
        subtype: 'ghosthub',
        title: dom,
        count: list.length,
        cluster: 'ghost',
        parentId: null
      })
    }
    for (const t of list) {
      addNode({
        id: `g${t.id}`,
        type: 'ghost',
        title: t.title,
        url: t.url,
        host: t.host,
        tab: t,
        tags: [],
        cluster: 'ghost',
        parentId: hubId,
        hubs: hubId ? [hubId] : []
      })
      if (hubId) addLink(hubId, `g${t.id}`, 'tree')
      if (IS_EXT) loadFavicon(t.url)
    }
  }
}

/** Poda el grafo dejando solo marcadores abiertos y sus hubs/carpetas ancestras. */
export function pruneToOpen(): void {
  const keep = new Set<string>(S.openTabs.keys())
  for (const n of S.nodes) if (n.type === 'ghost') keep.add(n.id)
  for (const id of [...keep]) {
    const n = S.byId.get(id)
    if (!n) {
      keep.delete(id)
      continue
    }
    for (const h of n.hubs ?? []) keep.add(h)
    let p = n.parentId
    while (p && !keep.has(p)) {
      keep.add(p)
      p = S.byId.get(p)?.parentId ?? null
    }
  }
  S.nodes = S.nodes.filter(n => keep.has(n.id))
  S.byId = new Map(S.nodes.map(n => [n.id, n]))
  S.links = S.links.filter(l => keep.has(endpointId(l.source)) && keep.has(endpointId(l.target)))
  rebuildNeighbors()
}

/** Miembros de un hub: subárbol real (carpetas) o marcadores vinculados (tag/dominio). */
export function members(hub: GraphNode): GraphNode[] {
  if (hub.subtype) return [hub, ...S.nodes.filter(n => n.hubs?.includes(hub.id))]
  const ids = new Set([hub.id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of S.nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id)
        grew = true
      }
    }
  }
  return S.nodes.filter(n => ids.has(n.id))
}

export function loadFavicon(url: string): void {
  if (S.favicons.has(url)) return
  const img = new Image()
  const rec = { img, ok: false }
  S.favicons.set(url, rec)
  img.onload = () => {
    rec.ok = true
    app.requestDraw()
  }
  img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`)
}
