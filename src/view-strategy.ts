import { adopt, api, safeOp } from './bookmarks'
import { OTHER_CONTAINER } from './constants'
import { confirmDeleteTag, promptRenameTag, promptSaveHistoryNodes } from './dialogs'
import { buildGraphDomains, buildGraphFolders, buildGraphTags, members } from './graph/build'
import { buildHistoryGraph, muteHistoryDomain } from './history-view'
import { t } from './i18n'
import { zoomToNodes } from './interactions'
import { short } from './lib/utils'
import { S } from './state'
import { setTags, tagsOf } from './tags'
import type { MenuItem, ViewMode, ViewStrategy } from './types'
import HistoryLegend from './ui/legend'
import { toast } from './ui/toast'

/* --- helpers compartidos --- */

function customOfFolder(id: string | undefined): string | undefined {
  const raw = id ? S.byId.get(id)?.raw : undefined
  return raw ? S.customColors[`f:${raw}`] : undefined
}

function noop(): void {
  /* vista de solo lectura: no se puede soltar */
}

/* ========================================================================== */
/*  Folders                                                                   */
/* ========================================================================== */

const foldersStrategy: ViewStrategy = {
  build: tree => {
    buildGraphFolders(tree)
    return true
  },
  supportsGhosts: true,
  supportsPresentation: true,
  supportsHeat: true,
  hostLinks: true,

  isDropTarget(n) {
    return n.type === 'folder' && !n.subtype
  },

  handleDrop(subj, target) {
    if (subj.type === 'ghost') {
      void safeOp(() => adopt(subj, target.raw ?? ''))
      return
    }
    const oldParent = subj.parentId
    void safeOp(async () => {
      await api.move(subj.raw ?? '', { parentId: target.raw ?? '' })
      toast(
        t('toastMovedTo', short(subj.title), short(target.title)),
        oldParent
          ? () => void safeOp(() => api.move(subj.raw ?? '', { parentId: S.byId.get(oldParent)?.raw ?? oldParent }))
          : null
      )
    })
  },

  bmColor(n) {
    return customOfFolder(n.folderId ?? undefined)
  },

  emptyMessage() {
    return S.onlyOpen
      ? { title: t('emptyNoOpenTitle'), body: t('emptyNoOpenBody') }
      : { title: t('emptyNoBookmarksTitle'), body: t('emptyNoBookmarksBody') }
  }
}

/* ========================================================================== */
/*  Tags                                                                      */
/* ========================================================================== */

const tagsStrategy: ViewStrategy = {
  build: tree => {
    buildGraphTags(tree)
    return true
  },
  supportsGhosts: true,
  supportsPresentation: false,
  supportsHeat: true,
  hostLinks: false,

  isDropTarget(n) {
    return n.type === 'folder' && n.subtype === 'tag'
  },

  handleDrop(subj, target) {
    if (subj.type === 'ghost') {
      void safeOp(() => adopt(subj, OTHER_CONTAINER, target.tag ?? undefined))
      return
    }
    const url = subj.url ?? ''
    const oldTags = tagsOf(url)
    void safeOp(async () => {
      await setTags(url, [...oldTags, target.tag ?? ''])
      toast(t('toastTagAdded', target.tag ?? '', short(subj.title)), () => void setTags(url, oldTags))
    })
  },

  hubMenu(n) {
    if (n.subtype !== 'tag') return undefined
    return [
      {
        label: t('menuFrame'),
        action: () => zoomToNodes(members(n), 90)
      },
      ...(n.tag
        ? [
            { sep: true } as MenuItem,
            {
              label: t('menuRenameTag'),
              action: () => promptRenameTag(n.tag ?? '')
            },
            {
              label: t('menuDeleteTag', n.count ?? 0),
              danger: true,
              action: () => confirmDeleteTag(n.tag ?? '')
            }
          ]
        : [])
    ]
  },

  emptyMessage() {
    return S.onlyOpen
      ? { title: t('emptyNoOpenTitle'), body: t('emptyNoOpenBody') }
      : { title: t('emptyNoBookmarksTitle'), body: t('emptyNoBookmarksBody') }
  }
}

/* ========================================================================== */
/*  Domains                                                                   */
/* ========================================================================== */

const domainsStrategy: ViewStrategy = {
  build: tree => {
    buildGraphDomains(tree)
    return true
  },
  supportsGhosts: true,
  supportsPresentation: false,
  supportsHeat: true,
  hostLinks: false,

  isDropTarget() {
    return false
  },

  handleDrop: noop,

  emptyMessage() {
    return S.onlyOpen
      ? { title: t('emptyNoOpenTitle'), body: t('emptyNoOpenBody') }
      : { title: t('emptyNoBookmarksTitle'), body: t('emptyNoBookmarksBody') }
  }
}

/* ========================================================================== */
/*  History                                                                   */
/* ========================================================================== */

const historyStrategy: ViewStrategy = {
  build: () => buildHistoryGraph(),
  supportsGhosts: false,
  supportsPresentation: false,
  supportsHeat: false,
  hostLinks: false,

  isDropTarget() {
    return false
  },

  handleDrop: noop,

  hubMenu(n) {
    const unsaved = members(n).filter(m => m.type === 'bm' && m.unsaved)
    return [
      {
        label: t('menuFrame'),
        action: () => zoomToNodes(members(n), 90)
      },
      ...(unsaved.length
        ? [
            {
              label: t('menuSaveUnsaved', unsaved.length),
              action: () => promptSaveHistoryNodes(unsaved)
            }
          ]
        : []),
      ...(n.id.startsWith('hist-domain:')
        ? [
            { sep: true } as MenuItem,
            {
              label: t('menuMuteDomain', n.title),
              danger: true,
              action: () => void muteHistoryDomain(n.title)
            }
          ]
        : [])
    ]
  },

  legendItems() {
    return [HistoryLegend]
  },

  emptyMessage() {
    return { title: t('emptyNoHistoryTitle'), body: t('emptyNoHistoryBody') }
  }
}

/* ========================================================================== */
/*  Registro                                                                  */
/* ========================================================================== */

export const strategies: Record<ViewMode, ViewStrategy> = {
  folders: foldersStrategy,
  tags: tagsStrategy,
  domains: domainsStrategy,
  history: historyStrategy
}
