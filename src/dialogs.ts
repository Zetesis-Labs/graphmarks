import { adopt, api, folderOptions, safeOp } from './bookmarks'
import { app } from './bus'
import { members } from './graph/build'
import { short } from './lib/utils'
import { S } from './state'
import { allTags, normTags, persistTags, setTags, tagsOf } from './tags'
import type { DialogField, GraphNode } from './types'
import { openDialog } from './ui/dialog'

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
      title: `Etiquetas de «${short(n.title)}»`,
      fields: [
        {
          name: 'tags',
          label: 'Etiquetas (separadas por comas)',
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
      title: `Etiquetar todo «${short(folder.title)}»`,
      note: `Añade las etiquetas a los ${folder.count ?? 0} marcadores de la carpeta (sin quitar las existentes).`,
      fields: [{ name: 'tags', label: 'Etiquetas a añadir', type: 'tags', value: '', cloud: allTags().slice(0, 24) }],
      submitLabel: 'Etiquetar'
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
    { title: `Renombrar #${tag}`, fields: [{ name: 'name', label: 'Nuevo nombre', value: tag, required: true }] },
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
      title: `¿Eliminar la etiqueta #${tag}?`,
      note: 'Se quitará de todos los marcadores. Los marcadores no se tocan.',
      submitLabel: 'Eliminar',
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
      title: 'Guardar como marcador',
      fields: [
        { name: 'title', label: 'Título', value: n.title, required: true },
        folderSelectField('dest', 'Carpeta', folderOptions()[0]?.id ?? '')
      ],
      submitLabel: 'Guardar'
    },
    v => void safeOp(() => adopt({ ...n, title: v.title ?? n.title }, v.dest ?? ''))
  )
}

export function promptRename(n: GraphNode): void {
  openDialog(
    {
      title: n.type === 'bm' ? 'Renombrar marcador' : 'Renombrar carpeta',
      fields: [{ name: 'title', label: 'Nombre', value: n.title, required: true }]
    },
    v => void safeOp(() => api.update(n.raw ?? '', { title: v.title }))
  )
}

export function promptUrl(n: GraphNode): void {
  openDialog(
    { title: 'Editar URL', fields: [{ name: 'url', label: 'URL', value: n.url, type: 'url', required: true }] },
    v => void safeOp(() => api.update(n.raw ?? '', { url: v.url }))
  )
}

export function promptMove(n: GraphNode): void {
  const exclude = new Set([n.id])
  if (n.type === 'folder' && !n.subtype) for (const d of members(n)) exclude.add(d.id)
  openDialog(
    {
      title: `Mover «${short(n.title)}»`,
      fields: [folderSelectField('dest', 'Carpeta de destino', n.folderId ?? n.parentId ?? '', exclude)],
      submitLabel: 'Mover'
    },
    v => void safeOp(() => api.move(n.raw ?? '', { parentId: v.dest ?? '' }))
  )
}

export function promptNewFolder(parent?: GraphNode): void {
  const fields: DialogField[] = [{ name: 'title', label: 'Nombre', required: true, placeholder: 'Nueva carpeta' }]
  if (!parent) fields.push(folderSelectField('dest', 'Dentro de', folderOptions()[0]?.id ?? ''))
  openDialog(
    { title: 'Nueva carpeta', fields, submitLabel: 'Crear' },
    v => void safeOp(() => api.create({ parentId: parent ? (parent.raw ?? '') : (v.dest ?? ''), title: v.title ?? '' }))
  )
}

export function promptNewBookmark(parent?: GraphNode): void {
  const fields: DialogField[] = [
    { name: 'title', label: 'Título', required: true },
    { name: 'url', label: 'URL', type: 'url', required: true, placeholder: 'https://…' }
  ]
  if (!parent) fields.push(folderSelectField('dest', 'Carpeta', folderOptions()[0]?.id ?? ''))
  openDialog(
    { title: 'Nuevo marcador', fields, submitLabel: 'Crear' },
    v =>
      void safeOp(() =>
        api.create({ parentId: parent ? (parent.raw ?? '') : (v.dest ?? ''), title: v.title ?? '', url: v.url })
      )
  )
}

export function confirmDelete(n: GraphNode): void {
  openDialog(
    {
      title: n.type === 'bm' ? `¿Eliminar «${short(n.title)}»?` : `¿Eliminar la carpeta «${short(n.title)}»?`,
      note: n.type === 'bm' ? n.url : `Se eliminarán la carpeta y sus ${n.count ?? 0} marcadores.`,
      submitLabel: 'Eliminar',
      danger: true
    },
    () => void safeOp(() => (n.type === 'bm' ? api.remove(n.raw ?? '') : api.removeTree(n.raw ?? '')))
  )
}
