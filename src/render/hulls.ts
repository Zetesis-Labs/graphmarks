import { clusterColor } from '../graph/style'
import { convexHull, type Pt } from '../lib/hull'
import { S } from '../state'
import { ctx } from '../ui/dom'

const HULL_PAD = 26

let hullLayer: HTMLCanvasElement | null = null
let hullsDirty = true
let cachedHulls = new Map<string, Pt[]>()

/** La simulación o un arrastre han cambiado posiciones, no el zoom ni el pan. */
export function invalidateGraphGeometry(): void {
  hullsDirty = true
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

export function drawHulls(focus: Set<string> | null, w: number, h: number, dpr: number): void {
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
