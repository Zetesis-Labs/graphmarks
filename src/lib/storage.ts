import { HAS_STORAGE } from '../env'

/** Almacén clave/valor: chrome.storage.local o localStorage en la preview. */
export async function loadStore<T>(key: string, def: T): Promise<T> {
  if (HAS_STORAGE) {
    const o = await chrome.storage.local.get(key)
    return (o[key] as T | undefined) ?? def
  }
  try {
    const raw = localStorage.getItem(`gm-${key}`)
    return raw === null ? def : ((JSON.parse(raw) as T) ?? def)
  } catch {
    return def
  }
}

export async function saveStore(key: string, val: unknown): Promise<void> {
  if (HAS_STORAGE) await chrome.storage.local.set({ [key]: val })
  else localStorage.setItem(`gm-${key}`, JSON.stringify(val))
}
