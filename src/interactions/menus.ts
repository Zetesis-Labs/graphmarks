import { app } from '../bus'
import { customIcon, hasCustomColor, pickColor, pickIcon, removeColor, removeIcon } from '../custom'
import {
  confirmDelete,
  promptAdopt,
  promptMove,
  promptNewBookmark,
  promptNewFolder,
  promptRename,
  promptTagFolder,
  promptTags,
  promptUrl
} from '../dialogs'
import { members } from '../graph/build'
import { nodeColor } from '../graph/style'
import { openHygieneDialog } from '../hygiene'
import { t } from '../i18n'
import { saveStore } from '../lib/storage'
import { S } from '../state'
import { activateTab, closeTab } from '../tabs'
import { exportData, importData } from '../transfer'
import type { GraphNode, MenuItem } from '../types'
import { pinItem, unpinAll } from './pins'
import { closeSubgraph, folderPresentationItems } from './subgraph'
import { zoomToNodes } from './zoom-pan'

export function backgroundMenu(): MenuItem[] {
  return [
    ...(S.activeSubgraph ? [{ label: t('menuBackToGraph'), action: () => closeSubgraph() }, { sep: true }] : []),
    { label: t('menuNewFolder'), action: () => promptNewFolder() },
    { label: t('menuNewBookmark'), action: () => promptNewBookmark() },
    { sep: true },
    {
      label: S.showGhosts ? t('menuHideGhosts') : t('menuShowGhosts'),
      action: () => {
        void (async () => {
          S.showGhosts = !S.showGhosts
          await saveStore('ghosts', S.showGhosts)
          app.rebuildSoon()
        })()
      }
    },
    { label: t('menuUnpinAll'), action: () => unpinAll() },
    { label: t('menuFrameEverything'), action: () => zoomToNodes(S.nodes, 80) },
    { sep: true },
    { label: t('menuExport'), action: () => exportData() },
    { label: t('menuImport'), action: () => importData() },
    { label: t('menuHygiene'), action: () => openHygieneDialog() },
    { sep: true },
    { label: t('menuShowGuide'), action: () => app.startGuide() }
  ]
}

function goToOpenItems(n: GraphNode): MenuItem[] {
  const open = S.openTabs.get(n.id) ?? []
  if (!open.length) return []
  return [
    {
      label: open.length > 1 ? t('menuGoToOpenTabs', open.length) : t('menuGoToOpenTab'),
      action: () => {
        const first = open[0]
        if (first) void activateTab(first)
      }
    }
  ]
}

function historyBmMenu(n: GraphNode): MenuItem[] {
  return [
    ...goToOpenItems(n),
    { label: t('menuOpen'), action: () => (window.location.href = n.url ?? '') },
    { label: t('menuOpenNewTab'), action: () => window.open(n.url ?? '') },
    { sep: true },
    { label: t('menuSaveAsBookmark'), action: () => promptAdopt(n) },
    ...pinItem(n)
  ]
}

function bmMenu(n: GraphNode): MenuItem[] {
  return [
    ...goToOpenItems(n),
    {
      label: t('menuOpen'),
      action: () => {
        window.location.href = n.url ?? ''
      }
    },
    { label: t('menuOpenNewTab'), action: () => window.open(n.url ?? '') },
    { sep: true },
    { label: t('menuTags'), action: () => promptTags(n) },
    { label: t('menuRename'), action: () => promptRename(n) },
    { label: t('menuEditUrl'), action: () => promptUrl(n) },
    { label: t('menuMoveToFolder'), action: () => promptMove(n) },
    { label: t('menuCustomIcon'), action: () => pickIcon(n) },
    ...(customIcon(n) ? [{ label: t('menuCustomIconRemove'), action: () => void removeIcon(n) }] : []),
    ...pinItem(n),
    { sep: true },
    { label: t('menuDelete'), danger: true, action: () => confirmDelete(n) }
  ]
}

function ghostMenu(n: GraphNode): MenuItem[] {
  return [
    { label: t('menuGoToTab'), action: () => n.tab && void activateTab(n.tab) },
    { label: t('menuSaveAsBookmark'), action: () => promptAdopt(n) },
    { sep: true },
    { label: t('menuCloseTab'), danger: true, action: () => n.tab && void closeTab(n.tab) }
  ]
}

export function nodeMenu(n: GraphNode): MenuItem[] {
  if (n.type === 'bm' && n.history) return historyBmMenu(n)
  if (n.type === 'bm') return bmMenu(n)
  if (n.type === 'ghost') return ghostMenu(n)
  if (
    n.subtype === 'ghosthub' ||
    n.subtype === 'domain' ||
    n.subtype === 'subdomain' ||
    n.subtype === 'path' ||
    n.subtype === 'tag'
  ) {
    return S.strategy.hubMenu?.(n) ?? [{ label: t('menuFrame'), action: () => zoomToNodes(members(n), 90) }]
  }
  return [
    { label: t('menuFrameCluster'), action: () => zoomToNodes(members(n), 90) },
    { sep: true },
    { label: t('menuRename'), action: () => promptRename(n) },
    { label: t('menuTagContents'), action: () => promptTagFolder(n) },
    { label: t('menuNewSubfolder'), action: () => promptNewFolder(n) },
    { label: t('menuNewBookmarkHere'), action: () => promptNewBookmark(n) },
    { label: t('menuMoveToFolder'), action: () => promptMove(n) },
    { sep: true },
    { label: t('menuFolderColor'), action: () => pickColor(n, nodeColor(n)) },
    ...(hasCustomColor(n) ? [{ label: t('menuFolderColorRemove'), action: () => void removeColor(n) }] : []),
    { label: t('menuCustomIcon'), action: () => pickIcon(n) },
    ...(customIcon(n) ? [{ label: t('menuCustomIconRemove'), action: () => void removeIcon(n) }] : []),
    ...pinItem(n),
    ...folderPresentationItems(n),
    { sep: true },
    { label: t('menuDeleteFolder', n.count ?? 0), danger: true, action: () => confirmDelete(n) }
  ]
}
