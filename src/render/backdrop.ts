import { COLORS, S } from '../state'
import { ctx } from '../ui/dom'

const DOT_SPACING = 26

let dotPattern: CanvasPattern | null = null
let dotPatternKey = ''

export function drawBackdrop(w: number, h: number, dpr: number): void {
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

export function drawVignette(w: number, h: number): void {
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
