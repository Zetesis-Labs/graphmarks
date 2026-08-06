import { type D3DragEvent, drag as d3drag } from 'd3-drag'
import { pointer } from 'd3-selection'
import { app } from '../bus'
import { UNTAGGED } from '../constants'
import { members } from '../graph/build'
import { findFolderAt, findHit } from '../graph/hit'
import { simulation, updateNodePosition } from '../graph/simulation'
import { dropExclusions } from '../lib/drop-rules'
import { invalidateGraphGeometry } from '../render'
import { pinsOfView, S, saveLayoutSoon } from '../state'
import type { GraphNode } from '../types'
import { canvas } from '../ui/dom'
import { hideMenu } from '../ui/menu'

const ADOPTABLE = new Set<string>(['ghost'])

function dropExcludes(subject: GraphNode): Set<string> | null {
  return dropExclusions(
    S.viewMode,
    {
      id: subject.id,
      isBookmark: subject.type === 'bm',
      isAdoptable: ADOPTABLE.has(subject.type),
      parentId: subject.parentId ?? null,
      hubs: subject.hubs ?? [],
      folderMemberIds: subject.type === 'folder' ? members(subject).map(m => m.id) : []
    },
    UNTAGGED
  )
}

function handleDrop(subj: GraphNode, target: GraphNode): void {
  S.strategy.handleDrop(subj, target)
}

type DragEv = D3DragEvent<HTMLCanvasElement, unknown, GraphNode>

export const drag = d3drag<HTMLCanvasElement, unknown>()
  .subject(ev => {
    const [px, py] = pointer(ev.sourceEvent ?? ev, canvas)
    const h = findHit(px, py)
    return h.aux ? null : h.node
  })
  .on('start', (ev: DragEv) => {
    canvas.classList.add('dragging')
    hideMenu()
    if (!ev.active) simulation?.alphaTarget(0.25).restart()
    ev.subject.fx = ev.subject.x
    ev.subject.fy = ev.subject.y
    updateNodePosition(ev.subject.id, ev.subject.x, ev.subject.y, ev.subject.x, ev.subject.y)
  })
  .on('drag', (ev: DragEv) => {
    const [px, py] = pointer(ev, canvas)
    const [x, y] = S.tf.invert([px, py])
    ev.subject.fx = x
    ev.subject.fy = y
    updateNodePosition(ev.subject.id, x, y, x, y)
    invalidateGraphGeometry()
    const ex = dropExcludes(ev.subject)
    S.dropTarget = ex ? findFolderAt(px, py, ex) : null
    app.requestDraw()
  })
  .on('end', (ev: DragEv) => {
    canvas.classList.remove('dragging')
    if (!ev.active) simulation?.alphaTarget(0)
    if (!S.dropTarget) {
      ev.subject.fx = ev.subject.x
      ev.subject.fy = ev.subject.y
      pinsOfView()[ev.subject.id] = { x: ev.subject.x ?? 0, y: ev.subject.y ?? 0 }
      updateNodePosition(ev.subject.id, ev.subject.x, ev.subject.y, ev.subject.x, ev.subject.y)
      saveLayoutSoon()
    } else {
      ev.subject.fx = null
      ev.subject.fy = null
      updateNodePosition(ev.subject.id, undefined, undefined, null, null)
      const target = S.dropTarget
      S.dropTarget = null
      handleDrop(ev.subject, target)
    }
    app.requestDraw()
  })
