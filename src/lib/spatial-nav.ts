export type Direction = 'left' | 'right' | 'up' | 'down'

export interface NavNode {
  id: string
  x?: number
  y?: number
}

function getDirectionScore(cx: number, cy: number, c: NavNode, dir: Direction): number | null {
  if (c.x === undefined || c.y === undefined) return null

  const dx = c.x - cx
  const dy = c.y - cy
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return null

  let primary = 0
  let lateral = 0

  switch (dir) {
    case 'left':
      if (dx >= -2) return null
      primary = -dx
      lateral = Math.abs(dy)
      break
    case 'right':
      if (dx <= 2) return null
      primary = dx
      lateral = Math.abs(dy)
      break
    case 'up':
      if (dy >= -2) return null
      primary = -dy
      lateral = Math.abs(dx)
      break
    case 'down':
      if (dy <= 2) return null
      primary = dy
      lateral = Math.abs(dx)
      break
  }

  return primary + lateral * 2.5 + dist * 0.2
}

/**
 * Encuentra el nodo espacialmente más cercano en la dirección dada respecto al nodo actual.
 */
export function findNearestNodeInDirection<T extends NavNode>(current: T, candidates: T[], dir: Direction): T | null {
  const cx = current.x
  const cy = current.y
  if (cx === undefined || cy === undefined) return null

  let best: T | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const c of candidates) {
    if (c.id === current.id) continue
    const score = getDirectionScore(cx, cy, c, dir)
    if (score !== null && score < bestScore) {
      bestScore = score
      best = c
    }
  }

  return best
}

/**
 * Navegación secuencial (Tab / Shift+Tab) sobre la lista ordenada de nodos.
 */
export function findNextSequentialNode<T extends NavNode>(
  current: T | null,
  candidates: T[],
  reverse = false
): T | null {
  if (!candidates.length) return null
  if (!current) return reverse ? (candidates[candidates.length - 1] ?? null) : (candidates[0] ?? null)

  const idx = candidates.findIndex(c => c.id === current.id)
  if (idx < 0) return candidates[0] ?? null

  const delta = reverse ? -1 : 1
  const nextIdx = (idx + delta + candidates.length) % candidates.length
  return candidates[nextIdx] ?? null
}
