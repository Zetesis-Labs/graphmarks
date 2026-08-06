import { type AppSettings, OPEN_SOURCE_ACTION, OPEN_SOURCE_PARAM } from './lib/settings-shape'

/**
 * Ir al grafo desde fuera de él (botón de la barra, popup): enfocar la pestaña
 * que ya lo muestra o abrir una nueva.
 *
 * Chrome reporta las pestañas capturadas por `chrome_url_overrides` como
 * chrome://newtab/, no con la URL de la extensión; solo cuentan como grafo si
 * la override sigue activa.
 */
export async function focusOrOpenGraph(settings: AppSettings): Promise<void> {
  const base = chrome.runtime.getURL('newtab.html')
  const isGraph = (u: string): boolean =>
    u.startsWith(base) || (settings.openMode === 'newtab' && u.startsWith('chrome://newtab'))

  const tabs = await chrome.tabs.query({})
  const graph = tabs.find(tb => isGraph(tb.url ?? tb.pendingUrl ?? ''))
  if (graph?.id !== undefined) {
    await chrome.tabs.update(graph.id, { active: true })
    if (graph.windowId !== undefined) await chrome.windows.update(graph.windowId, { focused: true })
    return
  }
  // ?source=action marca la apertura explícita que el modo «solo botón» respeta
  await chrome.tabs.create({ url: `${base}?${OPEN_SOURCE_PARAM}=${OPEN_SOURCE_ACTION}` })
}
