import { describe, expect, it } from 'vitest'
import { findNearestNodeInDirection, findNextSequentialNode, type NavNode } from './spatial-nav'

describe('spatial-nav', () => {
  const center: NavNode = { id: 'center', x: 100, y: 100 }
  const leftNode: NavNode = { id: 'left', x: 20, y: 100 }
  const rightNode: NavNode = { id: 'right', x: 180, y: 100 }
  const topNode: NavNode = { id: 'top', x: 100, y: 20 }
  const bottomNode: NavNode = { id: 'bottom', x: 100, y: 180 }
  const diagNode: NavNode = { id: 'diag', x: 170, y: 170 }

  const candidates = [center, leftNode, rightNode, topNode, bottomNode, diagNode]

  it('encuentra el nodo a la izquierda', () => {
    const res = findNearestNodeInDirection(center, candidates, 'left')
    expect(res?.id).toBe('left')
  })

  it('encuentra el nodo a la derecha', () => {
    const res = findNearestNodeInDirection(center, candidates, 'right')
    expect(res?.id).toBe('right')
  })

  it('encuentra el nodo arriba', () => {
    const res = findNearestNodeInDirection(center, candidates, 'up')
    expect(res?.id).toBe('top')
  })

  it('encuentra el nodo abajo', () => {
    const res = findNearestNodeInDirection(center, candidates, 'down')
    expect(res?.id).toBe('bottom')
  })

  it('devuelve null si el nodo origen no tiene coordenadas', () => {
    const res = findNearestNodeInDirection({ id: 'no-coords' }, candidates, 'left')
    expect(res).toBeNull()
  })

  it('navega secuencialmente con Tab / Shift+Tab', () => {
    expect(findNextSequentialNode(center, candidates, false)?.id).toBe('left')
    expect(findNextSequentialNode(leftNode, candidates, false)?.id).toBe('right')
    expect(findNextSequentialNode(leftNode, candidates, true)?.id).toBe('center')
  })
})
