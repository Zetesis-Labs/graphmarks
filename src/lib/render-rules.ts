import type { LinkKind } from '../types'

/** Reglas de estilo y visibilidad del render — números puros, sin canvas. */

export function linkAlpha(kind: LinkKind, hasFocus: boolean, onFocus: boolean): number {
  if (hasFocus) return onFocus ? 0.9 : 0.04
  return kind === 'host' ? 0.14 : kind === 'history' ? 0.24 : 0.3
}

export function linkWidth(kind: LinkKind): number {
  return kind === 'host' ? 0.7 : kind === 'history' ? 0.9 : 1
}

/** Las etiquetas menores (subdominio/ruta) exigen zoom o hover; con foco, solo lo enfocado. */
export function folderLabelVisible(
  minor: boolean,
  k: number,
  focused: boolean,
  hasFocus: boolean,
  hovered: boolean
): boolean {
  if (!focused && hasFocus) return false
  if (minor && k < 0.85 && !hovered) return false
  return true
}

/** Los marcadores etiquetan cerca, los ghosts antes, y el hover o el buscador siempre. */
export function bmLabelVisible(
  k: number,
  isGhost: boolean,
  focused: boolean,
  hasFocus: boolean,
  hovered: boolean,
  searchFocused: boolean
): boolean {
  return (k >= 1.5 && focused) || (isGhost && k >= 0.8 && focused) || (hasFocus && focused) || hovered || searchFocused
}
