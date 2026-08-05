import type { HistoryRange } from './types'

export interface ResolvedHistoryRange {
  start: number
  end: number
}

export function resolveHistoryRange(range: HistoryRange, now = Date.now()): ResolvedHistoryRange {
  if (range.preset === 'custom' && range.start !== undefined && range.end !== undefined) {
    return { start: range.start, end: range.end }
  }
  if (range.preset === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { start: start.getTime(), end: now }
  }
  const duration =
    range.preset === '1h'
      ? 3_600_000
      : range.preset === '7d'
        ? 7 * 86_400_000
        : range.preset === '30d'
          ? 30 * 86_400_000
          : 86_400_000
  return { start: now - duration, end: now }
}
