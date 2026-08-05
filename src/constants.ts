import type { ViewMode } from './types'

export const SERIES_VARS = [
  '--series-1',
  '--series-2',
  '--series-3',
  '--series-4',
  '--series-5',
  '--series-6',
  '--series-7',
  '--series-8'
] as const

export const MAX_SLOTS = SERIES_VARS.length

/** hub sintético de la vista tags para marcadores sin etiquetar */
export const UNTAGGED = 't:·'
/** hub sintético de la vista dominios para dominios con un solo marcador */
export const LOOSE_DOM = 'd:·'
/** id estable del contenedor «Otros marcadores» de Chrome */
export const OTHER_CONTAINER = '2'

export const SAT_R = 3.6
export const PLUS_R = 5
export const BACK_R = 7
export const MAX_SATS = 6

export const TAG_BUCKETS = 12

export const VIEW_KEYS: Record<ViewMode, 'viewFolders' | 'viewTags' | 'viewDomains'> = {
  folders: 'viewFolders',
  tags: 'viewTags',
  domains: 'viewDomains'
}
