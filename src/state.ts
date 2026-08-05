import { type ZoomTransform, zoomIdentity } from 'd3-zoom'
import { SERIES_VARS } from './constants'
import { loadStore, saveStore } from './lib/storage'
import type {
  Cluster,
  Colors,
  FolderPreferences,
  GraphLink,
  GraphNode,
  HistoryGrouping,
  HistoryRange,
  HitAux,
  PinMap,
  PinnedLayouts,
  RawBookmarkNode,
  SavedSession,
  TabInfo,
  TagsMap,
  ViewMode,
  WindowSummary,
  WinFilter
} from './types'

export interface FaviconRecord {
  img: HTMLImageElement
  ok: boolean
}

/**
 * Estado mutable de la aplicación. Un único store plano: los módulos leen y
 * escriben `S` en vez de repartir singletons por archivo.
 */
export interface AppState {
  viewMode: ViewMode
  tagsMap: TagsMap
  nodes: GraphNode[]
  links: GraphLink[]
  byId: Map<string, GraphNode>
  neighbors: Map<string, Set<string>>
  clusters: Cluster[]
  clusterOf: Map<string, Cluster>
  lastTree: RawBookmarkNode[]
  tf: ZoomTransform
  hoverNode: GraphNode | null
  hoverAux: HitAux | null
  focusSet: Set<string> | null
  searchQuery: string
  searchFocusNode: GraphNode | null
  dropTarget: GraphNode | null
  favicons: Map<string, FaviconRecord>
  openTabs: Map<string, TabInfo[]>
  onlyOpen: boolean
  lastOpenKey: string
  allBms: GraphNode[]
  ghostTabs: TabInfo[]
  showGhosts: boolean
  pinned: PinnedLayouts
  winFilter: WinFilter
  currentWinId: number | null
  winList: WindowSummary[]
  heatByUrl: Map<string, number>
  savedSessions: SavedSession[]
  customIcons: Map<string, FaviconRecord>
  customColors: Record<string, string>
  folderPrefs: FolderPreferences
  /** Subgrafo abierto durante esta pestaña; no se restaura al abrir otra. */
  activeSubgraph: string | null
  /** Carpetas plegadas por defecto que el usuario ha abierto temporalmente. */
  expandedFolders: Set<string>
  historyRange: HistoryRange
  historyGrouping: HistoryGrouping
  /** Guía en marcha: el grafo y las pestañas salen de los datos de muestra. */
  demo: boolean
}

export const S: AppState = {
  viewMode: 'folders',
  tagsMap: {},
  nodes: [],
  links: [],
  byId: new Map(),
  neighbors: new Map(),
  clusters: [],
  clusterOf: new Map(),
  lastTree: [],
  tf: zoomIdentity,
  hoverNode: null,
  hoverAux: null,
  focusSet: null,
  searchQuery: '',
  searchFocusNode: null,
  dropTarget: null,
  favicons: new Map(),
  openTabs: new Map(),
  onlyOpen: false,
  lastOpenKey: '',
  allBms: [],
  ghostTabs: [],
  showGhosts: true,
  pinned: {},
  winFilter: 'all',
  currentWinId: null,
  winList: [],
  heatByUrl: new Map(),
  savedSessions: [],
  customIcons: new Map(),
  customColors: {},
  folderPrefs: {},
  activeSubgraph: null,
  expandedFolders: new Set(),
  historyRange: { preset: '24h' },
  historyGrouping: 'domain',
  demo: false
}

export const COLORS: Colors = {
  surface: '',
  page: '',
  ink: '',
  ink2: '',
  muted: '',
  grid: '',
  baseline: '',
  other: '',
  series: []
}

export function readColors(): void {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  COLORS.surface = v('--surface-1')
  COLORS.page = v('--page')
  COLORS.ink = v('--text-primary')
  COLORS.ink2 = v('--text-secondary')
  COLORS.muted = v('--text-muted')
  COLORS.grid = v('--gridline')
  COLORS.baseline = v('--baseline')
  COLORS.other = v('--other')
  COLORS.series = SERIES_VARS.map(v)
}

/** Pins (layout manual) de la vista activa. */
export function pinsOfView(): PinMap {
  S.pinned[S.viewMode] ??= {}
  return S.pinned[S.viewMode] as PinMap
}

let layoutTimer: ReturnType<typeof setTimeout> | undefined
export function saveLayoutSoon(): void {
  clearTimeout(layoutTimer)
  layoutTimer = setTimeout(() => void saveStore('layout', S.pinned), 400)
}

export async function loadPersistedState(params: URLSearchParams): Promise<void> {
  const view = params.get('view') ?? (await loadStore<string>('view', 'folders'))
  S.viewMode = view === 'tags' || view === 'domains' || view === 'history' ? view : 'folders'
  S.onlyOpen = params.get('filter') === 'open' || (await loadStore('onlyOpen', false))
  S.showGhosts = await loadStore('ghosts', true)
  S.winFilter = await loadStore<WinFilter>('winFilter', 'all')
  S.pinned = await loadStore<PinnedLayouts>('layout', {})
  S.folderPrefs = await loadStore<FolderPreferences>('folderPrefs', {})
  S.historyRange = await loadStore<HistoryRange>('historyRange', { preset: '24h' })
  S.historyGrouping = await loadStore<HistoryGrouping>('historyGrouping', 'domain')
  S.savedSessions = await loadStore<SavedSession[]>('sessions', [])
}
