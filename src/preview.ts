import { IS_EXT } from './env'

/* Miniaturas capturadas por el service worker (ver background.ts): solo hay
   imagen si la pestaña ha estado activa desde que corre la extensión. La
   caché en memoria evita ir a storage.session en cada mousemove. */

const HAS_SESSION = IS_EXT && !!chrome.storage?.session
const mem = new Map<string, string | null>()

export function cachedThumb(url: string): string | null | undefined {
  return mem.get(url)
}

export function loadThumb(url: string, onReady: (img: string) => void): void {
  if (!HAS_SESSION || mem.has(url)) return
  mem.set(url, null)
  void chrome.storage.session.get(`thumb:${url}`).then(o => {
    const rec = o[`thumb:${url}`] as { img?: string } | undefined
    if (rec?.img) {
      mem.set(url, rec.img)
      onReady(rec.img)
    }
  })
}
