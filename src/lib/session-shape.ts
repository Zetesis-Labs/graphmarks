import type { SavedTab, SessionWindow } from '../types'

/** Captura y restauración de sesiones: la parte de decisión, sin `chrome.*`. */

export interface CaptureWindow {
  id?: number
  left?: number
  top?: number
  width?: number
  height?: number
  state?: string
  tabs: readonly CaptureTab[]
}

/** Pestaña cruda: campos conocidos más cualquier clave `*split*` que exponga Chrome. */
export type CaptureTab = Record<string, unknown> & {
  url?: string
  title?: string
  pinned?: boolean
  active?: boolean
  groupId?: number
}

export interface GroupMeta {
  title?: string
  color?: string
  collapsed?: boolean
}

/**
 * splitViewId es de solo lectura y su nombre puede variar entre versiones de
 * Chrome; aceptamos cualquier propiedad *split* con valor real.
 */
export function readSplitId(tab: Record<string, unknown>): number | null {
  let splitId: number | null = null
  for (const [k, v] of Object.entries(tab)) if (/split/i.test(k) && v != null && v !== -1) splitId = v as number
  return splitId
}

/** Indexado incremental de grupos: asigna índice denso la primera vez que aparece cada groupId. */
function groupIndexer(groupsById: ReadonlyMap<number, GroupMeta>): {
  groups: SessionWindow['groups']
  indexOf: (groupId: number | undefined) => number | null
} {
  const groups: SessionWindow['groups'] = []
  const gIndex = new Map<number, number>()
  const indexOf = (groupId: number | undefined): number | null => {
    if (groupId == null || groupId === -1) return null
    if (!gIndex.has(groupId)) {
      const g = groupsById.get(groupId)
      gIndex.set(groupId, groups.length)
      groups.push({ title: g?.title ?? '', color: g?.color ?? 'grey', collapsed: !!g?.collapsed })
    }
    return gIndex.get(groupId) ?? null
  }
  return { groups, indexOf }
}

function shapeWindow(
  w: CaptureWindow,
  groupsById: ReadonlyMap<number, GroupMeta>,
  excludedPrefixes: readonly string[]
): SessionWindow | null {
  const { groups, indexOf } = groupIndexer(groupsById)
  const tabs: SavedTab[] = []
  for (const t of w.tabs) {
    const url = t.url ?? ''
    if (!url || excludedPrefixes.some(p => url.startsWith(p))) continue
    tabs.push({
      url,
      title: t.title ?? url,
      pinned: !!t.pinned,
      active: !!t.active,
      groupIdx: indexOf(t.groupId),
      splitId: readSplitId(t)
    })
  }
  if (!tabs.length) return null
  return {
    bounds: { left: w.left, top: w.top, width: w.width, height: w.height, state: w.state },
    tabs,
    groups
  }
}

/** Ventanas de la sesión a guardar: filtra ámbito y URLs propias, indexa grupos y lee splits. */
export function shapeSessionWindows(
  wins: readonly CaptureWindow[],
  groupsById: ReadonlyMap<number, GroupMeta>,
  scope: 'all' | number,
  excludedPrefixes: readonly string[]
): SessionWindow[] {
  const windows: SessionWindow[] = []
  for (const w of wins) {
    if (scope !== 'all' && w.id !== scope) continue
    const win = shapeWindow(w, groupsById, excludedPrefixes)
    if (win) windows.push(win)
  }
  return windows
}

/** Ids de pestañas creadas por grupo guardado, listos para `chrome.tabs.group`. */
export function planTabGroups(
  tabs: readonly SavedTab[],
  createdIds: ReadonlyArray<number | null>
): Map<number, number[]> {
  const byGroup = new Map<number, number[]>()
  tabs.forEach((t, i) => {
    const id = createdIds[i]
    if (t.groupIdx == null || id == null) return
    if (!byGroup.has(t.groupIdx)) byGroup.set(t.groupIdx, [])
    byGroup.get(t.groupIdx)?.push(id)
  })
  return byGroup
}

/** Conjuntos de división con al menos dos pestañas reales. */
export function planSplitSets(tabs: readonly SavedTab[], createdIds: ReadonlyArray<number | null>): number[][] {
  const bySplit = new Map<number, number[]>()
  tabs.forEach((t, i) => {
    const id = createdIds[i]
    if (t.splitId == null || id == null) return
    if (!bySplit.has(t.splitId)) bySplit.set(t.splitId, [])
    bySplit.get(t.splitId)?.push(id)
  })
  return [...bySplit.values()].filter(ids => ids.length >= 2)
}

export interface WindowSpec {
  url: string[]
  state?: 'maximized' | 'fullscreen'
  left?: number
  top?: number
  width?: number
  height?: number
}

/** Propiedades de creación de la ventana: estado especial o geometría explícita. */
export function windowCreateSpec(bounds: SessionWindow['bounds'], urls: string[]): WindowSpec {
  const spec: WindowSpec = { url: urls }
  if (bounds.state === 'maximized' || bounds.state === 'fullscreen') spec.state = bounds.state
  else if (Number.isFinite(bounds.left)) {
    spec.left = bounds.left
    spec.top = bounds.top
    spec.width = bounds.width
    spec.height = bounds.height
  }
  return spec
}
