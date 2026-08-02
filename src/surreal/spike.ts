/* Spike SurrealDB embebido: mide en el Chrome real el coste de arrancar el
   motor WASM (worker + indxdb://) y de proyectar/consultar los marcadores.
   Vive en el bundle IIFE pero carga dist/surreal.js con import() dinámico
   tras el primer pintado, para no tocar el arranque de la newtab. */
import { IS_EXT } from '../env'
import { S } from '../state'
import type { RawBookmarkNode } from '../types'
import type { SpikeBookmark, SpikeInput, SpikeReport, SpikeTagEntry } from './client'

type SurrealModule = typeof import('./client')

interface GmSpike {
  run: () => Promise<SpikeReport | undefined>
  wipe: () => Promise<string[]>
  db: () => unknown
}

declare global {
  interface Window {
    gmSpike?: GmSpike
  }
}

let modPromise: Promise<SurrealModule> | undefined
let loadedMod: SurrealModule | undefined
let importMs = 0

function loadModule(): Promise<SurrealModule> {
  modPromise ??= (async () => {
    const t0 = performance.now()
    const mod = (await import(chrome.runtime.getURL('dist/surreal.js'))) as SurrealModule
    importMs = Math.round(performance.now() - t0)
    loadedMod = mod
    return mod
  })()
  return modPromise
}

function flattenBookmarks(nodes: RawBookmarkNode[], path: string, acc: SpikeBookmark[]): void {
  for (const n of nodes) {
    if (n.url) acc.push({ url: n.url, title: n.title, folder: path || null, chromeId: n.id })
    else flattenBookmarks(n.children ?? [], path ? `${path}/${n.title}` : n.title, acc)
  }
}

function collectInput(): SpikeInput {
  const bookmarks: SpikeBookmark[] = []
  flattenBookmarks(S.lastTree[0]?.children ?? [], '', bookmarks)
  const tags: SpikeTagEntry[] = []
  for (const [url, ts] of Object.entries(S.tagsMap)) for (const tag of ts) tags.push({ url, tag })
  const searchTerm =
    bookmarks
      .flatMap(b => b.title.split(/\s+/))
      .find(w => w.length >= 4)
      ?.toLowerCase() ?? 'graph'
  return { bookmarks, tags, searchTerm }
}

async function runAndReport(): Promise<SpikeReport | undefined> {
  try {
    const mod = await loadModule()
    const report = await mod.runSpike(collectInput())
    console.log(
      `[graphmarks·surreal] total ${report.totalMs} ms (import módulo: ${importMs} ms) · ` +
        `${report.counts.bookmarks} marcadores, ${report.counts.tagEntries} tags`
    )
    console.table(
      Object.fromEntries(Object.entries(report.steps).map(([k, v]) => [k, { ms: v.ms, error: v.error ?? '' }]))
    )
    console.log('[graphmarks·surreal] muestras:', report.samples)
    console.log(
      '[graphmarks·surreal] window.gmSpike: run() re-mide en caliente · wipe() borra la BBDD para medir en frío'
    )
    return report
  } catch (e) {
    console.error('[graphmarks·surreal] spike falló:', e)
    return undefined
  }
}

export function scheduleSurrealSpike(): void {
  if (!IS_EXT) return
  window.gmSpike = {
    run: runAndReport,
    wipe: async () => (await loadModule()).wipe(),
    db: () => loadedMod?.getDb()
  }
  setTimeout(() => void runAndReport(), 1500)
}
