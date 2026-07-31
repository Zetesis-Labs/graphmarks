import { PLUS_R, SAT_R } from './constants'
import { plusPosition, satPositions, satScale } from './graph/hit'
import { nodeColor, radius } from './graph/style'
import { COLORS, pinsOfView, S } from './state'
import type { GraphNode } from './types'
import { canvas, ctx } from './ui/dom'

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

function drawLinks(focus: Set<string> | null, k: number): void {
  for (const l of S.links) {
    const source = l.source as GraphNode
    const target = l.target as GraphNode
    const on = !!focus && focus.has(source.id) && focus.has(target.id)
    ctx.globalAlpha = focus ? (on ? 0.9 : 0.04) : l.type === 'host' ? 0.16 : 0.34
    ctx.strokeStyle = on ? COLORS.ink2 : COLORS.muted
    ctx.lineWidth = (l.type === 'host' ? 0.7 : 1) / k
    ctx.beginPath()
    ctx.moveTo(source.x ?? 0, source.y ?? 0)
    ctx.lineTo(target.x ?? 0, target.y ?? 0)
    ctx.stroke()
  }
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

function drawNode(n: GraphNode, focusAlpha: number, k: number): void {
  const r = radius(n)
  const kk = Math.max(k, 1)
  ctx.globalAlpha = focusAlpha
  const col = nodeColor(n)
  const wantsFavicon = (n.type === 'bm' || n.type === 'ghost') && k >= 1.15

  // halo de calor: marcadores muy usados según el historial
  if (n.type === 'bm' && (n.heat ?? 0) > 0.65) {
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, r * 2.1, 0, Math.PI * 2)
    ctx.fillStyle = col
    const a = ctx.globalAlpha
    ctx.globalAlpha = a * 0.1
    ctx.fill()
    ctx.globalAlpha = a
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
  ctx.translate(S.tf.x, S.tf.y)
  ctx.scale(S.tf.k, S.tf.k)

  const focus = currentFocus()
  const k = S.tf.k
  const inFocus = (id: string): boolean => !focus || focus.has(id)

  drawLinks(focus, k)
  for (const n of S.nodes) drawNode(n, inFocus(n.id) ? 1 : 0.12, k)

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
  ctx.globalAlpha = 1
}
