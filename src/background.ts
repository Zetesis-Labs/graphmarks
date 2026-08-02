/* Service worker: omnibox «gm» para saltar a marcadores y pestañas. */

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

/* --- miniaturas para la previsualización de pestañas ---
   Chrome solo permite capturar la pestaña ACTIVA (captureVisibleTab); no hay
   API para pestañas de fondo. Captura oportunista: cada vez que una pestaña
   se activa o termina de cargar en primer plano, se guarda una miniatura en
   storage.session con expulsión LRU. El hover solo puede enseñar pestañas
   que hayan estado activas desde que corre la extensión. */

const THUMB_MAX = 80
const CAPTURE_MIN_GAP_MS = 700

let lastCapture = 0
const pendingShots = new Map<number, ReturnType<typeof setTimeout>>()

function scheduleCapture(tabId: number): void {
  clearTimeout(pendingShots.get(tabId))
  pendingShots.set(
    tabId,
    // pequeño respiro para que la pestaña esté pintada antes de capturar
    setTimeout(() => {
      pendingShots.delete(tabId)
      void captureTab(tabId)
    }, 350)
  )
}

async function captureTab(tabId: number): Promise<void> {
  const now = Date.now()
  // cuota de captureVisibleTab (2/s): al ser oportunista, la próxima activación reintenta
  if (now - lastCapture < CAPTURE_MIN_GAP_MS) return
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.active || !tab.url || !/^https?:/.test(tab.url)) return
    lastCapture = now
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 78 })
    const small = await downscale(shot, 480)
    await chrome.storage.session.set({ [`thumb:${tab.url}`]: { img: small, at: now } })
    void pruneThumbs()
  } catch {
    /* páginas protegidas (webstore, error pages…) no se pueden capturar: degradación deliberada */
  }
}

async function downscale(dataUrl: string, width: number): Promise<string> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const h = Math.round((bmp.height / bmp.width) * width)
  const cv = new OffscreenCanvas(width, h)
  const g = cv.getContext('2d')
  if (!g) return dataUrl
  g.drawImage(bmp, 0, 0, width, h)
  bmp.close()
  const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: 0.62 })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return `data:image/jpeg;base64,${btoa(bin)}`
}

async function pruneThumbs(): Promise<void> {
  const all = await chrome.storage.session.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('thumb:'))
  if (keys.length <= THUMB_MAX) return
  const at = (k: string): number => (all[k] as { at?: number }).at ?? 0
  const oldest = keys.sort((a, b) => at(a) - at(b)).slice(0, keys.length - THUMB_MAX)
  await chrome.storage.session.remove(oldest)
}

chrome.tabs.onActivated.addListener(({ tabId }) => scheduleCapture(tabId))
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) scheduleCapture(tabId)
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
      await chrome.tabs.update(open.id, { active: true })
      if (open.windowId !== undefined) await chrome.windows.update(open.windowId, { focused: true })
      return
    }
    if (disposition === 'currentTab') void chrome.tabs.update({ url })
    else void chrome.tabs.create({ url, active: disposition === 'newForegroundTab' })
  })()
})
