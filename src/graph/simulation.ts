import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { app } from '../bus'
import { invalidateGraphGeometry } from '../render'
import { S } from '../state'
import type { GraphLink, GraphNode } from '../types'
import { resolveLinkReferences } from './build'
import type { IncomingWorkerMessage, WorkerLinkData, WorkerNodeData } from './physics.worker'
import { radius } from './style'

export let simulation: Simulation<GraphNode, GraphLink> | null = null
let worker: Worker | null = null

const targetFolder = (l: GraphLink): GraphNode | null =>
  typeof l.target === 'object' && l.target.type === 'folder' ? l.target : null

function linkDistance(l: GraphLink): number {
  if (l.type === 'host') return 130
  if (l.type === 'history') return 95
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

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker('dist/physics.worker.js')
      worker.onmessage = (
        e: MessageEvent<{ type: string; positions: Array<{ id: string; x: number; y: number }> }>
      ) => {
        if (e.data?.type === 'positions' && e.data.positions) {
          for (const pos of e.data.positions) {
            const node = S.byId.get(pos.id)
            if (node) {
              node.x = pos.x
              node.y = pos.y
            }
          }
          invalidateGraphGeometry()
          app.requestDraw()
        }
      }
    } catch {
      worker = null
    }
  }
  return worker
}

export function updateNodePosition(id: string, x?: number, y?: number, fx?: number | null, fy?: number | null): void {
  const node = S.byId.get(id)
  if (node) {
    if (x !== undefined) node.x = x
    if (y !== undefined) node.y = y
    if (fx !== undefined) node.fx = fx
    if (fy !== undefined) node.fy = fy
  }
  const w = getWorker()
  if (w) {
    w.postMessage({ type: 'updateNode', id, x, y, fx, fy })
  }
}

export function startSimulation(alpha: number): void {
  resolveLinkReferences()
  const w = getWorker()
  if (w) {
    simulation?.stop()
    const serializableNodes: WorkerNodeData[] = S.nodes.map(n => ({
      id: n.id,
      type: n.type,
      subtype: n.subtype,
      x: n.x,
      y: n.y,
      fx: n.fx,
      fy: n.fy
    }))
    const serializableLinks: WorkerLinkData[] = S.links.map(l => ({
      source: typeof l.source === 'object' ? (l.source as GraphNode).id : String(l.source),
      target: typeof l.target === 'object' ? (l.target as GraphNode).id : String(l.target),
      type: l.type
    }))

    const initMsg: IncomingWorkerMessage = {
      type: 'init',
      nodes: serializableNodes,
      links: serializableLinks,
      alpha
    }
    w.postMessage(initMsg)
    return
  }

  // Fallback síncrono en caso de que Workers no estén disponibles en el entorno
  simulation?.stop()
  simulation = forceSimulation<GraphNode>(S.nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(S.links)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(l => (l.type === 'host' ? 0.04 : l.type === 'history' ? 0.12 : targetFolder(l) ? 0.55 : 0.45))
    )
    .force('charge', forceManyBody<GraphNode>().strength(chargeOf))
    .force(
      'collide',
      forceCollide<GraphNode>(d => radius(d) + 4)
    )
    .force('x', forceX<GraphNode>().strength(0.035))
    .force('y', forceY<GraphNode>().strength(0.045))
    .velocityDecay(0.3)
    .alphaDecay(0.02)
    .alpha(alpha)
    .on('tick', () => {
      invalidateGraphGeometry()
      app.requestDraw()
    })
}

export function stopSimulation(): void {
  simulation?.stop()
  if (worker) {
    worker.postMessage({ type: 'stop' })
  }
}
