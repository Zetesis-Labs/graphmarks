import { app } from './bus'
import { TAG_BUCKETS } from './constants'
import { t } from './i18n'
import { loadStore, saveStore } from './lib/storage'
import { normTags, tagBucket } from './lib/tag-utils'
import { S, syncActive } from './state'
import type { TagsMap } from './types'

export function tagsOf(url: string): string[] {
  return S.tagsMap[url] ?? []
}

/** Todas las etiquetas con su frecuencia, de más a menos usada. */
export function allTags(): Array<[string, number]> {
  const c = new Map<string, number>()
  for (const ts of Object.values(S.tagsMap)) for (const t of ts) c.set(t, (c.get(t) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}

export async function setTags(url: string, tags: string[]): Promise<void> {
  if (tags.length) S.tagsMap[url] = tags
  else delete S.tagsMap[url]
  await persistTags()
  app.rebuildSoon()
}

export { normTags, tagBucket }

/* Persistencia en chrome.storage.sync troceada en buckets (ver tagBucket). */

let lastBuckets: Record<string, string> = {}

export async function loadTags(): Promise<TagsMap> {
  if (syncActive()) {
    try {
      const all = await chrome.storage.sync.get(null)
      const merged: TagsMap = {}
      lastBuckets = {}
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith('tags_')) continue
        Object.assign(merged, v as TagsMap)
        lastBuckets[k] = JSON.stringify(v)
      }
      if (!Object.keys(merged).length) {
        // migración desde el almacenamiento local de versiones anteriores
        const local = await loadStore<TagsMap>('tags', {})
        if (Object.keys(local).length) {
          S.tagsMap = local
          await persistTags()
          return local
        }
      }
      return merged
    } catch {
      /* caer a local */
    }
  }
  return loadStore<TagsMap>('tags', {})
}

export async function persistTags(): Promise<void> {
  if (syncActive()) {
    try {
      const buckets: Record<string, TagsMap> = {}
      for (let i = 0; i < TAG_BUCKETS; i++) buckets[`tags_${i}`] = {}
      for (const [url, ts] of Object.entries(S.tagsMap)) {
        const bucket = buckets[tagBucket(url)]
        if (bucket) bucket[url] = ts
      }
      const changed: Record<string, TagsMap> = {}
      for (const [k, v] of Object.entries(buckets)) {
        const serialized = JSON.stringify(v)
        if (lastBuckets[k] !== serialized) {
          changed[k] = v
          lastBuckets[k] = serialized
        }
      }
      if (Object.keys(changed).length) await chrome.storage.sync.set(changed)
      return
    } catch (e) {
      void import('./ui/toast').then(m => m.toast(t('toastSyncFallback', (e as Error).message ?? String(e))))
    }
  }
  await saveStore('tags', S.tagsMap)
}

/** Primera ejecución: sembrar etiquetas de ejemplo para las URLs presentes. */
export async function seedTagsIfEmpty(urls: Set<string>): Promise<boolean> {
  if (Object.keys(S.tagsMap).length || !window.SEED_TAGS) return false
  const seed: TagsMap = {}
  for (const [url, ts] of Object.entries(window.SEED_TAGS)) if (urls.has(url)) seed[url] = ts
  if (!Object.keys(seed).length) return false
  S.tagsMap = seed
  await persistTags()
  return true
}
