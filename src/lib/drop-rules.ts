import type { ViewMode } from '../types'

/** Datos del sujeto arrastrado que la regla necesita — sin grafo ni estado global. */
export interface DropSubject {
  id: string
  isBookmark: boolean
  /** Se convierte en marcador al soltarlo sobre un destino (pestaña fantasma). */
  isAdoptable: boolean
  parentId: string | null
  hubs: readonly string[]
  /** Subárbol completo si el sujeto es carpeta, incluida ella misma. */
  folderMemberIds: readonly string[]
}

/** Destinos vetados al soltar `subject`, o null si la vista no tiene semántica de soltado. */
export function dropExclusions(view: ViewMode, subject: DropSubject, untaggedHub: string): Set<string> | null {
  if (view === 'domains' || view === 'history') return null
  if (view === 'tags') {
    if (!subject.isBookmark && !subject.isAdoptable) return null
    return new Set([...subject.hubs, untaggedHub])
  }
  if (subject.isAdoptable) return new Set(subject.hubs)
  const excluded = new Set([subject.id, ...subject.folderMemberIds])
  if (subject.parentId) excluded.add(subject.parentId)
  return excluded
}
