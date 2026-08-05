import { customIcon } from '../custom'
import { HAS_FAVICON_API } from '../env'
import { nodeColor, radius } from '../graph/style'
import { strHash } from '../lib/utils'
import { COLORS, type FaviconRecord, pinsOfView, S } from '../state'
import type { GraphNode } from '../types'
import { ctx } from '../ui/dom'

const ENTRANCE_MS = 350

export let entranceActive = false

export function resetEntranceActive(): void {
  entranceActive = false
}

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

function drawFolderPresentation(n: GraphNode, r: number, k: number, col: string): void {
  if (n.type !== 'folder' || n.subtype || !n.raw) return
  const pref = S.folderPrefs[n.raw]
  const kk = Math.max(k, 1)

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
    drawFavicon(n, r, col, !!n.unsaved, k, icon?.ok ? icon : undefined)
  } else if (n.unsaved) {
    ctx.setLineDash([3 / kk, 2.5 / kk])
    ctx.fillStyle = COLORS.page
    ctx.fill()
    ctx.lineWidth = 1.5 / kk
    ctx.strokeStyle = col
    ctx.stroke()
    ctx.setLineDash([])
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
  if (n === S.keyboardFocusNode) {
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, r + 7 / kk, 0, Math.PI * 2)
    ctx.lineWidth = 2.5 / kk
    ctx.strokeStyle = COLORS.ink
    ctx.stroke()
  }
  if (S.openTabs.has(n.id)) {
    ctx.beginPath()
    ctx.arc(n.x ?? 0, n.y ?? 0, r + 3.5 / kk, 0, Math.PI * 2)
    ctx.lineWidth = 2 / kk
    ctx.strokeStyle = col
    ctx.stroke()
  }
  if (pinsOfView()[n.id]) {
    ctx.beginPath()
    ctx.arc((n.x ?? 0) + r * 0.85, (n.y ?? 0) - r * 0.85, 1.7 / kk, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.ink
    ctx.fill()
  }
}

export function drawNode(n: GraphNode, focusAlpha: number, k: number, now: number): void {
  const kk = Math.max(k, 1)
  const entrance = entranceFactor(n, now)
  const r = radius(n) * entrance.r
  let alpha = focusAlpha * entrance.alpha
  if (n.type === 'ghost') alpha *= 0.72 + 0.28 * Math.sin(now / 650 + (strHash(n.id) % 100) / 15.9)
  ctx.globalAlpha = alpha
  const col = nodeColor(n)
  drawNodeGlow(n, r, alpha, col)
  drawNodeBody(n, r, col, k, kk)
  drawNodeBadges(n, r, k, kk, col)
}
