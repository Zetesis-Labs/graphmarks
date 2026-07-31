import { TAG_BUCKETS } from '../constants'
import { strHash } from './utils'

/** Normaliza entrada libre: separadores, `#` inicial, minúsculas, sin duplicados. */
export function normTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map(t => t.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean)
    )
  ]
}

/**
 * Bucket de chrome.storage.sync para una URL. El límite es de 8 KB por item,
 * así que las etiquetas se reparten por hash entre TAG_BUCKETS claves.
 */
export function tagBucket(url: string): string {
  return `tags_${strHash(url) % TAG_BUCKETS}`
}
