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
    ast.conditions.push({ field: 'is', operator: 'eq', value: val.toLowerCase() })
  } else if (key === 'visits') {
    ast.conditions.push(parseVisitsCondition(val))
  } else if (!key) {
    ast.conditions.push({ field: 'title', operator: 'contains', value: val.toLowerCase() })
  }
}

export function parseGraphQuery(rawQuery: string): GraphQueryAST {
  const ast: GraphQueryAST = { conditions: [] }
  if (!rawQuery.trim()) return ast

  const regex = /(?:(\w+):)?(?:"([^"]+)"|'([^']+)'|(\S+))/g
  let match: RegExpExecArray | null = regex.exec(rawQuery)

  while (match !== null) {
    const key = match[1]?.toLowerCase()
    const val = match[2] ?? match[3] ?? match[4] ?? ''
    match = regex.exec(rawQuery)
    if (val) processQueryToken(key, val, ast)
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

function matchStateCondition(
  state: string,
  node: GraphNode,
  openTabs: Map<string, unknown>,
  pinnedIds: Set<string>
): boolean {
  if (state === 'open') return openTabs.has(node.id) || node.type === 'ghost'
  if (state === 'unsaved') return !!node.unsaved
  if (state === 'ghost') return node.type === 'ghost'
  if (state === 'pinned') return pinnedIds.has(node.id)
  if (state === 'folder') return node.type === 'folder'
  if (state === 'bm' || state === 'bookmark') return node.type === 'bm'
  return true
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
