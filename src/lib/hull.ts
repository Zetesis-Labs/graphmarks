export type Pt = [number, number]

/** Envolvente convexa (cadena monótona de Andrew), vértices en orden horario. */
export function convexHull(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return [...pts]
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Pt[]): Pt[] => {
    const h: Pt[] = []
    for (const pt of list) {
      while (h.length >= 2) {
        const a = h[h.length - 2]
        const b = h[h.length - 1]
        if (a && b && cross(a, b, pt) <= 0) h.pop()
        else break
      }
      h.push(pt)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}
