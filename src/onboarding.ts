import { app } from './bus'
import { members } from './graph/build'
import { radius } from './graph/style'
import { invalidateHistoryGraph } from './history-view'
import { t } from './i18n'
import { nodeMenu } from './interactions'
import { loadStore, saveStore } from './lib/storage'
import { type Rect, unionRects } from './lib/tour-place'
import { buildViews } from './panels'
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
  S.viewMode = 'folders'
  S.activeSubgraph = null
  S.tagsMap = { ...(window.SEED_TAGS ?? {}) }
  invalidateHistoryGraph()
  buildViews()
  await app.rebuild(true)
}

async function exitDemo(): Promise<void> {
  if (!saved) return
  S.demo = false
  S.viewMode = saved.viewMode
  S.onlyOpen = saved.onlyOpen
  S.tagsMap = saved.tagsMap
  saved = null
  hideMenu()
  app.clearSearch()
  invalidateHistoryGraph()
  buildViews()
  await app.rebuild(true)
}

/** Cambio de vista sin persistir la preferencia del usuario. */
async function switchView(mode: ViewMode): Promise<void> {
  if (S.viewMode === mode) return
  S.viewMode = mode
  S.activeSubgraph = null
  buildViews()
  await app.rebuild(false)
  app.zoomToNodes(S.nodes, 80)
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

function tourSteps(): TourStep[] {
  return [
    { title: t('tourWelcomeTitle'), body: t('tourWelcomeBody') },
    {
      title: t('tourClustersTitle'),
      body: t('tourClustersBody'),
      target: () => rectOfNode(biggestHub()),
      onEnter: () => {
        const hub = biggestHub()
        if (hub) app.zoomToNodes(members(hub), 120)
      }
    },
    {
      title: t('tourSearchTitle'),
      body: t('tourSearchBody'),
      // el foco abraza también el desplegable de resultados; el popover lo esquiva
      target: () => unionRects(elRect(searchBox), resultsEl.hidden ? null : elRect(resultsEl)),
      onEnter: () => {
        app.zoomToNodes(S.nodes, 80)
        searchBox.value = 'docs'
        app.applySearch('docs')
      }
    },
    {
      title: t('tourTagsTitle'),
      body: t('tourTagsBody'),
      target: () => elRect(viewsEl),
      onEnter: () => {
        app.clearSearch()
        void switchView('tags')
      }
    },
    {
      title: t('tourDomainsTitle'),
      body: t('tourDomainsBody'),
      target: () => elRect(viewsEl),
      onEnter: () => void switchView('domains')
    },
    {
      title: t('tourHistoryTitle'),
      body: t('tourHistoryBody'),
      target: () => elRect(viewsEl),
      onEnter: () => void switchView('history')
    },
    {
      title: t('tourMenuTitle'),
      body: t('tourMenuBody'),
      // el menú abierto forma parte del objetivo: el popover no se le pone encima
      target: () => unionRects(rectOfNode(biggestHub()), menuEl.hidden ? null : elRect(menuEl)),
      onEnter: () => {
        void switchView('folders').then(() => {
          // dejar que el encuadre asiente antes de abrir el menú sobre el nodo
          setTimeout(() => {
            if (!isTourOpen()) return
            const hub = biggestHub()
            const r = rectOfNode(hub)
            if (hub && r) showMenu(r.x + r.w + 4, r.y, nodeMenu(hub))
          }, 700)
        })
      }
    },
    {
      title: t('tourOpenTabsTitle'),
      body: t('tourOpenTabsBody'),
      target: () => rectOfNode(firstOpenNode()),
      onEnter: () => {
        hideMenu()
        const n = firstOpenNode()
        if (n) app.zoomToNodes([n], 220)
      }
    },
    {
      title: t('tourOnlyOpenTitle'),
      body: t('tourOnlyOpenBody'),
      target: () => elRect(tabcountEl),
      onEnter: () => {
        void (async () => {
          S.onlyOpen = true
          await app.rebuild(false)
          app.zoomToNodes(S.nodes, 80)
        })()
      }
    },
    {
      title: t('tourListTitle'),
      body: t('tourListBody'),
      target: () => elRect(listPanel),
      onEnter: () => {
        void (async () => {
          S.onlyOpen = false
          await app.rebuild(false)
          app.zoomToNodes(S.nodes, 80)
          listPanel.hidden = false
        })()
      }
    },
    {
      title: t('tourSessionsTitle'),
      body: t('tourSessionsBody'),
      target: () => elRect(sessionsEl),
      onEnter: () => {
        listPanel.hidden = true
      }
    },
    { title: t('tourPrivacyTitle'), body: t('tourPrivacyBody') },
    { title: t('tourGesturesTitle'), body: t('tourGesturesBody'), cta: t('tourStart') }
  ]
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
