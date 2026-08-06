import { IS_EXT } from './env'
import { isGraphTabUrl } from './lib/graph-url'
import {
  type AppSettings,
  NATIVE_NEWTAB_URL,
  OPEN_SOURCE_ACTION,
  OPEN_SOURCE_PARAM,
  shouldReleaseNewTab
} from './lib/settings-shape'

/** Activar una pestaña y traer su ventana al frente (el par siempre va junto). */
export async function focusTab(tabId: number, windowId?: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true })
  if (windowId !== undefined) await chrome.windows.update(windowId, { focused: true })
}

/**
 * Ir al grafo desde fuera de él (botón de la barra, popup): enfocar la pestaña
 * que ya lo muestra o abrir una nueva.
 */
export async function focusOrOpenGraph(settings: AppSettings): Promise<void> {
  const base = chrome.runtime.getURL('newtab.html')
  const takeover = settings.openMode === 'newtab'
  const tabs = await chrome.tabs.query({})
  const graph = tabs.find(tb => isGraphTabUrl(tb.url ?? tb.pendingUrl ?? '', base, takeover))
  if (graph?.id !== undefined) {
    await focusTab(graph.id, graph.windowId)
    return
  }
  // ?source=action marca la apertura explícita que el modo «solo botón» respeta
  await chrome.tabs.create({ url: `${base}?${OPEN_SOURCE_PARAM}=${OPEN_SOURCE_ACTION}` })
}

/**
 * Con «solo botón», la pestaña nueva se devuelve al NTP nativo navegando a él.
 * En Firefox esa URL es privilegiada y la navegación falla: se degrada
 * mostrando el grafo, que siempre es mejor que una pestaña muerta.
 */
export async function maybeReleaseNewTab(settings: AppSettings, params: URLSearchParams): Promise<boolean> {
  if (!IS_EXT || !chrome.tabs) return false
  if (!shouldReleaseNewTab(settings, params.get(OPEN_SOURCE_PARAM))) return false
  try {
    const own = await chrome.tabs.getCurrent()
    if (own?.id === undefined) return false
    await chrome.tabs.update(own.id, { url: NATIVE_NEWTAB_URL })
    return true
  } catch {
    // degradación deliberada: sin NTP alcanzable, se sigue con el arranque normal
    return false
  }
}
