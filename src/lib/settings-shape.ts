/** Preferencias de la aplicación: forma, valores por defecto y decisiones puras. */

export type OpenMode = 'newtab' | 'action'

/** Qué hace el botón de la barra. `auto` lo deduce del modo de apertura. */
export type ActionMode = 'auto' | 'graph' | 'capture'

/** Comportamiento efectivo del botón, ya resuelto el `auto`. */
export type ResolvedActionMode = Exclude<ActionMode, 'auto'>

export interface AppSettings {
  /** Cómo se abre el grafo: reemplazando la nueva pestaña o solo con el botón de la barra. */
  openMode: OpenMode
  /** Qué hace el clic en el icono de la extensión. */
  actionMode: ActionMode
  /** Sincronizar etiquetas y sesiones vía chrome.storage.sync; apagado = solo este equipo. */
  syncEnabled: boolean
}

export const SETTINGS_DEFAULTS: AppSettings = { openMode: 'newtab', actionMode: 'auto', syncEnabled: true }

/**
 * NTP nativo de Chrome. La override del manifest solo captura chrome://newtab;
 * chrome://new-tab-page sigue siendo la página real y navegar a ella es la
 * única forma de «devolver» la pestaña (MV3 no permite desactivar la override
 * en runtime).
 */
export const NATIVE_NEWTAB_URL = 'chrome://new-tab-page'

/** Parámetro que distingue una apertura explícita (botón de la barra) del secuestro. */
export const OPEN_SOURCE_PARAM = 'source'
export const OPEN_SOURCE_ACTION = 'action'

/** Sanea lo persistido: valores desconocidos o corruptos caen al defecto. */
export function normalizeSettings(raw: unknown): AppSettings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    openMode: o.openMode === 'action' ? 'action' : SETTINGS_DEFAULTS.openMode,
    actionMode: o.actionMode === 'graph' || o.actionMode === 'capture' ? o.actionMode : SETTINGS_DEFAULTS.actionMode,
    syncEnabled: o.syncEnabled !== false
  }
}

/**
 * Con `auto`, el botón cubre el hueco que deja el modo de apertura: si el grafo
 * ya se come la pestaña nueva, el botón sirve para capturar; si el usuario
 * conserva su pestaña nueva, el botón es su única puerta al grafo.
 */
export function resolveActionMode(settings: AppSettings): ResolvedActionMode {
  if (settings.actionMode !== 'auto') return settings.actionMode
  return settings.openMode === 'action' ? 'graph' : 'capture'
}

/**
 * ¿Debe esta carga liberar la nueva pestaña y devolverla al navegador?
 * Solo cuando el usuario eligió abrir con el botón y la página no viene de él.
 */
export function shouldReleaseNewTab(settings: AppSettings, source: string | null): boolean {
  return settings.openMode === 'action' && source !== OPEN_SOURCE_ACTION
}
