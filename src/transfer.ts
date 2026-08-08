import { app } from './bus'
import { t } from './i18n'
import { mergeImport, parseImportPayload } from './lib/import-merge'
import { saveStore } from './lib/storage'
import { persistSessions } from './sessions'
import { S } from './state'
import { persistTags } from './tags'
import type { ExportPayload } from './types'
import { toast } from './ui/toast'

/** Exporta etiquetas, layout fijado y sesiones como JSON descargable. */
export function exportData(): void {
  const data: ExportPayload = {
    app: 'graphacker',
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
  a.download = `graphacker-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function applyImport(data: ExportPayload): Promise<void> {
  const patch = mergeImport({ tagsMap: S.tagsMap, folderPrefs: S.folderPrefs, savedSessions: S.savedSessions }, data)
  if (patch.tagsMap) {
    S.tagsMap = patch.tagsMap
    await persistTags()
  }
  if (patch.pinned) {
    S.pinned = patch.pinned
    await saveStore('layout', S.pinned)
  }
  if (patch.folderPrefs) {
    S.folderPrefs = patch.folderPrefs
    await saveStore('folderPrefs', S.folderPrefs)
  }
  if (patch.historyRange) {
    S.historyRange = patch.historyRange
    await saveStore('historyRange', S.historyRange)
  }
  if (patch.historyGrouping) {
    S.historyGrouping = patch.historyGrouping
    await saveStore('historyGrouping', S.historyGrouping)
  }
  if (patch.historyMuted) {
    S.historyMuted = new Set(patch.historyMuted)
    await saveStore('historyMuted', patch.historyMuted)
  }
  if (patch.savedSessions) {
    S.savedSessions = patch.savedSessions
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
        const payload = parseImportPayload(JSON.parse(await f.text()))
        if (!payload) {
          toast(t('toastImportInvalid'))
          return
        }
        await applyImport(payload)
        toast(t('toastImported'))
        app.rebuildSoon()
      } catch (e) {
        toast(t('toastImportFailed', (e as Error).message))
      }
    })()
  })
  inp.click()
}
