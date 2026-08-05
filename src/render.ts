import { BACK_R, PLUS_R, SAT_R } from './constants'
import { customIcon } from './custom'
import { HAS_FAVICON_API } from './env'
import { backPosition, plusPosition, satPositions, satScale } from './graph/hit'
import { clusterColor, linkColor, nodeColor, radius } from './graph/style'
import { curveCtrl, quadPoint, quadTangent } from './lib/curve'
import { convexHull, type Pt } from './lib/hull'
import { bmLabelVisible, folderLabelVisible, linkAlpha, linkWidth } from './lib/render-rules'
import { strHash } from './lib/utils'
import { COLORS, type FaviconRecord, pinsOfView, S } from './state'
import type { GraphLink, GraphNode } from './types'
import { canvas, ctx } from './ui/dom'

const ENTRANCE_MS = 350
const HULL_PAD = 26
const DOT_SPACING = 26
const PARTICLE_PERIOD_MS = 2600
const ANIMATION_FRAME_MS = 1000 / 30
const VIEWPORT_PAD = 80

let drawPending = false
let animationPending = false

export function requestDraw(): void {
  if (drawPending) return
  drawPending = true
  requestAnimationFrame(() => {
    drawPending = false
    draw()
  })
}

/** Las partículas y los ghosts no necesitan competir con el zoom a 60 fps. */
function requestAnimationDraw(): void {
  if (animationPending) return
  animationPending = true
  setTimeout(() => {
    animationPending = false
    requestDraw()
  }, ANIMATION_FRAME_MS)
}

function currentFocus(): Set<string> | null {
  if (S.hoverNode && !S.dropTarget) {
    const s = new Set([S.hoverNode.id])
    for (const nb of S.neighbors.get(S.hoverNode.id) ?? []) s.add(nb)
    return s
  }
  return S.focusSet
}

/* Nodos arrastrados lejos por aristas cruzadas estiran la mancha de su cluster
   sobre los vecinos: fuera los puntos a más de 2σ del centroide. */
function trimOutliers(pts: Pt[]): Pt[] {
  if (pts.length < 5) return pts
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p[0]
    my += p[1]
  }
  mx /= pts.length
  my /= pts.length
  const dists = pts.map(p => Math.hypot(p[0] - mx, p[1] - my))
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length
  const sd = Math.sqrt(dists.reduce((a, d) => a + (d - mean) ** 2, 0) / dists.length)
  const cut = mean + 2 * sd
  const kept = pts.filter((_, i) => (dists[i] ?? 0) <= cut)
  return kept.length >= 2 ? kept : pts
}

/* Manchas de cluster: se pintan opacas en una capa aparte a media resolución y
   se componen con alfa global — pintarlas directas dejaría una costura donde el
   trazo (que da el radio redondeado) se solapa con el relleno. */
let hullLayer: HTMLCanvasElement | null = null

let hullsDirty = true
let cachedHulls = new Map<string, Pt[]>()

/** La simulación o un arrastre han cambiado posiciones, no el zoom ni el pan. */
export function invalidateGraphGeometry(): void {
  hullsDirty = true
}

function hulls(): Map<string, Pt[]> {
  if (!hullsDirty) return cachedHulls

  const groups = new Map<string, Pt[]>()
  for (const n of S.nodes) {
    if (n.type === 'ghost' || n.subtype === 'ghosthub') continue
    const c = n.cluster ? S.clusterOf.get(n.cluster) : undefined
    if (!c || (c.slot ?? -1) < 0) continue
    let g = groups.get(c.id)
    if (!g) {
      g = []
      groups.set(c.id, g)
    }
    g.push([n.x ?? 0, n.y ?? 0])
  }

  cachedHulls = new Map()
  for (const [cid, pts] of groups) {
    if (pts.length >= 2) cachedHulls.set(cid, convexHull(trimOutliers(pts)))
  }
  hullsDirty = false
  return cachedHulls
}

