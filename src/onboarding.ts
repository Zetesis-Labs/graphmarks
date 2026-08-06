import { app } from './bus'
import { members } from './graph/build'
import { radius } from './graph/style'
import { invalidateHistoryGraph } from './history-view'
import { t } from './i18n'
import { nodeMenu } from './interactions'
import { loadStore, saveStore } from './lib/storage'
import { type Rect, unionRects } from './lib/tour-place'
import { changedKeys, NEUTRAL_SCENE, resolveScene, type TourScene } from './lib/tour-scene'
import { refreshPanels, setActiveView } from './panels'
import { S } from './state'
import type { GraphNode, TagsMap, ViewMode } from './types'
import { canvas, listPanel, menuEl, resultsEl, searchBox, sessionsEl, tabcountEl, viewsEl } from './ui/dom'
import { hideMenu, showMenu } from './ui/menu'
import { isTourOpen, startTour, type TourStep } from './ui/tour'

/**
 * Guía del primer uso: un modo demo sobre el grafo de muestra (window.MOCK_TREE)
 * en el que la propia guía conduce la app — busca, cambia de vista, abre menús —
 * sin tocar los datos ni las preferencias del usuario.
 */

interface SavedState {
  viewMode: ViewMode
  onlyOpen: boolean
  tagsMap: TagsMap
}

let saved: SavedState | null = null

async function enterDemo(): Promise<void> {
  saved = { viewMode: S.viewMode, onlyOpen: S.onlyOpen, tagsMap: S.tagsMap }
  S.demo = true
  S.onlyOpen = false
  setActiveView('folders')
  S.tagsMap = { ...(window.SEED_TAGS ?? {}) }
  scene = NEUTRAL_SCENE
  sceneGen += 1
  invalidateHistoryGraph()
  refreshPanels()
  await app.rebuild(true)
}

async function exitDemo(): Promise<void> {
  if (!saved) return
  S.demo = false
  setActiveView(saved.viewMode)
  S.onlyOpen = saved.onlyOpen
  S.tagsMap = saved.tagsMap
  saved = null
  scene = NEUTRAL_SCENE
  sceneGen += 1
  listPanel.hidden = true
  hideMenu()
  app.clearSearch()
  invalidateHistoryGraph()
  refreshPanels()
  await app.rebuild(true)
}

function elRect(el: HTMLElement): Rect | null {
  const r = el.getBoundingClientRect()
  return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
}

/** El hub con más contenido: estable, céntrico y con etiqueta visible. */
function biggestHub(): GraphNode | null {
  let best: GraphNode | null = null
  for (const n of S.nodes) {
    if (n.type === 'folder' && (best === null || (n.count ?? 0) > (best.count ?? 0))) best = n
  }
  return best
}

function rectOfNode(n: GraphNode | null): Rect | null {
  if (!n || n.x === undefined || n.y === undefined) return null
  const c = canvas.getBoundingClientRect()
  const x = c.left + S.tf.applyX(n.x)
  const y = c.top + S.tf.applyY(n.y)
  const r = radius(n) * S.tf.k + 14
  return { x: x - r, y: y - r, w: r * 2, h: r * 2 }
}

function firstOpenNode(): GraphNode | null {
  const id = [...S.openTabs.keys()][0]
  return id ? (S.byId.get(id) ?? null) : null
}

/* --- aplicador de escenas ---
   Cada paso declara su escena completa y esto reconcilia contra la vigente,
   tocando solo lo que cambia. Una generación descarta los efectos diferidos
   de una escena que ya quedó atrás (clics rápidos en atrás/siguiente). */

let scene: TourScene = NEUTRAL_SCENE
let sceneGen = 0

const MENU_SETTLE_MS = 700

function focusCamera(target: TourScene['focus']): void {
  if (target === 'hub') {
    const hub = biggestHub()
    if (hub) app.zoomToNodes(members(hub), 120)
    return
  }
  if (target === 'firstOpen') {
    const n = firstOpenNode()
    if (n) app.zoomToNodes([n], 220)
    return
  }
  app.zoomToNodes(S.nodes, 80)
}

