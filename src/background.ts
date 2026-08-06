/* Service worker: omnibox «gm» para saltar a marcadores y pestañas, y el
   comportamiento del botón de la barra. */

import { focusOrOpenGraph, focusTab } from './graph-tab'
import { type AppSettings, normalizeSettings, resolveActionMode, SETTINGS_DEFAULTS } from './lib/settings-shape'

const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

chrome.omnibox.setDefaultSuggestion({ description: chrome.i18n.getMessage('omniboxDefault') })

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (!text.trim()) {
    suggest([])
    return
  }
  void chrome.bookmarks.search(text).then(res => {
    suggest(
      res
        .filter(b => b.url)
        .slice(0, 6)
        .map(b => ({
          content: b.url ?? '',
          description: `${esc(b.title || (b.url ?? ''))} <dim>—</dim> <url>${esc(b.url ?? '')}</url>`
        }))
    )
  })
})

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    let url = text
    if (!/^https?:/.test(url)) {
      const res = await chrome.bookmarks.search(text)
      const hit = res.find(b => b.url)?.url
      if (!hit) return
      url = hit
    }
    // si ya hay una pestaña abierta con esa URL (o una subruta), ir a ella
    const tabs = await chrome.tabs.query({})
    const base = url.replace(/\/$/, '')
    const open = tabs.find(t => t.url === url || t.url === base || (t.url ?? '').startsWith(`${base}/`))
    if (open?.id !== undefined) {
      await focusTab(open.id, open.windowId)
      return
    }
    if (disposition === 'currentTab') void chrome.tabs.update({ url })
    else void chrome.tabs.create({ url, active: disposition === 'newForegroundTab' })
  })()
})

/* --- botón de la barra ---
   El popup no se declara en el manifest sino que se pone y se quita en
   caliente: `default_popup` y `onClicked` son excluyentes, y solo así puede
   un ajuste decidir entre capturar y abrir el grafo. Sin popup puesto manda
   onClicked, que abre el grafo — la degradación menos sorprendente si el
   service worker aún no ha arrancado. */

const OPEN_GRAPH = 'open-graph'
const SAVE_PAGE = 'save-page'
const POPUP_PAGE = 'popup.html'
/** El popup avisa de su cierre por este puerto; ver openCapturePopup. */
const CAPTURE_PORT = 'capture-popup'

async function currentSettings(): Promise<AppSettings> {
  try {
    const stored = await chrome.storage.local.get('settings')
    return normalizeSettings(stored.settings)
  } catch {
    // almacenamiento inaccesible: el comportamiento por defecto sigue siendo válido
    return { ...SETTINGS_DEFAULTS }
  }
}

async function applyActionMode(): Promise<void> {
  const settings = await currentSettings()
  const mode = resolveActionMode(settings)
  await chrome.action.setPopup({ popup: mode === 'capture' ? POPUP_PAGE : '' })

  // el menú del icono ofrece siempre lo que el clic no hace
  const inverse = mode === 'capture' ? OPEN_GRAPH : SAVE_PAGE
  await chrome.contextMenus?.removeAll()
  chrome.contextMenus?.create({
    id: inverse,
    title: chrome.i18n.getMessage(inverse === OPEN_GRAPH ? 'menuActionOpenGraph' : 'menuActionSavePage'),
    contexts: ['action']
  })
}

const openCaptureWindow = (): Promise<unknown> =>
  chrome.windows.create({ url: POPUP_PAGE, type: 'popup', width: 380, height: 480 })

/**
 * Abrir la captura sin pasar por el botón. El popup anclado solo se puede
 * abrir si hay uno puesto, así que se pone aquí y lo devuelve a su sitio
 * `applyActionMode` cuando el popup se cierra (onDisconnect del puerto).
 * `openPopup()` existe en Firefox y en Chrome ≥127; sin él, ventana propia.
 */
async function openCapturePopup(): Promise<void> {
  await chrome.action.setPopup({ popup: POPUP_PAGE })
  try {
    if (chrome.action.openPopup) await chrome.action.openPopup()
    else await openCaptureWindow()
  } catch {
    await openCaptureWindow().catch(() => applyActionMode())
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== CAPTURE_PORT) return
  port.onDisconnect.addListener(() => void applyActionMode())
})

chrome.contextMenus?.onClicked.addListener(info => {
  if (info.menuItemId === OPEN_GRAPH) void (async () => focusOrOpenGraph(await currentSettings()))()
  else if (info.menuItemId === SAVE_PAGE) void openCapturePopup()
})

chrome.action.onClicked.addListener(() => {
  void (async () => focusOrOpenGraph(await currentSettings()))()
})

/* `_execute_action` no llega aquí: lo atiende el propio botón, así que su
   atajo hace lo que diga el ajuste. Estos dos son incondicionales. */
chrome.commands?.onCommand.addListener(command => {
  if (command === OPEN_GRAPH) void (async () => focusOrOpenGraph(await currentSettings()))()
  else if (command === SAVE_PAGE) void openCapturePopup()
})

// setPopup no sobrevive al reinicio del navegador: se reaplica en cada arranque
chrome.runtime.onStartup.addListener(() => void applyActionMode())
chrome.runtime.onInstalled.addListener(() => void applyActionMode())
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void applyActionMode()
})

void applyActionMode()
