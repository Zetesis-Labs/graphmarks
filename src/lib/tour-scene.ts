import type { ViewMode } from '../types'

/**
 * Escena de la guía: el estado COMPLETO de interfaz que un paso necesita, no
 * el incremento respecto al anterior. Así llegar a un paso da lo mismo desde
 * dónde —avanzando, retrocediendo o saltando—, que es justo lo que rompía
 * cuando cada paso solo aplicaba su delta.
 */
export interface TourScene {
  view: ViewMode
  onlyOpen: boolean
  /** Texto en el buscador; cadena vacía = búsqueda limpia. */
  search: string
  listOpen: boolean
  /** Menú contextual abierto sobre el hub principal. */
  menuOnHub: boolean
  /** Qué encuadra la cámara. */
  focus: 'all' | 'hub' | 'firstOpen'
}

/** Estado de reposo: lo que ve quien abre la guía. */
export const NEUTRAL_SCENE: TourScene = {
  view: 'folders',
  onlyOpen: false,
  search: '',
  listOpen: false,
  menuOnHub: false,
  focus: 'all'
}

/** Completa una escena parcial: lo que un paso no declara vuelve a reposo. */
export function resolveScene(partial: Partial<TourScene> = {}): TourScene {
  return { ...NEUTRAL_SCENE, ...partial }
}

/** Claves cuyo valor difiere entre dos objetos del mismo tipo. */
export function changedKeys<T extends object>(from: T, to: T): Set<keyof T> {
  const keys = new Set<keyof T>()
  for (const key of Object.keys(to) as Array<keyof T>) {
    if (!Object.is(from[key], to[key])) keys.add(key)
  }
  return keys
}
