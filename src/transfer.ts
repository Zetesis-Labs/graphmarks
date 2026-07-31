import { app } from './bus'
import { saveStore } from './lib/storage'
import { updateSessionsChip } from './sessions'
import { S } from './state'
import { persistTags } from './tags'
import type { ExportPayload } from './types'
import { toast } from './ui/toast'

/** Exporta etiquetas, layout fijado y sesiones como JSON descargable. */
export function exportData(): void {
  const data: ExportPayload = {
    app: 'graphmarks',
    version: 1,
    exported: new Date().toISOString(),
    tags: S.tagsMap,
    layout: S.pinned,
    sessions: S.savedSessions
  }
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `graphmarks-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importData(): void {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'application/json'
  inp.addEventListener('change', () => {
    void (async () => {
      const f = inp.files?.[0]
      if (!f) return
      try {
        const data = JSON.parse(await f.text()) as ExportPayload
        if (data.tags) {
          S.tagsMap = { ...S.tagsMap, ...data.tags }
          await persistTags()
        }
        if (data.layout) {
          S.pinned = data.layout
          await saveStore('layout', S.pinned)
        }
        if (Array.isArray(data.sessions)) {
          const known = new Set(S.savedSessions.map(s => s.id))
          S.savedSessions.push(...data.sessions.filter(s => !known.has(s.id)))
          await saveStore('sessions', S.savedSessions)
          updateSessionsChip()
        }
        toast('Datos importados')
        app.rebuildSoon()
      } catch (e) {
        toast(`No se pudo importar: ${(e as Error).message}`)
      }
    })()
  })
  inp.click()
}
