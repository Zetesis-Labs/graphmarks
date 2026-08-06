import { lazy } from 'solid-js'
import { OTHER_CONTAINER } from './constants'
import { buildGraphDomains, buildGraphFolders, buildGraphTags, members } from './graph/build'
import { t } from './i18n'
import { short } from './lib/utils'
import { S } from './state'
import { setTags, tagsOf } from './tags'
import type { MenuItem, ViewMode, ViewStrategy } from './types'

/* La leyenda del historial se carga en diferido: importarla estáticamente
   cerraría el ciclo view-strategy → history-view → state → view-strategy. */
const HistoryLegend = lazy(() => import('./ui/legend'))

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
  build: buildGraphFolders,
  supportsGhosts: true,
  supportsPresentation: true,
  supportsHeat: true,
  hostLinks: true,

  isDropTarget(n) {
    return n.type === 'folder' && !n.subtype
  },

  handleDrop(subj, target) {
    void import('./bookmarks').then(bm => {
      if (subj.type === 'ghost') {
        void bm.safeOp(() => bm.adopt(subj, target.raw ?? ''))
        return
      }
      const oldParent = subj.parentId
      void bm.safeOp(async () => {
        await bm.api.move(subj.raw ?? '', { parentId: target.raw ?? '' })
        const { toast } = await import('./ui/toast')
        toast(
          t('toastMovedTo', short(subj.title), short(target.title)),
          oldParent
            ? () =>
                void bm.safeOp(() => bm.api.move(subj.raw ?? '', { parentId: S.byId.get(oldParent)?.raw ?? oldParent }))
            : null
        )
      })
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
  build: buildGraphTags,
  supportsGhosts: true,
  supportsPresentation: false,
  supportsHeat: true,
  hostLinks: false,

  isDropTarget(n) {
    return n.type === 'folder' && n.subtype === 'tag'
  },

  handleDrop(subj, target) {
    void import('./bookmarks').then(bm => {
      if (subj.type === 'ghost') {
        void bm.safeOp(() => bm.adopt(subj, OTHER_CONTAINER, target.tag ?? undefined))
        return
      }
      const url = subj.url ?? ''
      const oldTags = tagsOf(url)
      void bm.safeOp(async () => {
        await setTags(url, [...oldTags, target.tag ?? ''])
        const { toast } = await import('./ui/toast')
        toast(t('toastTagAdded', target.tag ?? '', short(subj.title)), () => void setTags(url, oldTags))
      })
    })
  },

  hubMenu(n) {
    if (n.subtype !== 'tag') return undefined
    return [
      {
        label: t('menuFrame'),
        action: () => {
          void import('./interactions').then(m => m.zoomToNodes(members(n), 90))
        }
      },
      ...(n.tag
        ? [
            { sep: true } as MenuItem,
            {
              label: t('menuRenameTag'),
              action: () => {
                void import('./dialogs').then(m => m.promptRenameTag(n.tag ?? ''))
              }
            },
            {
              label: t('menuDeleteTag', n.count ?? 0),
              danger: true,
              action: () => {
                void import('./dialogs').then(m => m.confirmDeleteTag(n.tag ?? ''))
              }
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
  build: buildGraphDomains,
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
  build: noop,
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
        action: () => {
          void import('./interactions').then(m => m.zoomToNodes(members(n), 90))
        }
      },
      ...(unsaved.length
        ? [
            {
              label: t('menuSaveUnsaved', unsaved.length),
              action: () => {
                void import('./dialogs').then(m => m.promptSaveHistoryNodes(unsaved))
              }
            }
          ]
        : []),
      ...(n.id.startsWith('hist-domain:')
        ? [
            { sep: true } as MenuItem,
            {
              label: t('menuMuteDomain', n.title),
              danger: true,
              action: () => {
                void import('./history-view').then(hv => hv.muteHistoryDomain(n.title))
              }
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
