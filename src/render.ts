import { PLUS_R, SAT_R } from './constants'
import { plusPosition, satPositions, satScale } from './graph/hit'
import { clusterColor, linkColor, nodeColor, radius } from './graph/style'
import { convexHull, type Pt } from './lib/hull'
import { strHash } from './lib/utils'
import { COLORS, pinsOfView, S } from './state'
import type { GraphNode, LinkKind } from './types'
import { canvas, ctx } from './ui/dom'

const ENTRANCE_MS = 350
const HULL_PAD = 26
const DOT_SPACING = 26
const PARTICLE_PERIOD_MS = 2600

let drawPending = false

export function requestDraw(): void {
  if (drawPending) return
  drawPending = true
  requestAnimationFrame(() => {
    drawPending = false
    draw()
  })
}

function currentFocus(): Set<string> | null {
  if (S.hoverNode && !S.dropTarget) {
    const s = new Set([S.hoverNode.id])
    for (const nb of S.neighbors.get(S.hoverNode.id) ?? []) s.add(nb)
    return s
  }
  return S.focusSet
}

/* Aristas curvas: control de la Bézier cuadrática desplazado en perpendicular.
   El signo es fijo para que la curva no cambie de lado entre frames. */
function curveCtrl(sx: number, sy: number, tx: number, ty: number, kind: LinkKind): { cx: number; cy: number } {
  const bend = kind === 'host' ? 0.22 : 0.12
  return { cx: (sx + tx) / 2 - (ty - sy) * bend, cy: (sy + ty) / 2 + (tx - sx) * bend }
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

function drawHulls(focus: Set<string> | null, w: number, h: number, dpr: number): void {
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

  for (const [cid, pts] of groups) {
    if (pts.length < 2) continue
    const hull = convexHull(trimOutliers(pts))
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

function drawLinks(focus: Set<string> | null, k: number): void {
  for (const l of S.links) {
    const source = l.source as GraphNode
    const target = l.target as GraphNode
    const on = !!focus && focus.has(source.id) && focus.has(target.id)
    ctx.globalAlpha = focus ? (on ? 0.9 : 0.04) : l.type === 'host' ? 0.14 : 0.3
    ctx.strokeStyle = on ? COLORS.ink2 : linkColor(l)
    ctx.lineWidth = (l.type === 'host' ? 0.7 : 1) / k
    const sx = source.x ?? 0
    const sy = source.y ?? 0
    const tx = target.x ?? 0
    const ty = target.y ?? 0
    const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cx, cy, tx, ty)
    ctx.stroke()
  }
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

function drawFavicon(n: GraphNode, r: number, col: string, dashed: boolean, k: number): void {
  const fav = n.url ? S.favicons.get(n.url) : undefined
  const kk = Math.max(k, 1)
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

function drawNode(n: GraphNode, focusAlpha: number, k: number, now: number): void {
  let r = radius(n)
  const kk = Math.max(k, 1)
  let alpha = focusAlpha

  if (n.born !== undefined) {
    const t = (now - n.born) / ENTRANCE_MS
    if (t < 1) {
      const e = 1 - (1 - Math.max(t, 0)) ** 3
      r *= e
      alpha *= 0.3 + 0.7 * e
      entranceActive = true
    } else {
      n.born = undefined
    }
  }
  // las pestañas fantasma respiran: están vivas pero sin ancla
  if (n.type === 'ghost') alpha *= 0.72 + 0.28 * Math.sin(now / 650 + (strHash(n.id) % 100) / 15.9)

  ctx.globalAlpha = alpha
  const col = nodeColor(n)
  const wantsFavicon = (n.type === 'bm' || n.type === 'ghost') && k >= 1.15

  const heatGlow = n.type === 'bm' ? Math.max(0, ((n.heat ?? 0) - 0.45) / 0.55) * 0.55 : 0
  const hoverGlow = n === S.hoverNode || n === S.searchFocusNode ? 0.9 : 0
  const glow = Math.max(heatGlow, hoverGlow)
  if (glow > 0.04 && r > 0.5) {
    const size = r * 7
    ctx.globalAlpha = alpha * glow
    ctx.drawImage(glowSprite(col), (n.x ?? 0) - size / 2, (n.y ?? 0) - size / 2, size, size)
    ctx.globalAlpha = alpha
  }

  ctx.beginPath()
  ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2)
  if (n.type === 'ghost') {
    drawFavicon(n, r, col, true, k)
  } else if (n.type === 'folder' && n.subtype) {
    // hubs de tag/dominio/fantasma: huecos, para distinguirlos de carpetas
    if (n.subtype === 'ghosthub') ctx.setLineDash([4 / kk, 3 / kk])
    ctx.fillStyle = COLORS.page
    ctx.fill()
    ctx.lineWidth = 2.5 / kk
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.setLineDash([])
  } else if (wantsFavicon && n.url && S.favicons.get(n.url)?.ok) {
    drawFavicon(n, r, col, false, k)
  } else {
    ctx.fillStyle = col
    ctx.fill()
    ctx.lineWidth = 1.5 / kk
    ctx.strokeStyle = COLORS.page
    ctx.stroke()
  }

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

/* Partículas fluyendo hacia los nodos con pestaña abierta, sobre la misma
   curva que pinta drawLinks para no salirse de la arista. */
function drawParticles(focus: Set<string> | null, k: number, now: number): void {
  if (!S.openTabs.size) return
  for (const l of S.links) {
    if (l.type === 'host') continue
    const source = l.source as GraphNode
    const target = l.target as GraphNode
    const open = S.openTabs.has(target.id) ? target : S.openTabs.has(source.id) ? source : null
    if (!open) continue
    if (focus && !(focus.has(source.id) && focus.has(target.id))) continue
    const sx = source.x ?? 0
    const sy = source.y ?? 0
    const tx = target.x ?? 0
    const ty = target.y ?? 0
    const { cx, cy } = curveCtrl(sx, sy, tx, ty, l.type)
    const phase = (strHash(`${source.id}|${target.id}`) % 1000) / 1000
    const t = (now / PARTICLE_PERIOD_MS + phase) % 1
    const u = open === target ? t : 1 - t
    const v = 1 - u
    const px = v * v * sx + 2 * v * u * cx + u * u * tx
    const py = v * v * sy + 2 * v * u * cy + u * u * ty
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(px, py, Math.max(1.1, 1.6 / k), 0, Math.PI * 2)
    ctx.fillStyle = nodeColor(open)
    ctx.fill()
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

function drawLabels(focus: Set<string> | null, k: number): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const halo = (x: number, y: number, text: string): void => {
    ctx.lineWidth = 3 / k
    ctx.strokeStyle = COLORS.page
    ctx.strokeText(text, x, y)
  }
  const inFocus = (id: string): boolean => !focus || focus.has(id)
  for (const n of S.nodes) {
    const r = radius(n)
    const focused = inFocus(n.id)
    if (n.type === 'folder') {
      if (!focused && focus) continue
      ctx.globalAlpha = focused ? 1 : 0.5
      ctx.font = `600 ${12 / k}px system-ui, sans-serif`
      halo(n.x ?? 0, (n.y ?? 0) + r + 4 / k, n.title)
      ctx.fillStyle = n === S.hoverNode || n === S.dropTarget ? COLORS.ink : COLORS.ink2
      ctx.fillText(n.title, n.x ?? 0, (n.y ?? 0) + r + 4 / k)
    } else {
      const show =
        (k >= 1.5 && focused) ||
        (n.type === 'ghost' && k >= 0.8 && focused) ||
        (!!focus && focused) ||
        n === S.hoverNode ||
        n === S.searchFocusNode
      if (!show) continue
      ctx.globalAlpha = 1
      ctx.font = `${10.5 / k}px system-ui, sans-serif`
      const label = n.title.length > 42 ? `${n.title.slice(0, 41)}…` : n.title
      halo(n.x ?? 0, (n.y ?? 0) + r + 3 / k, label)
      ctx.fillStyle = n === S.hoverNode ? COLORS.ink : COLORS.muted
      ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 3 / k)
    }
  }
}

function drawSatellites(focus: Set<string> | null): void {
  const inFocus = (id: string): boolean => !focus || focus.has(id)
  for (const id of S.openTabs.keys()) {
    const n = S.byId.get(id)
    if (!n) continue
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
  const now = performance.now()
  const inFocus = (id: string): boolean => !focus || focus.has(id)

  drawHulls(focus, w, h, dpr)
  drawLinks(focus, k)
  entranceActive = false
  for (const n of S.nodes) drawNode(n, inFocus(n.id) ? 1 : 0.12, k, now)

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

  drawLabels(focus, k)
  drawSatellites(focus)
  drawParticles(focus, k, now)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawVignette(w, h)
  ctx.globalAlpha = 1

  // partículas, pulso de ghosts o entradas en curso: seguir animando
  const alive = S.openTabs.size > 0 || entranceActive || S.nodes.some(n => n.type === 'ghost')
  if (alive && document.visibilityState === 'visible') requestDraw()
}
