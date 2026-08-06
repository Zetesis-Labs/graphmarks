/**
 * Pestaña a capturar desde el popup: la activa de la ventana actual salvo que
 * sea nuestra (el popup puede llegar como ventana propia cuando no existe
 * `action.openPopup`); en ese caso, la primera activa ajena de otra ventana.
 */
export function pickTargetTab<T extends { url?: string }>(
  current: T | undefined,
  actives: readonly T[],
  ownPrefix: string
): T | undefined {
  const isOwn = (tab: T): boolean => (tab.url ?? '').startsWith(ownPrefix)
  if (current && !isOwn(current)) return current
  return actives.find(tab => !isOwn(tab))
}
