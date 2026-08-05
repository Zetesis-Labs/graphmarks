import { describe, expect, it } from 'vitest'
import { resolveHistoryRange } from './history-range'

describe('resolveHistoryRange', () => {
  const now = new Date(2026, 7, 5, 14, 30).getTime()

  it('resolves rolling presets from now', () => {
    expect(resolveHistoryRange({ preset: '1h' }, now)).toEqual({ start: now - 3_600_000, end: now })
    expect(resolveHistoryRange({ preset: '7d' }, now)).toEqual({ start: now - 7 * 86_400_000, end: now })
    expect(resolveHistoryRange({ preset: '30d' }, now)).toEqual({ start: now - 30 * 86_400_000, end: now })
  })

  it('starts today at local midnight', () => {
    const resolved = resolveHistoryRange({ preset: 'today' }, now)
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    expect(resolved).toEqual({ start: midnight.getTime(), end: now })
  })

  it('keeps an exact custom range', () => {
    expect(resolveHistoryRange({ preset: 'custom', start: 100, end: 200 }, now)).toEqual({ start: 100, end: 200 })
  })
})
