import { type ZoomTransform, zoomIdentity } from 'd3-zoom'
import { createSignal } from 'solid-js'
import { SERIES_VARS } from './constants'
import { HAS_SYNC } from './env'
import { type AppSettings, normalizeSettings, SETTINGS_DEFAULTS } from './lib/settings-shape'
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
  ViewStrategy,
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
  strategy: ViewStrategy
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
  keyboardFocusNode: GraphNode | null
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
  /** Dominios silenciados en la vista historial (ruido: buscadores, SSO…). */
  historyMuted: Set<string>
  /** Filtro de triaje: solo páginas sin marcador. No se persiste. */
  historyUnsavedOnly: boolean
  /** Guía en marcha: el grafo y las pestañas salen de los datos de muestra. */
  demo: boolean
  settings: AppSettings
}

/**
 * Estrategia inerte hasta que `loadPersistedState` carga la real (siempre
 * antes de cualquier render). No se importa `view-strategy` estáticamente a
 * propósito: arrastraría el grafo entero (build, d3, tags) a todo bundle que
 * toque `S` — el popup pesaba un tercio más solo por esta línea.
 */
const bootStrategy: ViewStrategy = {
  build: () => {},
  handleDrop: () => {},
  isDropTarget: () => false,
  supportsGhosts: false,
  supportsPresentation: false,
  supportsHeat: false,
  hostLinks: false,
  emptyMessage: () => ({ title: '', body: '' })
}

export const S: AppState = {
  viewMode: 'folders',
  strategy: bootStrategy,
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
  keyboardFocusNode: null,
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
  historyMuted: new Set(),
  historyUnsavedOnly: false,
  demo: false,
  settings: { ...SETTINGS_DEFAULTS }
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

/* --- reactividad de nivel aplicación ---

   `S` tiene dos niveles, y la lista de abajo es la frontera:

   - Campos CALIENTES (nodes, links, tf, hover…): planos, sin reactividad.
     d3-force muta node.x/node.y en cada tick y el pintado recorre S.nodes a
     60 fps; un store reactivo cobraría peaje de proxy en el camino más
     caliente para dar una finura que el canvas no usa — se repinta en bucle.

   - Campos de APLICACIÓN (los de REACTIVE_FIELDS): respaldados por señal vía
     defineProperty. La sintaxis no cambia (`S.viewMode = 'tags'` dispara la
     reactividad sola), y leerlos desde el canvas es una llamada a función.

   Regla de oro: un campo reactivo se REEMPLAZA, no se muta. `S.tagsMap[u]=x`
   o `S.historyMuted.add(d)` no disparan nada; hay que asignar un objeto/Set
   nuevo. Los contenedores que sí se mutan en sitio (expandedFolders, pinned,
   folderPrefs, favicons…) quedan fuera de la lista a propósito. */

const REACTIVE_FIELDS = [
  'viewMode',
  'strategy',
  'settings',
  'onlyOpen',
  'showGhosts',
  'winFilter',
  'searchQuery',
  'tagsMap',
  'savedSessions',
  'openTabs',
  'ghostTabs',
  'winList',
  'currentWinId',
  'historyRange',
  'historyGrouping',
  'historyMuted',
  'historyUnsavedOnly',
  'activeSubgraph',
  'demo'
] as const satisfies readonly (keyof AppState)[]

function reactiveField<K extends keyof AppState>(key: K): void {
  const [get, set] = createSignal<AppState[K]>(S[key])
  Object.defineProperty(S, key, {
    get,
    set: (v: AppState[K]) => set(() => v),
    enumerable: true,
    configurable: true
  })
}
for (const key of REACTIVE_FIELDS) reactiveField(key)

/**
 * Lo que la señal por campo no cubre: «el grafo se reconstruyó». Nodos,
 * clusters y allBms son calientes, así que las lecturas derivadas de ellos
 * declaran la dependencia llamando a graphVersion() y rebuild() la dispara
 * vía refreshPanels().
 */
const [graphVersion, setGraphVersion] = createSignal(0)

export { graphVersion }

export function bumpGraphVersion(): void {
  setGraphVersion(v => v + 1)
}

/** ¿Debe usarse chrome.storage.sync ahora mismo? API presente y ajuste activo. */
export function syncActive(): boolean {
  return HAS_SYNC && S.settings.syncEnabled
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
  const { strategies } = await import('./view-strategy')
  S.strategy = strategies[S.viewMode]
  S.onlyOpen = params.get('filter') === 'open' || (await loadStore('onlyOpen', false))
  S.showGhosts = await loadStore('ghosts', true)
  S.winFilter = await loadStore<WinFilter>('winFilter', 'all')
  S.pinned = await loadStore<PinnedLayouts>('layout', {})
  S.folderPrefs = await loadStore<FolderPreferences>('folderPrefs', {})
  S.historyRange = await loadStore<HistoryRange>('historyRange', { preset: '24h' })
  S.historyGrouping = await loadStore<HistoryGrouping>('historyGrouping', 'domain')
  S.historyMuted = new Set(await loadStore<string[]>('historyMuted', []))
  S.savedSessions = await loadStore<SavedSession[]>('sessions', [])
  S.settings = normalizeSettings(await loadStore<AppSettings>('settings', SETTINGS_DEFAULTS))
}
