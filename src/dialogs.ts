import { adopt, api, folderOptions, safeOp } from './bookmarks'
import { app } from './bus'
import { members } from './graph/build'
import { t } from './i18n'
import { short } from './lib/utils'
import { S } from './state'
import { allTags, normTags, persistTags, setTags, tagsOf } from './tags'
import type { DialogField, GraphNode } from './types'
import { openDialog } from './ui/dialog'
import { toast } from './ui/toast'

export function folderSelectField(name: string, label: string, value: string, excludeIds?: Set<string>): DialogField {
  return {
    name,
    label,
    type: 'select',
    value,
    options: folderOptions(excludeIds).map(f => ({ value: f.id, label: '  '.repeat(f.depth) + f.title }))
  }
}

export function promptTags(n: GraphNode): void {
  openDialog(
    {
      title: t('dlgTagsOf', short(n.title)),
      fields: [
        {
          name: 'tags',
          label: t('fieldTags'),
          type: 'tags',
          value: (n.tags ?? []).join(', '),
          cloud: allTags().slice(0, 24)
        }
      ]
    },
    v => void setTags(n.url ?? '', normTags(v.tags ?? ''))
  )
}

export function promptTagFolder(folder: GraphNode): void {
  openDialog(
    {
      title: t('dlgTagFolder', short(folder.title)),
      note: t('dlgTagFolderNote', folder.count ?? 0),
      fields: [{ name: 'tags', label: t('fieldTagsToAdd'), type: 'tags', value: '', cloud: allTags().slice(0, 24) }],
      submitLabel: t('dlgTag')
    },
    v => {
      void (async () => {
        const add = normTags(v.tags ?? '')
        if (!add.length) return
        for (const m of members(folder)) {
          if (m.type !== 'bm' || !m.url) continue
          S.tagsMap[m.url] = [...new Set([...tagsOf(m.url), ...add])]
        }
        await persistTags()
        app.rebuildSoon()
      })()
    }
  )
}

export function promptRenameTag(tag: string): void {
  openDialog(
    { title: t('dlgRenameTag', tag), fields: [{ name: 'name', label: t('fieldNewName'), value: tag, required: true }] },
    v => {
      void (async () => {
        const to = normTags(v.name ?? '')[0]
        if (!to || to === tag) return
        for (const [url, ts] of Object.entries(S.tagsMap))
          S.tagsMap[url] = [...new Set(ts.map(t => (t === tag ? to : t)))]
        await persistTags()
        app.rebuildSoon()
      })()
    }
  )
}

export function confirmDeleteTag(tag: string): void {
  openDialog(
    {
      title: t('dlgDeleteTag', tag),
      note: t('dlgDeleteTagNote'),
      submitLabel: t('dlgDelete'),
      danger: true
    },
    () => {
      void (async () => {
        for (const [url, ts] of Object.entries(S.tagsMap)) {
          const left = ts.filter(t => t !== tag)
          if (left.length) S.tagsMap[url] = left
          else delete S.tagsMap[url]
        }
        await persistTags()
        app.rebuildSoon()
      })()
    }
  )
}

export function promptAdopt(n: GraphNode): void {
  openDialog(
    {
      title: t('dlgSaveAsBookmark'),
      fields: [
        { name: 'title', label: t('fieldTitle'), value: n.title, required: true },
        folderSelectField('dest', t('fieldFolder'), folderOptions()[0]?.id ?? '')
      ],
      submitLabel: t('dlgSave')
    },
    v => void safeOp(() => adopt({ ...n, title: v.title ?? n.title }, v.dest ?? ''))
  )
}

/** Guardado en lote de páginas del historial sin marcador. */
export function promptSaveHistoryNodes(nodes: GraphNode[]): void {
  if (!nodes.length) return
  openDialog(
    {
      title: t('dlgSaveHistoryNodes', nodes.length),
      fields: [folderSelectField('dest', t('fieldFolder'), folderOptions()[0]?.id ?? '')],
      submitLabel: t('dlgSave')
    },
    v =>
      void safeOp(async () => {
        for (const n of nodes) await api.create({ parentId: v.dest ?? '', title: n.title, url: n.url })
        toast(t('toastHistorySaved', nodes.length))
      })
  )
}

export function promptRename(n: GraphNode): void {
  openDialog(
    {
      title: n.type === 'bm' ? t('dlgRenameBookmark') : t('dlgRenameFolder'),
      fields: [{ name: 'title', label: t('fieldName'), value: n.title, required: true }]
    },
    v => void safeOp(() => api.update(n.raw ?? '', { title: v.title }))
  )
}

export function promptUrl(n: GraphNode): void {
  openDialog(
    {
      title: t('dlgEditUrl'),
      fields: [{ name: 'url', label: t('fieldUrl'), value: n.url, type: 'url', required: true }]
    },
    v => void safeOp(() => api.update(n.raw ?? '', { url: v.url }))
  )
}

export function promptMove(n: GraphNode): void {
  const exclude = new Set([n.id])
  if (n.type === 'folder' && !n.subtype) for (const d of members(n)) exclude.add(d.id)
  openDialog(
    {
      title: t('dlgMoveItem', short(n.title)),
      fields: [folderSelectField('dest', t('fieldDestFolder'), n.folderId ?? n.parentId ?? '', exclude)],
      submitLabel: t('dlgMove')
    },
    v => void safeOp(() => api.move(n.raw ?? '', { parentId: v.dest ?? '' }))
  )
}

export function promptNewFolder(parent?: GraphNode): void {
  const fields: DialogField[] = [
    { name: 'title', label: t('fieldName'), required: true, placeholder: t('phNewFolder') }
  ]
  if (!parent) fields.push(folderSelectField('dest', t('fieldInsideOf'), folderOptions()[0]?.id ?? ''))
  openDialog(
    { title: t('dlgNewFolder'), fields, submitLabel: t('dlgCreate') },
    v => void safeOp(() => api.create({ parentId: parent ? (parent.raw ?? '') : (v.dest ?? ''), title: v.title ?? '' }))
  )
}

export function promptNewBookmark(parent?: GraphNode): void {
  const fields: DialogField[] = [
    { name: 'title', label: t('fieldTitle'), required: true },
    { name: 'url', label: t('fieldUrl'), type: 'url', required: true, placeholder: t('phUrl') }
  ]
  if (!parent) fields.push(folderSelectField('dest', t('fieldFolder'), folderOptions()[0]?.id ?? ''))
  openDialog(
    { title: t('dlgNewBookmark'), fields, submitLabel: t('dlgCreate') },
    v =>
      void safeOp(() =>
        api.create({ parentId: parent ? (parent.raw ?? '') : (v.dest ?? ''), title: v.title ?? '', url: v.url })
      )
  )
}

export function confirmDelete(n: GraphNode): void {
  openDialog(
    {
      title: n.type === 'bm' ? t('dlgDeleteBookmark', short(n.title)) : t('dlgDeleteFolder', short(n.title)),
      note: n.type === 'bm' ? n.url : t('dlgDeleteFolderNote', n.count ?? 0),
      submitLabel: t('dlgDelete'),
      danger: true
    },
    () => void safeOp(() => (n.type === 'bm' ? api.remove(n.raw ?? '') : api.removeTree(n.raw ?? '')))
  )
}
