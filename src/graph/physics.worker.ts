import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'

export interface WorkerNodeData {
  id: string
  type: string
  subtype?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface WorkerLinkData {
  source: string
  target: string
  type: string
}

export interface InitMessage {
  type: 'init'
  nodes: WorkerNodeData[]
  links: WorkerLinkData[]
  alpha?: number
}

export interface AlphaMessage {
  type: 'alpha'
  alpha: number
}

export interface TickMessage {
  type: 'tick'
  count: number
}

export interface StopMessage {
  type: 'stop'
}

export interface UpdateNodeMessage {
  type: 'updateNode'
  id: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export type IncomingWorkerMessage = InitMessage | AlphaMessage | TickMessage | StopMessage | UpdateNodeMessage

function linkDistance(l: WorkerLinkData, nodeMap: Map<string, WorkerNodeData>): number {
  if (l.type === 'host') return 130
  if (l.type === 'history') return 95
  const target = nodeMap.get(l.target)
  const isFolder = target?.type === 'folder'
  if (!isFolder) return 36
  if (target.subtype === 'path') return 55
  if (target.subtype === 'subdomain') return 75
  return 110
}

function chargeOf(d: WorkerNodeData): number {
  if (d.type !== 'folder') return -38
  if (d.subtype === 'path') return -90
  if (d.subtype === 'subdomain') return -160
  return -340
}

function radiusOf(d: WorkerNodeData): number {
  if (d.type === 'folder') return d.subtype === 'subdomain' ? 22 : 18
  return 14
}

let simulation: Simulation<WorkerNodeData, WorkerLinkData> | null = null
let currentNodes: WorkerNodeData[] = []
let nodeMap = new Map<string, WorkerNodeData>()

function postPositions(): void {
  const positions: Array<{ id: string; x: number; y: number }> = []
  for (const n of currentNodes) {
    if (typeof n.x === 'number' && typeof n.y === 'number') {
      positions.push({ id: n.id, x: n.x, y: n.y })
    }
  }
  self.postMessage({ type: 'positions', positions })
}

function handleInit(data: InitMessage): void {
  simulation?.stop()
  currentNodes = data.nodes.map(n => ({ ...n }))
  nodeMap = new Map(currentNodes.map(n => [n.id, n]))

  const links = data.links.map(l => ({ ...l }))

  simulation = forceSimulation<WorkerNodeData>(currentNodes)
    .force(
      'link',
      forceLink<WorkerNodeData, WorkerLinkData>(links)
        .id(d => d.id)
        .distance(l => linkDistance(l, nodeMap))
        .strength(l => {
          const isFolder = nodeMap.get(l.target)?.type === 'folder'
          return l.type === 'host' ? 0.04 : l.type === 'history' ? 0.12 : isFolder ? 0.55 : 0.45
        })
    )
    .force('charge', forceManyBody<WorkerNodeData>().strength(chargeOf))
    .force(
      'collide',
      forceCollide<WorkerNodeData>(d => radiusOf(d) + 4)
    )
    .force('x', forceX<WorkerNodeData>().strength(0.035))
    .force('y', forceY<WorkerNodeData>().strength(0.045))
    .velocityDecay(0.3)
    .alphaDecay(0.02)
    .alpha(data.alpha ?? 0.3)
    .on('tick', () => {
      postPositions()
    })
}

function handleUpdateNode(data: UpdateNodeMessage): void {
  const n = nodeMap.get(data.id)
  if (n) {
    if (typeof data.x === 'number') n.x = data.x
    if (typeof data.y === 'number') n.y = data.y
    if (data.fx !== undefined) n.fx = data.fx
    if (data.fy !== undefined) n.fy = data.fy
  }
  if (simulation && simulation.alpha() < 0.1) {
    simulation.alpha(0.25).restart()
  }
}

self.onmessage = (e: MessageEvent<IncomingWorkerMessage>) => {
  const data = e.data
  if (!data) return

  switch (data.type) {
    case 'init':
      handleInit(data)
      break
    case 'alpha':
      if (simulation) simulation.alpha(data.alpha).restart()
      break
    case 'tick':
      if (simulation) {
        simulation.tick(data.count)
        postPositions()
      }
      break
    case 'updateNode':
      handleUpdateNode(data)
      break
    case 'stop':
      simulation?.stop()
      break
  }
}
