import { app } from './bus'
import { loadStore, saveStore } from './lib/storage'
import { type FaviconRecord, S } from './state'
import type { GraphNode } from './types'

/* Personalización de apariencia: iconos propios (marcadores y carpetas) y
   colores por carpeta. Vive en storage.local a propósito: las imágenes no
   caben en la cuota de sync y los ids de carpeta de chrome.bookmarks no son
   estables entre dispositivos — sincronizarlos sería sincronizar claves
   rotas. Los iconos se guardan como dataURL PNG de 64px. */

const ICON_SIZE = 64

let iconData: Record<string, string> = {}

export function customKey(n: GraphNode): string | null {
  if (n.type === 'bm') return n.url ?? null
  if (n.type === 'folder' && !n.subtype && n.raw) return `f:${n.raw}`
  return null
}

export function customIcon(n: GraphNode): FaviconRecord | undefined {
  const k = customKey(n)
  return k ? S.customIcons.get(k) : undefined
}

export function colorKey(n: GraphNode): string | null {
  return n.type === 'folder' && !n.subtype && n.raw ? `f:${n.raw}` : null
}

export function hasCustomColor(n: GraphNode): boolean {
  const k = colorKey(n)
  return !!k && k in S.customColors
}

function decodeIcon(key: string, dataUrl: string): void {
  const rec: FaviconRecord = { img: new Image(), ok: false }
  rec.img.onload = () => {
    rec.ok = true
    app.requestDraw()
  }
  rec.img.src = dataUrl
  S.customIcons.set(key, rec)
}

export async function loadCustomizations(): Promise<void> {
  S.customColors = await loadStore<Record<string, string>>('customColors', {})
  iconData = await loadStore<Record<string, string>>('customIcons', {})
  for (const [key, dataUrl] of Object.entries(iconData)) decodeIcon(key, dataUrl)
}

async function fileToIcon(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const cv = document.createElement('canvas')
  cv.width = ICON_SIZE
  cv.height = ICON_SIZE
  const g = cv.getContext('2d')
  if (!g) throw new Error('canvas 2d no disponible')
  // recorte cuadrado centrado (cover): los iconos se pintan en círculo
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE)
  bmp.close()
  return cv.toDataURL('image/png')
}

export function pickIcon(n: GraphNode): void {
  const key = customKey(n)
  if (!key) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.addEventListener('change', () => {
    const f = input.files?.[0]
    if (!f) return
    void fileToIcon(f).then(async dataUrl => {
      iconData[key] = dataUrl
      decodeIcon(key, dataUrl)
      await saveStore('customIcons', iconData)
      app.requestDraw()
    })
  })
  input.click()
}

export async function removeIcon(n: GraphNode): Promise<void> {
  const key = customKey(n)
  if (!key) return
  delete iconData[key]
  S.customIcons.delete(key)
  await saveStore('customIcons', iconData)
  app.requestDraw()
}

export function pickColor(n: GraphNode, current: string): void {
  const key = colorKey(n)
  if (!key) return
  const input = document.createElement('input')
  input.type = 'color'
  input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#2a78d6'
  input.style.position = 'fixed'
  input.style.left = '-100px'
  document.body.appendChild(input)
  // 'input' previsualiza en vivo mientras se arrastra; 'change' persiste
  input.addEventListener('input', () => {
    S.customColors[key] = input.value
    app.requestDraw()
  })
  input.addEventListener('change', () => {
    S.customColors[key] = input.value
    void saveStore('customColors', S.customColors).then(() => app.rebuildSoon())
    input.remove()
  })
  input.click()
}

export async function removeColor(n: GraphNode): Promise<void> {
  const key = colorKey(n)
  if (!key) return
  delete S.customColors[key]
  await saveStore('customColors', S.customColors)
  app.rebuildSoon()
}
