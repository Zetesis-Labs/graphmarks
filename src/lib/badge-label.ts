import type { MessageKey } from '../i18n'
import type { WindowSummary, WinFilter } from '../types'

/** Los chips del topbar deciden aquí; la cáscara solo asigna al DOM. */

type Catalog = (key: MessageKey, ...subs: Array<string | number>) => string

export interface ChipView {
  hidden: boolean
  text: string
  active: boolean
  warn?: boolean
}

/** Ventana efectiva del filtro ⊞; null = todas (o el filtro apunta a una cerrada). */
export function effectiveWinFilter(
  filter: WinFilter,
  currentWinId: number | null,
  wins: readonly WindowSummary[]
): number | null {
  if (filter === 'all') return null
  if (filter === 'current') return currentWinId
  return wins.some(w => w.id === filter) ? filter : null
}

export function badgeView(
  state: { warn: string | null; scanned: boolean; matched: number; loose: number; onlyOpen: boolean },
  t: Catalog
): ChipView {
  if (state.warn !== null) return { hidden: false, text: state.warn, active: false, warn: true }
  // antes del primer escaneo no hay nada que contar
  if (!state.scanned && !state.matched && !state.loose) return { hidden: true, text: '', active: false }
  const loose = state.loose ? (state.loose === 1 ? t('badgeLooseOne') : t('badgeLoose', state.loose)) : ''
  const text = state.onlyOpen
    ? t('badgeOnlyOpen', state.matched)
    : `${state.matched === 1 ? t('badgeOpenOne') : t('badgeOpen', state.matched)}${loose}`
  return { hidden: false, text, active: state.onlyOpen }
}

export function winChipView(
  filter: WinFilter,
  currentWinId: number | null,
  wins: readonly WindowSummary[],
  t: Catalog
): ChipView {
  const wf = effectiveWinFilter(filter, currentWinId, wins)
  let text = t('winAll')
  if (filter === 'current') text = t('winCurrent')
  else if (wf !== null) text = t('winNumbered', wins.findIndex(w => w.id === wf) + 1)
  return { hidden: wins.length < 2, text, active: filter !== 'all' }
}
