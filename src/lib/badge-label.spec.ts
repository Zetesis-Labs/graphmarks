import { describe, expect, it } from 'vitest'
import type { MessageKey } from '../i18n'
import { badgeView, effectiveWinFilter, winChipView } from './badge-label'

const t = (key: MessageKey, ...subs: Array<string | number>): string => [key, ...subs].join('|')
const wins = [
  { id: 7, count: 3, title: 'A' },
  { id: 9, count: 2, title: 'B' }
]

describe('badgeView', () => {
  it('el aviso de plataforma manda sobre todo', () => {
    const v = badgeView({ warn: 'sin permiso', scanned: true, matched: 5, loose: 2, onlyOpen: true }, t)
    expect(v).toEqual({ hidden: false, text: 'sin permiso', active: false, warn: true })
  })

  it('oculto antes del primer escaneo', () => {
    expect(badgeView({ warn: null, scanned: false, matched: 0, loose: 0, onlyOpen: false }, t).hidden).toBe(true)
  })

  it('singular, plural y sueltas', () => {
    expect(badgeView({ warn: null, scanned: true, matched: 1, loose: 0, onlyOpen: false }, t).text).toBe('badgeOpenOne')
    expect(badgeView({ warn: null, scanned: true, matched: 4, loose: 1, onlyOpen: false }, t).text).toBe(
      'badgeOpen|4badgeLooseOne'
    )
    expect(badgeView({ warn: null, scanned: true, matched: 4, loose: 3, onlyOpen: false }, t).text).toBe(
      'badgeOpen|4badgeLoose|3'
    )
  })

  it('el modo solo-abiertas cambia texto y estado activo', () => {
    const v = badgeView({ warn: null, scanned: true, matched: 2, loose: 5, onlyOpen: true }, t)
    expect(v.text).toBe('badgeOnlyOpen|2')
    expect(v.active).toBe(true)
  })
})

describe('effectiveWinFilter', () => {
  it('all es null, current resuelve al id actual', () => {
    expect(effectiveWinFilter('all', 7, wins)).toBeNull()
    expect(effectiveWinFilter('current', 7, wins)).toBe(7)
  })

  it('un filtro a ventana cerrada cae a null', () => {
    expect(effectiveWinFilter(9, null, wins)).toBe(9)
    expect(effectiveWinFilter(42, null, wins)).toBeNull()
  })
})

describe('winChipView', () => {
  it('oculto con menos de dos ventanas', () => {
    expect(winChipView('all', null, [wins[0] as (typeof wins)[0]], t).hidden).toBe(true)
  })

  it('numera la ventana filtrada por posición, no por id', () => {
    const v = winChipView(9, null, wins, t)
    expect(v.text).toBe('winNumbered|2')
    expect(v.active).toBe(true)
  })
})
