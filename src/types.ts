import type { SimulationNodeDatum } from 'd3-force'

export type ViewMode = 'folders' | 'tags' | 'domains'

export type NodeType = 'bm' | 'folder' | 'ghost'
export type NodeSubtype = 'tag' | 'domain' | 'ghosthub'

/** Pestaña abierta normalizada (real o simulada en la preview). */
export interface TabInfo {
  id: number
  windowId: number
  title: string
  url: string
  host: string
  active: boolean
  last: number
}

/** Ventana abierta, para el filtro ⊞ y las sesiones. */
export interface WindowSummary {
  id: number
  count: number
  title: string
}

/**
 * Nodo del grafo. Es deliberadamente un tipo ancho (no unión discriminada):
 * los nodos viven en un canvas heterogéneo y el coste de estrechar en cada
 * acceso supera al beneficio; `type`/`subtype` guían los usos.
 */
export interface GraphNode extends SimulationNodeDatum {
  id: string
  type: NodeType
  title: string
  subtype?: NodeSubtype
  /** id real de chrome.bookmarks (solo bm/carpeta reales) */
  raw?: string
  url?: string
  host?: string
  /** host en minúsculas para el matching de pestañas/historial */
  mHost?: string
  /** ruta normalizada para el matching por prefijo */
  mPath?: string
  count?: number
  cluster?: string
  parentId?: string | null
  folderId?: string | null
  tags?: string[]
  hubs?: string[]
  tag?: string | null
  tab?: TabInfo
  heat?: number
  /** timestamp de nacimiento: anima la entrada del nodo y luego se limpia */
  born?: number
}

export type LinkKind = 'tree' | 'host'

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: LinkKind
}

export interface Cluster {
  id: string
  title: string
  count: number
  slot?: number
}

export interface Colors {
  surface: string
  page: string
  ink: string
  ink2: string
  muted: string
  grid: string
  baseline: string
  other: string
  series: string[]
}

/** Nodo del árbol de marcadores (chrome.bookmarks.BookmarkTreeNode o mock). */
export interface RawBookmarkNode {
  id: string
  title: string
  url?: string
  children?: RawBookmarkNode[]
}

export type TagsMap = Record<string, string[]>
export type PinMap = Record<string, { x: number; y: number }>
export type PinnedLayouts = Partial<Record<ViewMode, PinMap>>
export type WinFilter = 'all' | 'current' | number

export interface SavedTab {
  url: string
  title: string
  pinned: boolean
  active: boolean
  groupIdx: number | null
  splitId: number | null
}

export interface SavedGroup {
  title: string
  color: string
  collapsed: boolean
}

export interface SavedWindowBounds {
  left?: number
  top?: number
  width?: number
  height?: number
  state?: string
}

export interface SessionWindow {
  bounds: SavedWindowBounds
  tabs: SavedTab[]
  groups: SavedGroup[]
}

export interface SavedSession {
  id: string
  name: string
  created: string
  windows: SessionWindow[]
}

export interface FolderOption {
  id: string
  title: string
  depth: number
}

export type HitAux = { type: 'sat'; tab: TabInfo } | { type: 'plus' }

export interface HitResult {
  node: GraphNode | null
  aux: HitAux | null
}

export interface MenuItem {
  label?: string
  danger?: boolean
  sep?: boolean
  action?: () => void
}

export interface DialogSelectOption {
  value: string
  label: string
}

export interface DialogField {
  name: string
  label: string
  type?: 'text' | 'url' | 'select' | 'tags'
  value?: string
  placeholder?: string
  required?: boolean
  options?: DialogSelectOption[]
  cloud?: Array<[string, number]>
}

export interface DialogSpec {
  title: string
  fields?: DialogField[]
  submitLabel?: string
  danger?: boolean
  note?: string
}

export interface ExportPayload {
  app: string
  version: number
  exported: string
  tags?: TagsMap
  layout?: PinnedLayouts
  sessions?: SavedSession[]
}

declare global {
  interface Window {
    MOCK_TREE?: RawBookmarkNode[]
    SEED_TAGS?: Record<string, string[]>
  }
}
