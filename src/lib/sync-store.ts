import { HAS_SYNC } from '../env'
import { loadStore, saveStore } from './storage'

/**
 * Valores grandes en chrome.storage.sync (sincroniza solo con la cuenta de
 * Google del usuario, sin servidores propios). Límites de la API:
 * 8.192 B por item, 102.400 B en total, 512 items y 1.800 escrituras/hora.
 *
 * Por eso el valor se serializa y se parte en trozos por debajo del límite de
 * item; si no cabe o la cuota falla, se degrada a local sin perder datos.
 */
const CHUNK_BYTES = 7000

export interface SyncResult {
  synced: boolean
  reason?: string
}

function chunkString(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

export async function saveChunked(prefix: string, value: unknown): Promise<SyncResult> {
  // el espejo local siempre se escribe: es la red de seguridad si sync falla
  await saveStore(prefix, value)
  if (!HAS_SYNC) return { synced: false, reason: 'sync no disponible' }

  const chunks = chunkString(JSON.stringify(value), CHUNK_BYTES)
  const payload: Record<string, unknown> = { [`${prefix}__n`]: chunks.length }
  chunks.forEach((c, i) => {
    payload[`${prefix}__${i}`] = c
  })
  try {
    const existing = await chrome.storage.sync.get(null)
    const stale = Object.keys(existing).filter(k => {
      const m = k.match(new RegExp(`^${prefix}__(\\d+)$`))
      return m && Number(m[1]) >= chunks.length
    })
    if (stale.length) await chrome.storage.sync.remove(stale)
    await chrome.storage.sync.set(payload)
    return { synced: true }
  } catch (e) {
    return { synced: false, reason: (e as Error).message }
  }
}

export async function loadChunked<T>(prefix: string, def: T): Promise<T> {
  if (HAS_SYNC) {
    try {
      const all = await chrome.storage.sync.get(null)
      const n = all[`${prefix}__n`] as number | undefined
      if (typeof n === 'number' && n > 0) {
        let raw = ''
        for (let i = 0; i < n; i++) raw += (all[`${prefix}__${i}`] as string | undefined) ?? ''
        if (raw) return JSON.parse(raw) as T
      }
    } catch {
      /* caer a local */
    }
  }
  return loadStore<T>(prefix, def)
}

/** Uso actual de la cuota de sync, para el diagnóstico. */
export async function syncUsage(): Promise<{ used: number; total: number } | null> {
  if (!HAS_SYNC) return null
  try {
    const used = await chrome.storage.sync.getBytesInUse(null)
    return { used, total: chrome.storage.sync.QUOTA_BYTES }
  } catch {
    return null
  }
}
