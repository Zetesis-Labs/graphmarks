import type {
  ExportPayload,
  FolderPreferences,
  HistoryGrouping,
  HistoryRange,
  PinnedLayouts,
  SavedSession,
  TagsMap
} from '../types'

/**
 * Marcas aceptadas en el campo `app`. `graphmarks` es el nombre anterior al
 * renombrado: se sigue leyendo para no invalidar las exportaciones ya guardadas.
 */
const APP_IDS: readonly string[] = ['graphacker', 'graphmarks']

/** Payload de exportación válido, o null si el JSON no es de Graphacker. */
export function parseImportPayload(raw: unknown): ExportPayload | null {
  const o = raw as ExportPayload | null
  return o && typeof o === 'object' && APP_IDS.includes(o.app) && typeof o.version === 'number' ? o : null
}

export interface ImportPatch {
  tagsMap?: TagsMap
  pinned?: PinnedLayouts
  folderPrefs?: FolderPreferences
  historyRange?: HistoryRange
  historyGrouping?: HistoryGrouping
  historyMuted?: string[]
  savedSessions?: SavedSession[]
}

/**
 * Política de fusión de una importación: etiquetas y preferencias de carpeta
 * MEZCLAN (gana lo importado clave a clave), layout, rango y silenciados se
 * REEMPLAZAN, y las sesiones se AÑADEN deduplicadas por id. Solo devuelve las
 * piezas presentes en el payload; la cáscara persiste cada una.
 */
export function mergeImport(
  current: { tagsMap: TagsMap; folderPrefs: FolderPreferences; savedSessions: SavedSession[] },
  data: ExportPayload
): ImportPatch {
  const patch: ImportPatch = {}
  if (data.tags) patch.tagsMap = { ...current.tagsMap, ...data.tags }
  if (data.layout) patch.pinned = data.layout
  if (data.folderPrefs) patch.folderPrefs = { ...current.folderPrefs, ...data.folderPrefs }
  if (data.historyRange) patch.historyRange = data.historyRange
  if (data.historyGrouping) patch.historyGrouping = data.historyGrouping
  if (Array.isArray(data.historyMuted)) patch.historyMuted = data.historyMuted
  if (Array.isArray(data.sessions)) {
    const known = new Set(current.savedSessions.map(s => s.id))
    patch.savedSessions = [...current.savedSessions, ...data.sessions.filter(s => !known.has(s.id))]
  }
  return patch
}
