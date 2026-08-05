/** Troceo del historial en sesiones de navegación — puro y testeable. */

export interface VisitEvent {
  id: string
  time: number
}

export interface BrowsingSession {
  start: number
  end: number
  /** Nodos de la sesión en orden de primera aparición, sin repetidos. */
  ids: string[]
  visits: number
}

export const SESSION_GAP_MS = 30 * 60_000

export function splitSessions(events: VisitEvent[], gapMs = SESSION_GAP_MS): BrowsingSession[] {
  const sorted = [...events].sort((a, b) => a.time - b.time)
  const sessions: BrowsingSession[] = []
  let current: BrowsingSession | null = null
  let seen = new Set<string>()
  for (const ev of sorted) {
    if (!current || ev.time - current.end > gapMs) {
      current = { start: ev.time, end: ev.time, ids: [], visits: 0 }
      seen = new Set()
      sessions.push(current)
    }
    current.end = ev.time
    current.visits++
    if (!seen.has(ev.id)) {
      seen.add(ev.id)
      current.ids.push(ev.id)
    }
  }
  return sessions
}

export function sessionLabel(start: number, end: number): string {
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const hour = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${day.format(start)} – ${hour.format(end)}`
}
