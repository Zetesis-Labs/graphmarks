import type { GraphNode } from '../types'
import type { GraphIndex } from './graph-index'

export interface QueryCondition {
  field: 'folder' | 'tag' | 'domain' | 'is' | 'visits' | 'title'
  operator: 'eq' | 'gt' | 'lt' | 'contains'
  value: string | number
  negated?: boolean
}

export type SortField = 'heat' | 'visits' | 'degree' | 'title'

export interface GraphQueryAST {
  conditions: QueryCondition[]
  sort?: { field: SortField; order: 'asc' | 'desc' }
  limit?: number
}

function normalizeStateValue(val: string): string {
  const norm = val.toLowerCase()
  if (['open', 'abierta', 'abiertas'].includes(norm)) return 'open'
  if (['ghost', 'fantasma', 'fantasmas'].includes(norm)) return 'ghost'
  if (['unsaved', 'sin-guardar'].includes(norm)) return 'unsaved'
  if (['pinned', 'fijado', 'fijados'].includes(norm)) return 'pinned'
  if (['folder', 'carpeta', 'carpetas'].includes(norm)) return 'folder'
  if (['bm', 'bookmark', 'marcador', 'marcadores'].includes(norm)) return 'bm'
  return norm
}

function parseVisitsCondition(val: string): QueryCondition {
  if (val.startsWith('>')) {
    return { field: 'visits', operator: 'gt', value: Number.parseInt(val.slice(1), 10) || 0 }
  }
  if (val.startsWith('<')) {
    return { field: 'visits', operator: 'lt', value: Number.parseInt(val.slice(1), 10) || 0 }
  }
  return { field: 'visits', operator: 'gt', value: Number.parseInt(val, 10) || 0 }
}

function processQueryToken(key: string | undefined, val: string, ast: GraphQueryAST): void {
  if (key === 'sort') {
    const [fieldStr, orderStr] = val.toLowerCase().split(':')
    const field = fieldStr as SortField
    const order = orderStr === 'asc' ? 'asc' : 'desc'
    if (['heat', 'visits', 'degree', 'title'].includes(field)) {
      ast.sort = { field, order }
    }
  } else if (key === 'limit') {
    const num = Number.parseInt(val, 10)
    if (!Number.isNaN(num) && num > 0) ast.limit = num
  } else if (key === 'folder') {
    ast.conditions.push({ field: 'folder', operator: 'contains', value: val.toLowerCase() })
  } else if (key === 'tag') {
    ast.conditions.push({ field: 'tag', operator: 'eq', value: val.toLowerCase() })
  } else if (key === 'domain') {
    ast.conditions.push({ field: 'domain', operator: 'contains', value: val.toLowerCase() })
  } else if (key === 'is') {
    ast.conditions.push({ field: 'is', operator: 'eq', value: normalizeStateValue(val) })
  } else if (key === 'visits') {
    ast.conditions.push(parseVisitsCondition(val))
  } else if (!key) {
    ast.conditions.push({ field: 'title', operator: 'contains', value: val.toLowerCase() })
  }
}

export function parseGraphQuery(rawQuery: string): GraphQueryAST {
  const ast: GraphQueryAST = { conditions: [] }
  if (!rawQuery.trim()) return ast

  const tokens: Array<{ key?: string; val: string }> = []
  const regex = /(?:(\w+):)?(?:"([^"]+)"|'([^']+)'|(\S+))/g
  let match: RegExpExecArray | null = regex.exec(rawQuery)

  while (match !== null) {
    const key = match[1]?.toLowerCase()
    const val = match[2] ?? match[3] ?? match[4] ?? ''
    if (val) tokens.push({ key, val })
    match = regex.exec(rawQuery)
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!tok) continue

    // Soporte para "is open", "is abierta", "is fantasma" sin dos puntos
    if (!tok.key && tok.val.toLowerCase() === 'is' && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1]
      if (nextTok && !nextTok.key) {
        const normState = normalizeStateValue(nextTok.val)
        ast.conditions.push({ field: 'is', operator: 'eq', value: normState })
        i++
        continue
      }
    }

    processQueryToken(tok.key, tok.val, ast)
  }

  return ast
}

export function evaluateGraphQuery(
  ast: GraphQueryAST,
  index: GraphIndex,
  openTabs: Map<string, unknown> = new Map(),
  pinnedIds: Set<string> = new Set()
): GraphNode[] {
  let matched = index.filterNodes(node => {
    for (const cond of ast.conditions) {
      if (!matchCondition(cond, node, index, openTabs, pinnedIds)) return false
    }
    return true
  })

  if (ast.sort) {
    const { field, order } = ast.sort
    const dir = order === 'asc' ? 1 : -1
    matched = matched.sort((a, b) => {
      if (field === 'heat') return ((a.heat ?? 0) - (b.heat ?? 0)) * dir
      if (field === 'visits') return ((a.count ?? 0) - (b.count ?? 0)) * dir
      if (field === 'degree') return (index.getDegree(a.id) - index.getDegree(b.id)) * dir
      if (field === 'title') return a.title.localeCompare(b.title) * dir
      return 0
    })
  }

  if (ast.limit && ast.limit > 0) {
    matched = matched.slice(0, ast.limit)
  }

  return matched
}

function isOpenTabNode(node: GraphNode, openTabs: Map<string, unknown>): boolean {
  if (node.type === 'ghost') return true
  if (openTabs.has(node.id)) return true
  if (node.raw && (openTabs.has(`b${node.raw}`) || openTabs.has(node.raw))) return true
  if (node.url) {
    for (const openList of openTabs.values()) {
      if (Array.isArray(openList) && openList.some((t: { url?: string }) => t?.url === node.url)) return true
    }
  }
  return false
}

function matchStateCondition(
  state: string,
  node: GraphNode,
  openTabs: Map<string, unknown>,
  pinnedIds: Set<string>
): boolean {
  const normState = normalizeStateValue(state)
  switch (normState) {
    case 'open':
      return isOpenTabNode(node, openTabs)
    case 'unsaved':
      return !!node.unsaved
    case 'ghost':
      return node.type === 'ghost'
    case 'pinned':
      return pinnedIds.has(node.id) || (node.raw ? pinnedIds.has(node.raw) : false)
    case 'folder':
      return node.type === 'folder'
    case 'bm':
      return node.type === 'bm'
    default:
      return true
  }
}

function matchCondition(
  cond: QueryCondition,
  node: GraphNode,
  index: GraphIndex,
  openTabs: Map<string, unknown>,
  pinnedIds: Set<string>
): boolean {
  switch (cond.field) {
    case 'tag':
      return (node.tags?.map(t => t.toLowerCase()) ?? []).includes(String(cond.value))
    case 'folder': {
      const target = String(cond.value).toLowerCase()
      if (node.folderId?.toLowerCase().includes(target)) return true
      if (node.raw?.toLowerCase().includes(target)) return true
      const ancestorTitles = index.getAncestorFolderTitles(node.id)
      return ancestorTitles.some((t: string) => t.includes(target))
    }
    case 'domain':
      return node.mHost ? node.mHost.toLowerCase().includes(String(cond.value)) : false
    case 'title':
      return node.title.toLowerCase().includes(String(cond.value))
    case 'visits': {
      const v = node.count ?? 0
      const target = Number(cond.value)
      if (cond.operator === 'gt') return v > target
      if (cond.operator === 'lt') return v < target
      return v === target
    }
    case 'is':
      return matchStateCondition(String(cond.value), node, openTabs, pinnedIds)
    default:
      return true
  }
}