async function applyScene(next: TourScene): Promise<void> {
  const gen = ++sceneGen
  const changed = changedKeys(scene, next)
  scene = next
  if (!changed.size) return

  // el menú pertenece a un único paso: fuera antes de tocar nada más
  hideMenu()

  if (changed.has('search')) {
    if (next.search) {
      searchBox.value = next.search
      app.applySearch(next.search)
    } else app.clearSearch()
  }

  if (changed.has('view')) setActiveView(next.view)
  if (changed.has('onlyOpen')) S.onlyOpen = next.onlyOpen

  const rebuilt = changed.has('view') || changed.has('onlyOpen')
  if (rebuilt) await app.rebuild(false)
  if (gen !== sceneGen) return

  listPanel.hidden = !next.listOpen
  if (rebuilt || changed.has('focus') || changed.has('search')) focusCamera(next.focus)

  if (next.menuOnHub) {
    // dejar que el encuadre asiente antes de abrir el menú sobre el nodo
    setTimeout(() => {
      if (gen !== sceneGen || !isTourOpen() || !scene.menuOnHub) return
      const hub = biggestHub()
      const r = rectOfNode(hub)
      if (hub && r) showMenu(r.x + r.w + 4, r.y, nodeMenu(hub))
    }, MENU_SETTLE_MS)
  }
}

interface SceneStep {
  titleKey: Parameters<typeof t>[0]
  bodyKey: Parameters<typeof t>[0]
  scene?: Partial<TourScene>
  target?: () => Rect | null
  ctaKey?: Parameters<typeof t>[0]
}

/** Los pasos son datos: título, cuerpo, a qué apuntan y qué escena piden. */
const SCENE_STEPS: SceneStep[] = [
  { titleKey: 'tourWelcomeTitle', bodyKey: 'tourWelcomeBody' },
  {
    titleKey: 'tourClustersTitle',
    bodyKey: 'tourClustersBody',
    scene: { focus: 'hub' },
    target: () => rectOfNode(biggestHub())
  },
  {
    titleKey: 'tourSearchTitle',
    bodyKey: 'tourSearchBody',
    scene: { search: 'docs' },
    // el foco abraza también el desplegable de resultados; el popover lo esquiva
    target: () => unionRects(elRect(searchBox), resultsEl.hidden ? null : elRect(resultsEl))
  },
  { titleKey: 'tourTagsTitle', bodyKey: 'tourTagsBody', scene: { view: 'tags' }, target: () => elRect(viewsEl) },
  {
    titleKey: 'tourDomainsTitle',
    bodyKey: 'tourDomainsBody',
    scene: { view: 'domains' },
    target: () => elRect(viewsEl)
  },
  {
    titleKey: 'tourHistoryTitle',
    bodyKey: 'tourHistoryBody',
    scene: { view: 'history' },
    target: () => elRect(viewsEl)
  },
  {
    titleKey: 'tourMenuTitle',
    bodyKey: 'tourMenuBody',
    scene: { menuOnHub: true },
    // el menú abierto forma parte del objetivo: el popover no se le pone encima
    target: () => unionRects(rectOfNode(biggestHub()), menuEl.hidden ? null : elRect(menuEl))
  },
  {
    titleKey: 'tourOpenTabsTitle',
    bodyKey: 'tourOpenTabsBody',
    scene: { focus: 'firstOpen' },
    target: () => rectOfNode(firstOpenNode())
  },
  {
    titleKey: 'tourOnlyOpenTitle',
    bodyKey: 'tourOnlyOpenBody',
    scene: { onlyOpen: true },
    target: () => elRect(tabcountEl)
  },
  { titleKey: 'tourListTitle', bodyKey: 'tourListBody', scene: { listOpen: true }, target: () => elRect(listPanel) },
  { titleKey: 'tourSessionsTitle', bodyKey: 'tourSessionsBody', target: () => elRect(sessionsEl) },
  { titleKey: 'tourPrivacyTitle', bodyKey: 'tourPrivacyBody' },
  { titleKey: 'tourGesturesTitle', bodyKey: 'tourGesturesBody', ctaKey: 'tourStart' }
]

function tourSteps(): TourStep[] {
  return SCENE_STEPS.map(step => ({
    title: t(step.titleKey),
    body: t(step.bodyKey),
    ...(step.target ? { target: step.target } : {}),
    ...(step.ctaKey ? { cta: t(step.ctaKey) } : {}),
    onEnter: () => void applyScene(resolveScene(step.scene))
  }))
}

export function startOnboarding(): void {
  if (isTourOpen()) return
  void (async () => {
    await enterDemo()
    startTour(tourSteps(), () => {
      void exitDemo()
      void saveStore('onboarded', true)
    })
  })()
}

/** Primera ejecución sin flag: la guía arranca sola; saltarla también la marca vista. */
export async function maybeStartOnboarding(): Promise<void> {
  if (await loadStore('onboarded', false)) return
  startOnboarding()
}
