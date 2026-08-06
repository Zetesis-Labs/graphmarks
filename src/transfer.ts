import { app } from './bus'
import { t } from './i18n'
import { saveStore } from './lib/storage'
import { persistSessions } from './sessions'
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
    sessions: S.savedSessions,
    folderPrefs: S.folderPrefs,
    historyRange: S.historyRange,
    historyGrouping: S.historyGrouping,
    historyMuted: [...S.historyMuted]
  }
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `graphmarks-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function applyImport(data: ExportPayload): Promise<void> {
  if (data.tags) {
    S.tagsMap = { ...S.tagsMap, ...data.tags }
    await persistTags()
  }
  if (data.layout) {
    S.pinned = data.layout
    await saveStore('layout', S.pinned)
  }
  if (data.folderPrefs) {
    S.folderPrefs = { ...S.folderPrefs, ...data.folderPrefs }
    await saveStore('folderPrefs', S.folderPrefs)
  }
  if (data.historyRange) {
    S.historyRange = data.historyRange
    await saveStore('historyRange', S.historyRange)
  }
  if (data.historyGrouping) {
    S.historyGrouping = data.historyGrouping
    await saveStore('historyGrouping', S.historyGrouping)
  }
  if (Array.isArray(data.historyMuted)) {
    S.historyMuted = new Set(data.historyMuted)
    await saveStore('historyMuted', [...S.historyMuted])
  }
  if (Array.isArray(data.sessions)) {
    const known = new Set(S.savedSessions.map(s => s.id))
    S.savedSessions = [...S.savedSessions, ...data.sessions.filter(s => !known.has(s.id))]
    await persistSessions()
  }
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
        await applyImport(JSON.parse(await f.text()) as ExportPayload)
        toast(t('toastImported'))
        app.rebuildSoon()
      } catch (e) {
        toast(t('toastImportFailed', (e as Error).message))
      }
    })()
  })
  inp.click()
}