function drawHulls(focus: Set<string> | null, w: number, h: number, dpr: number): void {
  const groups = hulls()
  if (!groups.size) return

  hullLayer ??= document.createElement('canvas')
  const lw = Math.max(1, Math.round((w * dpr) / 2))
  const lh = Math.max(1, Math.round((h * dpr) / 2))
  if (hullLayer.width !== lw || hullLayer.height !== lh) {
    hullLayer.width = lw
    hullLayer.height = lh
  }
  const hc = hullLayer.getContext('2d')
  if (!hc) return
  hc.setTransform(1, 0, 0, 1, 0, 0)
  hc.clearRect(0, 0, lw, lh)
  hc.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0)
  hc.translate(S.tf.x, S.tf.y)
  hc.scale(S.tf.k, S.tf.k)
  hc.lineJoin = 'round'
  hc.lineCap = 'round'
  hc.lineWidth = HULL_PAD * 2

  for (const [cid, hull] of groups) {
    const col = clusterColor(cid)
    hc.fillStyle = col
    hc.strokeStyle = col
    hc.beginPath()
    const first = hull[0]
    if (!first) continue
    hc.moveTo(first[0], first[1])
    for (const p of hull.slice(1)) hc.lineTo(p[0], p[1])
    hc.closePath()
    hc.stroke()
    hc.fill()
  }

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = focus ? 0.035 : 0.075
  ctx.drawImage(hullLayer, 0, 0, w, h)
  ctx.restore()
}

interface Viewport {
  x0: number
  y0: number
  x1: number
  y1: number
}

function viewport(k: number): Viewport {
  const pad = VIEWPORT_PAD / k
  return {
    x0: -S.tf.x / k - pad,
    y0: -S.tf.y / k - pad,
    x1: (canvas.clientWidth - S.tf.x) / k + pad,
    y1: (canvas.clientHeight - S.tf.y) / k + pad
  }
}

function contains(vp: Viewport, x: number, y: number, pad = 0): boolean {
  return x >= vp.x0 - pad && x <= vp.x1 + pad && y >= vp.y0 - pad && y <= vp.y1 + pad
}

function visibleNode(n: GraphNode, vp: Viewport): boolean {
  return contains(vp, n.x ?? 0, n.y ?? 0, radius(n) + 16)
}

function visibleCurve(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number, vp: Viewport): boolean {
  return !(
    Math.max(sx, tx, cx) < vp.x0 ||
    Math.min(sx, tx, cx) > vp.x1 ||
    Math.max(sy, ty, cy) < vp.y0 ||
    Math.min(sy, ty, cy) > vp.y1
  )
}

function drawHistoryArrow(sx: number, sy: number, tx: number, ty: number, cx: number, cy: number, k: number): void {
  const u = 0.72
  const p = quadPoint(sx, sy, cx, cy, tx, ty, u)
  const d = quadTangent(sx, sy, cx, cy, tx, ty, u)
  const angle = Math.atan2(d.y, d.x)
  const size = 3.5 / k
  ctx.beginPath()
  ctx.moveTo(p.x + Math.cos(angle) * size, p.y + Math.sin(angle) * size)
  ctx.lineTo(p.x + Math.cos(angle + 2.5) * size, p.y + Math.sin(angle + 2.5) * size)
  ctx.lineTo(p.x + Math.cos(angle - 2.5) * size, p.y + Math.sin(angle - 2.5) * size)
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
}

function drawLink(l: GraphLink, focus: Set<string> | null, k: number, vp: Viewport): void {
  const source = l.source as GraphNode
  const target = l.target as GraphNode
  const on = !!focus && focus.has(source.id) && focus.has(target.id)
  ctx.globalAlpha = linkAlpha(l.type, !!focus, on)
  ctx.strokeStyle = on ? COLORS.ink2 : linkColor(l)
  ctx.lineWidth = linkWidth(l.type) / k
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
  if (!visibleCurve(sx, sy, tx, ty, cx, cy, vp)) return
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cx, cy, tx, ty)
  ctx.stroke()
  if (l.type === 'history' && k >= 0.45) drawHistoryArrow(sx, sy, tx, ty, cx, cy, k)
}

function drawLinks(focus: Set<string> | null, k: number, vp: Viewport): void {
  for (const l of S.links) drawLink(l, focus, k, vp)
}

/* Glow por sprites: el gradiente radial se rasteriza una vez por color y el
   loop solo hace drawImage — shadowBlur por frame arruinaría los 60fps. */
const glowCache = new Map<string, HTMLCanvasElement>()

function glowSprite(color: string): HTMLCanvasElement {
  let s = glowCache.get(color)
  if (!s) {
    s = document.createElement('canvas')
    s.width = 64
    s.height = 64
    const g = s.getContext('2d')
    if (g) {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
      grad.addColorStop(0, `${color}aa`)
      grad.addColorStop(0.35, `${color}38`)
      grad.addColorStop(1, `${color}00`)
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
    }
    glowCache.set(color, s)
  }
  return s
}

