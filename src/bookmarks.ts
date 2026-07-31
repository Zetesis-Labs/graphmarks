import { app } from './bus'
import { IS_EXT } from './env'
import { short } from './lib/utils'
import { S } from './state'
import { setTags, tagsOf } from './tags'
import type { FolderOption, GraphNode, RawBookmarkNode } from './types'
import { toast } from './ui/toast'

interface CreateSpec {
  parentId: string
  title: string
  url?: string
}

export interface BookmarksApi {
  create(spec: CreateSpec): Promise<RawBookmarkNode>
  update(id: string, changes: { title?: string; url?: string }): Promise<unknown>
  move(id: string, dest: { parentId: string }): Promise<unknown>
  remove(id: string): Promise<unknown>
  removeTree(id: string): Promise<unknown>
}

/* --- mock en memoria para la preview standalone --- */

let mockNoticeShown = false
let mockIdCounter = 100000

interface MockLocation {
  node: RawBookmarkNode
  siblings: RawBookmarkNode[]
  index: number
  parent: RawBookmarkNode | null
}

function mockLocate(
  id: string,
  list: RawBookmarkNode[] = window.MOCK_TREE?.[0]?.children ?? [],
  parent: RawBookmarkNode | null = null
): MockLocation | null {
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    if (!n) continue
    if (n.id === id) return { node: n, siblings: list, index: i, parent }
    if (n.children) {
      const hit = mockLocate(id, n.children, n)
      if (hit) return hit
    }
  }
  return null
}

function mockChanged(): void {
  if (!mockNoticeShown) {
    mockNoticeShown = true
    toast('Vista previa: los cambios no se guardan en Chrome')
  }
  app.rebuildSoon()
}

const mockApi: BookmarksApi = {
  async create({ parentId, title, url }) {
    const p = mockLocate(parentId)
    if (!p) throw new Error('carpeta no encontrada')
    const n: RawBookmarkNode = url
      ? { id: String(++mockIdCounter), title, url }
      : { id: String(++mockIdCounter), title, children: [] }
    p.node.children ??= []
    p.node.children.push(n)
    mockChanged()
    return n
  },
  async update(id, changes) {
    const hit = mockLocate(id)
    if (hit) Object.assign(hit.node, changes)
    mockChanged()
  },
  async move(id, { parentId }) {
    const hit = mockLocate(id)
    const dest = mockLocate(parentId)
    if (!hit || !dest) return
    hit.siblings.splice(hit.index, 1)
    dest.node.children ??= []
    dest.node.children.push(hit.node)
    mockChanged()
  },
  async remove(id) {
    return mockApi.removeTree(id)
  },
  async removeTree(id) {
    const hit = mockLocate(id)
    if (hit) hit.siblings.splice(hit.index, 1)
    mockChanged()
  }
}

export const api: BookmarksApi = IS_EXT
  ? {
      create: spec => chrome.bookmarks.create(spec) as Promise<RawBookmarkNode>,
      update: (id, ch) => chrome.bookmarks.update(id, ch),
      move: (id, dest) => chrome.bookmarks.move(id, dest),
      remove: id => chrome.bookmarks.remove(id),
      removeTree: id => chrome.bookmarks.removeTree(id)
    }
  : mockApi

export async function safeOp(fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn()
  } catch (e) {
    toast(`No se pudo completar: ${(e as Error).message ?? e}`)
  }
}

export async function loadTree(): Promise<RawBookmarkNode[]> {
  if (IS_EXT) return chrome.bookmarks.getTree() as Promise<RawBookmarkNode[]>
  return window.MOCK_TREE ?? []
}

export function folderOptions(excludeIds: Set<string> = new Set()): FolderOption[] {
  const out: FolderOption[] = []
  const walk = (items: RawBookmarkNode[], depth: number): void => {
    for (const it of items) {
      if (it.url || excludeIds.has(it.id)) continue
      out.push({ id: it.id, title: it.title || '(sin nombre)', depth })
      if (it.children) walk(it.children, depth + 1)
    }
  }
  walk(S.lastTree[0]?.children ?? [], 0)
  return out
}

/** Adopción: crear un marcador a partir de una pestaña suelta. */
export async function adopt(subj: Pick<GraphNode, 'title' | 'url'>, parentId: string, tag?: string): Promise<void> {
  const url = subj.url ?? ''
  const created = await api.create({ parentId, title: subj.title, url })
  if (tag) await setTags(url, [...tagsOf(url), tag])
  const where = tag ? `#${tag}` : `«${short(S.byId.get(parentId)?.title ?? 'carpeta')}»`
  toast(`«${short(subj.title)}» guardado en ${where}`, () =>
    safeOp(async () => {
      await api.remove(created.id)
      if (tag)
        await setTags(
          url,
          tagsOf(url).filter(t => t !== tag)
        )
    })
  )
}
