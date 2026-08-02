import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { app } from '../bus'
import { S } from '../state'
import type { GraphLink, GraphNode } from '../types'
import { radius } from './style'

export let simulation: Simulation<GraphNode, GraphLink> | null = null

const targetFolder = (l: GraphLink): GraphNode | null =>
  typeof l.target === 'object' && l.target.type === 'folder' ? l.target : null

/* Los niveles de jerarquía (subdominio/ruta) se aprietan contra su padre. */
function linkDistance(l: GraphLink): number {
  if (l.type === 'host') return 130
  const f = targetFolder(l)
  if (!f) return 36
  if (f.subtype === 'path') return 55
  if (f.subtype === 'subdomain') return 75
  return 110
}

function chargeOf(d: GraphNode): number {
  if (d.type !== 'folder') return -38
  if (d.subtype === 'path') return -90
  if (d.subtype === 'subdomain') return -160
  return -340
}

export function startSimulation(alpha: number): void {
  simulation?.stop()
  simulation = forceSimulation<GraphNode>(S.nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(S.links)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(l => (l.type === 'host' ? 0.04 : targetFolder(l) ? 0.55 : 0.45))
    )
    .force('charge', forceManyBody<GraphNode>().strength(chargeOf))
    .force(
      'collide',
      forceCollide<GraphNode>(d => radius(d) + 4)
    )
    .force('x', forceX<GraphNode>().strength(0.035))
    .force('y', forceY<GraphNode>().strength(0.045))
    // menos fricción y decaimiento más suave: el asentamiento se siente líquido
    .velocityDecay(0.3)
    .alphaDecay(0.02)
    .alpha(alpha)
    .on('tick', () => app.requestDraw())
}