/* Sin API de favicons (Firefox, preview): inicial del host dentro del círculo,
   con el color del cluster — cero red, cero servicios de terceros. */
function drawLetter(n: GraphNode, r: number, col: string, k: number, dashed: boolean): void {
  const kk = Math.max(k, 1)
  if (dashed) ctx.setLineDash([3 / kk, 2.5 / kk])
  ctx.fillStyle = COLORS.surface
  ctx.fill()
  ctx.lineWidth = (dashed ? 1.5 : 1.8) / kk
  ctx.strokeStyle = col
  ctx.stroke()
  ctx.setLineDash([])
  const ch = ((n.mHost ?? '').replace(/^www\./, '')[0] ?? n.title[0] ?? '·').toUpperCase()
  ctx.font = `700 ${r * 1.05}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = col
  ctx.fillText(ch, n.x ?? 0, (n.y ?? 0) + r * 0.06)
}

function drawFavicon(n: GraphNode, r: number, col: string, dashed: boolean, k: number, rec?: FaviconRecord): void {
  const fav = rec ?? (n.url ? S.favicons.get(n.url) : undefined)
  const kk = Math.max(k, 1)
  if (!fav?.ok && !HAS_FAVICON_API && k >= 1.15) {
    drawLetter(n, r, col, k, dashed)
    return
  }
  if (dashed) ctx.setLineDash([3 / kk, 2.5 / kk])
  if (fav?.ok) {
    ctx.fillStyle = dashed ? COLORS.surface : COLORS.surface
    ctx.fill()
    ctx.save()
    ctx.clip()
    const s = (r - 1) * 2
    ctx.drawImage(fav.img, (n.x ?? 0) - s / 2, (n.y ?? 0) - s / 2, s, s)
    ctx.restore()
    ctx.lineWidth = (dashed ? 1.5 : 1.8) / kk
    ctx.strokeStyle = col
    ctx.stroke()
  } else if (dashed) {
    ctx.fillStyle = COLORS.page
    ctx.fill()
    ctx.lineWidth = 1.5 / kk
    ctx.strokeStyle = col
    ctx.stroke()
  } else {
    ctx.fillStyle = col
    ctx.fill()
    ctx.lineWidth = 1.5 / kk
    ctx.strokeStyle = COLORS.page
    ctx.stroke()
  }
  if (dashed) ctx.setLineDash([])
}

let entranceActive = false

function drawFolderPresentation(n: GraphNode, r: number, k: number, col: string): void {
  if (n.type !== 'folder' || n.subtype || !n.raw) return
  const pref = S.folderPrefs[n.raw]
  const kk = Math.max(k, 1)

  // El doble anillo identifica una carpeta que abre un dashboard propio.
  if (pref?.subgraph) {
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, r + 5 / kk, 0, Math.PI * 2)
    ctx.lineWidth = 2.2 / kk
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.beginPath()
    ctx.setLineDash([2.5 / kk, 3 / kk])
    ctx.arc(n.x ?? 0, n.y ?? 0, r + 9 / kk, 0, Math.PI * 2)
    ctx.lineWidth = 1.2 / kk
    ctx.stroke()
    ctx.setLineDash([])
  }

  // El badge «+» indica que la rama solo está mostrando pestañas abiertas.
  if (n.collapsed) {
    const x = (n.x ?? 0) + r * 0.78
    const y = (n.y ?? 0) + r * 0.78
    const br = 4.5 / kk
    ctx.beginPath()
    ctx.arc(x, y, br, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.surface
    ctx.fill()
    ctx.lineWidth = 1.4 / kk
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 2.1 / kk, y)
    ctx.lineTo(x + 2.1 / kk, y)
    ctx.moveTo(x, y - 2.1 / kk)
    ctx.lineTo(x, y + 2.1 / kk)
    ctx.lineWidth = 1.2 / kk
    ctx.stroke()
  }
}

/** Escala de entrada del nodo recién nacido (multiplicadores de radio y alfa). */
function entranceFactor(n: GraphNode, now: number): { r: number; alpha: number } {
  if (n.born === undefined) return { r: 1, alpha: 1 }
  const t = (now - n.born) / ENTRANCE_MS
  if (t >= 1) {
    n.born = undefined
    return { r: 1, alpha: 1 }
  }
  entranceActive = true
  const e = 1 - (1 - Math.max(t, 0)) ** 3
  return { r: e, alpha: 0.3 + 0.7 * e }
}

function drawNodeGlow(n: GraphNode, r: number, alpha: number, col: string): void {
  const heatGlow = n.type === 'bm' ? Math.max(0, ((n.heat ?? 0) - 0.45) / 0.55) * 0.55 : 0
  const hoverGlow = n === S.hoverNode || n === S.searchFocusNode ? 0.9 : 0
  const glow = Math.max(heatGlow, hoverGlow)
  if (glow <= 0.04 || r <= 0.5) return
  const size = r * 7
  ctx.globalAlpha = alpha * glow
  ctx.drawImage(glowSprite(col), (n.x ?? 0) - size / 2, (n.y ?? 0) - size / 2, size, size)
  ctx.globalAlpha = alpha
}

/* Hubs sintéticos: huecos, para distinguirlos de carpetas; los niveles de
   jerarquía (subdominio/ruta) llevan trazo cada vez más fino y punteado. */
function drawHubBody(n: GraphNode, col: string, kk: number): void {
  if (n.subtype === 'ghosthub') ctx.setLineDash([4 / kk, 3 / kk])
  if (n.subtype === 'path') ctx.setLineDash([2 / kk, 1.8 / kk])
  ctx.fillStyle = COLORS.page
  ctx.fill()
  ctx.lineWidth = (n.subtype === 'subdomain' ? 1.8 : n.subtype === 'path' ? 1.3 : 2.5) / kk
  ctx.strokeStyle = col
  ctx.stroke()
  ctx.setLineDash([])
}

function drawNodeBody(n: GraphNode, r: number, col: string, k: number, kk: number): void {
  const icon = customIcon(n)
  const wantsFavicon = (n.type === 'bm' || n.type === 'ghost') && k >= 1.15
  ctx.beginPath()
  ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2)
  if (n.type === 'ghost') {
    drawFavicon(n, r, col, true, k)
  } else if (n.type === 'folder' && !n.subtype && icon?.ok) {
    drawFavicon(n, r, col, false, k, icon)
  } else if (n.type === 'folder' && n.subtype) {
    drawHubBody(n, col, kk)
  } else if (wantsFavicon && (icon?.ok || (n.url && S.favicons.get(n.url)?.ok) || !HAS_FAVICON_API)) {
    drawFavicon(n, r, col, false, k, icon?.ok ? icon : undefined)
  } else {
    ctx.fillStyle = col
    ctx.fill()
    ctx.lineWidth = 1.5 / kk
    ctx.strokeStyle = COLORS.page
    ctx.stroke()
  }
}

function drawNodeBadges(n: GraphNode, r: number, k: number, kk: number, col: string): void {
  drawFolderPresentation(n, r, k, col)
  // anillo indicador de pestaña abierta
  if (S.openTabs.has(n.id)) {
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, r + 3.5 / kk, 0, Math.PI * 2)
    ctx.lineWidth = 2 / kk
    ctx.strokeStyle = col
    ctx.stroke()
  }
  // punto de nodo fijado (layout manual)
  if (pinsOfView()[n.id]) {
    ctx.beginPath()
    ctx.arc((n.x ?? 0) + r * 0.85, (n.y ?? 0) - r * 0.85, 1.7 / kk, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.ink
    ctx.fill()
  }
}

function drawNode(n: GraphNode, focusAlpha: number, k: number, now: number): void {
  const kk = Math.max(k, 1)
  const entrance = entranceFactor(n, now)
  const r = radius(n) * entrance.r
  let alpha = focusAlpha * entrance.alpha
  // las pestañas fantasma respiran: están vivas pero sin ancla
  if (n.type === 'ghost') alpha *= 0.72 + 0.28 * Math.sin(now / 650 + (strHash(n.id) % 100) / 15.9)
  ctx.globalAlpha = alpha
  const col = nodeColor(n)
  drawNodeGlow(n, r, alpha, col)
  drawNodeBody(n, r, col, k, kk)
  drawNodeBadges(n, r, k, kk, col)
}

/* Partículas fluyendo hacia los nodos con pestaña abierta, sobre la misma
   curva que pinta drawLinks para no salirse de la arista. */
function drawParticle(l: GraphLink, focus: Set<string> | null, k: number, now: number, vp: Viewport): void {
  const source = l.source as GraphNode
  const target = l.target as GraphNode
  const open = S.openTabs.has(target.id) ? target : S.openTabs.has(source.id) ? source : null
  if (!open) return
  if (focus && !(focus.has(source.id) && focus.has(target.id))) return
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
  if (!visibleCurve(sx, sy, tx, ty, cx, cy, vp)) return
  const phase = (strHash(`${source.id}|${target.id}`) % 1000) / 1000
  const t = (now / PARTICLE_PERIOD_MS + phase) % 1
  const p = quadPoint(sx, sy, cx, cy, tx, ty, open === target ? t : 1 - t)
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1.1, 1.6 / k), 0, Math.PI * 2)
  ctx.fillStyle = nodeColor(open)
  ctx.fill()
}

function drawParticles(focus: Set<string> | null, k: number, now: number, vp: Viewport): void {
  if (!S.openTabs.size) return
  for (const l of S.links) {
    if (l.type === 'tree') drawParticle(l, focus, k, now, vp)
  }
}

/* Fondo: rejilla de puntos con parallax a mitad del pan (profundidad) y
   viñeta radial al final. El patrón se rasteriza una vez por color/dpr. */
let dotPattern: CanvasPattern | null = null
let dotPatternKey = ''

function drawBackdrop(w: number, h: number, dpr: number): void {
  const sp = DOT_SPACING
  const key = `${COLORS.grid}|${dpr}`
  if (!dotPattern || dotPatternKey !== key) {
    const tile = document.createElement('canvas')
    tile.width = Math.round(sp * dpr)
    tile.height = Math.round(sp * dpr)
    const g = tile.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    g.fillStyle = COLORS.grid
    g.beginPath()
    g.arc(sp / 2, sp / 2, 1.1, 0, Math.PI * 2)
    g.fill()
    dotPattern = ctx.createPattern(tile, 'repeat')
    dotPattern?.setTransform(new DOMMatrix().scale(1 / dpr))
    dotPatternKey = key
  }
  if (!dotPattern) return
  ctx.save()
  ctx.translate(((S.tf.x * 0.5) % sp) - sp, ((S.tf.y * 0.5) % sp) - sp)
  ctx.globalAlpha = 0.55
  ctx.fillStyle = dotPattern
  ctx.fillRect(0, 0, w + sp * 2, h + sp * 2)
  ctx.restore()
  ctx.globalAlpha = 1
}

let vignette: CanvasGradient | null = null
let vignetteKey = ''

function drawVignette(w: number, h: number): void {
  const key = `${w}x${h}`
  if (!vignette || vignetteKey !== key) {
    vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) / 2)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.09)')
    vignetteKey = key
  }
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)
}

function drawLabelHalo(x: number, y: number, text: string, k: number): void {
  ctx.lineWidth = 3 / k
  ctx.strokeStyle = COLORS.page
  ctx.strokeText(text, x, y)
}

function drawFolderLabel(n: GraphNode, k: number, focused: boolean, hasFocus: boolean): void {
  const minor = n.subtype === 'subdomain' || n.subtype === 'path'
  if (!folderLabelVisible(minor, k, focused, hasFocus, n === S.hoverNode)) return
  const r = radius(n)
  ctx.globalAlpha = focused ? 1 : 0.5
  ctx.font = minor ? `${10 / k}px system-ui, sans-serif` : `600 ${12 / k}px system-ui, sans-serif`
  drawLabelHalo(n.x ?? 0, (n.y ?? 0) + r + 4 / k, n.title, k)
  ctx.fillStyle = n === S.hoverNode || n === S.dropTarget ? COLORS.ink : minor ? COLORS.muted : COLORS.ink2
  ctx.fillText(n.title, n.x ?? 0, (n.y ?? 0) + r + 4 / k)
}

function drawBmLabel(n: GraphNode, k: number, focused: boolean, hasFocus: boolean): void {
  if (!bmLabelVisible(k, n.type === 'ghost', focused, hasFocus, n === S.hoverNode, n === S.searchFocusNode)) return
  const r = radius(n)
  ctx.globalAlpha = 1
  ctx.font = `${10.5 / k}px system-ui, sans-serif`
  const label = n.title.length > 42 ? `${n.title.slice(0, 41)}…` : n.title
  drawLabelHalo(n.x ?? 0, (n.y ?? 0) + r + 3 / k, label, k)
  ctx.fillStyle = n === S.hoverNode ? COLORS.ink : COLORS.muted
  ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 3 / k)
}

function drawLabels(focus: Set<string> | null, k: number, vp: Viewport): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const n of S.nodes) {
    if (!visibleNode(n, vp)) continue
    const focused = !focus || focus.has(n.id)
    if (n.type === 'folder') drawFolderLabel(n, k, focused, !!focus)
    else drawBmLabel(n, k, focused, !!focus)
  }
}

function drawSatellites(focus: Set<string> | null, vp: Viewport): void {
  const inFocus = (id: string): boolean => !focus || focus.has(id)
  for (const id of S.openTabs.keys()) {
    const n = S.byId.get(id)
    if (!n) continue
    if (!visibleNode(n, vp)) continue
    ctx.globalAlpha = inFocus(n.id) ? 1 : 0.12
    const col = nodeColor(n)
    const ss = satScale()
    for (const s of satPositions(n)) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, SAT_R * ss, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
      ctx.lineWidth = 1.2 * ss
      ctx.strokeStyle = COLORS.page
      ctx.stroke()
      if (s.tab.active) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1.4 * ss, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.page
        ctx.fill()
      }
    }
    if (S.hoverNode === n) {
      const p = plusPosition(n)
      ctx.beginPath()
      ctx.arc(p.x, p.y, PLUS_R * ss, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.surface
      ctx.fill()
      ctx.lineWidth = 1.5 * ss
      ctx.strokeStyle = col
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x - 2.4 * ss, p.y)
      ctx.lineTo(p.x + 2.4 * ss, p.y)
      ctx.moveTo(p.x, p.y - 2.4 * ss)
      ctx.lineTo(p.x, p.y + 2.4 * ss)
      ctx.strokeStyle = COLORS.ink
      ctx.lineWidth = 1.4 * ss
      ctx.stroke()
    }
  }
}

function drawSubgraphBack(vp: Viewport): void {
  if (!S.activeSubgraph) return
  const root = S.byId.get(S.activeSubgraph)
  if (!root || !visibleNode(root, vp)) return
  const p = backPosition(root)
  const ss = satScale()
  const r = BACK_R * ss
  const col = nodeColor(root)

  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.surface
  ctx.fill()
  ctx.lineWidth = 1.5 * ss
  ctx.strokeStyle = col
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(p.x + 2.5 * ss, p.y)
  ctx.lineTo(p.x - 2.5 * ss, p.y)
  ctx.moveTo(p.x - 2.5 * ss, p.y)
  ctx.lineTo(p.x - 0.3 * ss, p.y - 2.2 * ss)
  ctx.moveTo(p.x - 2.5 * ss, p.y)
  ctx.lineTo(p.x - 0.3 * ss, p.y + 2.2 * ss)
  ctx.lineWidth = 1.5 * ss
  ctx.lineCap = 'round'
  ctx.strokeStyle = COLORS.ink
  ctx.stroke()
}

export function draw(): void {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = COLORS.page
  ctx.fillRect(0, 0, w, h)
  drawBackdrop(w, h, dpr)
  ctx.translate(S.tf.x, S.tf.y)
  ctx.scale(S.tf.k, S.tf.k)

  const focus = currentFocus()
  const k = S.tf.k
  const vp = viewport(k)
  const now = performance.now()
  const inFocus = (id: string): boolean => !focus || focus.has(id)

  drawHulls(focus, w, h, dpr)
  drawLinks(focus, k, vp)
  entranceActive = false
  for (const n of S.nodes) {
    if (visibleNode(n, vp)) drawNode(n, inFocus(n.id) ? 1 : 0.12, k, now)
  }

  if (S.dropTarget) {
    ctx.globalAlpha = 1
    ctx.setLineDash([5 / k, 4 / k])
    ctx.lineWidth = 2 / k
    ctx.strokeStyle = COLORS.ink
    ctx.beginPath()
    ctx.arc(S.dropTarget.x ?? 0, S.dropTarget.y ?? 0, radius(S.dropTarget) + 7 / k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // resultado seleccionado en el buscador: anillo de resalte
  if (S.searchFocusNode && S.byId.has(S.searchFocusNode.id)) {
    const n = S.searchFocusNode
    ctx.globalAlpha = 1
    ctx.lineWidth = 2.5 / k
    ctx.strokeStyle = COLORS.ink
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, radius(n) + 8 / k, 0, Math.PI * 2)
    ctx.stroke()
  }

  drawLabels(focus, k, vp)
  drawSatellites(focus, vp)
  drawSubgraphBack(vp)
  drawParticles(focus, k, now, vp)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawVignette(w, h)
  ctx.globalAlpha = 1

  // partículas, pulso de ghosts o entradas en curso: seguir animando
  const alive = S.openTabs.size > 0 || entranceActive || S.nodes.some(n => n.type === 'ghost')
  if (alive && document.visibilityState === 'visible') requestAnimationDraw()
}
