import { pointer, select } from 'd3-selection'
import 'd3-transition'
import { type D3ZoomEvent, zoom as d3zoom, zoomIdentity } from 'd3-zoom'
import { app } from '../bus'
import { findHit } from '../graph/hit'
import { fitTransform } from '../lib/fit'
import { S } from '../state'
import type { GraphNode } from '../types'
import { canvas } from '../ui/dom'

export const zoom = d3zoom<HTMLCanvasElement, unknown>()
  .scaleExtent([0.15, 5])
  .filter(ev => {
    if (ev.type === 'mousedown' || ev.type === 'touchstart') {
      const [px, py] = pointer(ev, canvas)
      return !findHit(px, py).node
    }
    return !(ev as MouseEvent).button
  })
  .on('zoom', (ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
    S.tf = ev.transform
    app.requestDraw()
  })

export function zoomToNodes(list: GraphNode[], pad = 60, duration = 550): void {
  const fit = fitTransform(list, canvas.clientWidth, canvas.clientHeight, pad)
  if (!fit) return
  const t = zoomIdentity.translate(fit.x, fit.y).scale(fit.k)
  select(canvas).transition().duration(duration).call(zoom.transform, t)
}

export function resetZoom(): void {
  S.tf = zoomIdentity.translate(canvas.clientWidth / 2, canvas.clientHeight / 2)
  select(canvas).call(zoom.transform, S.tf)
}
