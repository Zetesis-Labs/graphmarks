import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { app } from '../bus'
import { S } from '../state'
import type { GraphLink, GraphNode } from '../types'
import { radius } from './style'

export let simulation: Simulation<GraphNode, GraphLink> | null = null

const targetIsFolder = (l: GraphLink): boolean => typeof l.target === 'object' && l.target.type === 'folder'

export function startSimulation(alpha: number): void {
  simulation?.stop()
  simulation = forceSimulation<GraphNode>(S.nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(S.links)
        .id(d => d.id)
        .distance(l => (l.type === 'host' ? 130 : targetIsFolder(l) ? 110 : 36))
        .strength(l => (l.type === 'host' ? 0.04 : targetIsFolder(l) ? 0.55 : 0.45))
    )
    .force(
      'charge',
      forceManyBody<GraphNode>().strength(d => (d.type === 'folder' ? -340 : -38))
    )
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
