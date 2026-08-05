import { radius } from './graph/style'
import { drawBackdrop, drawVignette } from './render/backdrop'
import { drawHulls, invalidateGraphGeometry } from './render/hulls'
import { drawLabels } from './render/labels'
import { drawLinks, drawParticles } from './render/links'
import { drawNode, entranceActive, resetEntranceActive } from './render/nodes'
import { drawSatellites, drawSubgraphBack } from './render/satellites'
import { viewport, visibleNode } from './render/viewport'
import { COLORS, S } from './state'
import { canvas, ctx } from './ui/dom'

export { invalidateGraphGeometry }

const ANIMATION_FRAME_MS = 1000 / 30

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
  resetEntranceActive()
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
