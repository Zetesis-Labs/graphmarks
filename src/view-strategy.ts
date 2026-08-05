import { OTHER_CONTAINER } from './constants'
import { buildGraphDomains, buildGraphFolders, buildGraphTags, members } from './graph/build'
import { t } from './i18n'
import { short } from './lib/utils'
import { S } from './state'
import { setTags, tagsOf } from './tags'
import type { CustomViewSpec, MenuItem, ViewMode, ViewStrategy } from './types'

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
    const items: HTMLElement[] = []

    void import('./history-view').then(_hv => {
      // Lazy load history helpers when rendering legend
    })

    // Read synchronous values from S if needed or import history-view
    const range = document.createElement('button')
    range.className = 'chip active'
    range.title = t('historyRangeTitle')
    void import('./history-view').then(hv => {
      range.textContent = `◷ ${hv.historyRangeLabel()} · ${S.allBms.length} ▾`
    })
    range.addEventListener('click', ev => {
      ev.stopPropagation()
      const rect = range.getBoundingClientRect()
      void Promise.all([import('./ui/menu'), import('./history-view')]).then(([menu, hv]) => {
        menu.showMenu(rect.left, rect.bottom + 6, hv.historyRangeMenu())
      })
    })
    items.push(range)

    if (S.historyRange.preset === 'custom') {
      const clear = document.createElement('button')
      clear.className = 'chip'
      clear.textContent = '✕'
      clear.title = t('historyClearFilter')
      clear.addEventListener('click', () => {
        void import('./history-view').then(hv => hv.setHistoryRange({ preset: '24h' }))
      })
      items.push(clear)
    }

    const unsavedCount = S.allBms.filter(n => n.unsaved).length
    if (unsavedCount || S.historyUnsavedOnly) {
      const triage = document.createElement('button')
      triage.className = S.historyUnsavedOnly ? 'chip active' : 'chip'
      triage.textContent = `☆ ${t('historyUnsavedChip')} · ${unsavedCount}`
      triage.title = t('historyUnsavedTitle')
      triage.addEventListener('click', () => {
        void import('./history-view').then(hv => hv.setHistoryUnsavedOnly(!S.historyUnsavedOnly))
      })
      items.push(triage)
    }

    return items
  },

  emptyMessage() {
    return { title: t('emptyNoHistoryTitle'), body: t('emptyNoHistoryBody') }
  }
}

/* ========================================================================== */
/*  Registro                                                                  */
/* ========================================================================== */

export const strategies: Record<string, ViewStrategy> = {
  folders: foldersStrategy,
  tags: tagsStrategy,
  domains: domainsStrategy,
  history: historyStrategy
}

export function getStrategy(mode: ViewMode): ViewStrategy {
  const builtin = strategies[mode]
  if (builtin) return builtin
  const spec = S.customViews.find(v => v.id === mode)
  if (spec) return createCustomStrategy(spec)
  return foldersStrategy
}

import { buildCustomGraph } from './graph/build-custom'

export function createCustomStrategy(spec: CustomViewSpec): ViewStrategy {
  return {
    build(tree) {
      buildCustomGraph(tree, spec.query)
    },
    supportsGhosts: true,
    supportsPresentation: true,
    supportsHeat: true,
    hostLinks: true,
    isDropTarget(n) {
      return n.type === 'folder' && !n.subtype
    },
    handleDrop: foldersStrategy.handleDrop,
    bmColor: foldersStrategy.bmColor,
    emptyMessage() {
      return {
        title: spec.name,
        body: `No hay marcadores que coincidan con la consulta "${spec.query}".`
      }
    }
  }
}
