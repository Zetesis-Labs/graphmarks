import { app } from '../bus'
import { members } from '../graph/build'
import { t } from '../i18n'
import { saveStore } from '../lib/storage'
import { S } from '../state'
import type { GraphNode, MenuItem } from '../types'
import { zoomToNodes } from './zoom-pan'

async function rebuildAround(id?: string): Promise<void> {
  await app.rebuild(false)
  const n = id ? S.byId.get(id) : undefined
  zoomToNodes(n ? members(n) : S.nodes, n ? 90 : 80)
}

export function closeSubgraph(): void {
  if (!S.activeSubgraph) return
  S.activeSubgraph = null
  void rebuildAround()
}

export function openSubgraph(n: GraphNode): void {
  if (!n.raw || S.activeSubgraph === n.raw) {
    zoomToNodes(members(n), 90)
    return
  }
  S.activeSubgraph = n.raw
  void rebuildAround(n.id)
}

export function expandCollapsed(n: GraphNode): void {
  if (!n.raw) return
  S.expandedFolders.add(n.raw)
  void rebuildAround(n.id)
}

export function setFolderMode(n: GraphNode, mode: 'subgraph' | 'collapsed' | null): void {
  const raw = n.raw
  if (!raw) return
  if (mode) S.folderPrefs[raw] = { [mode]: true }
  else delete S.folderPrefs[raw]
  S.expandedFolders.delete(raw)
  if (S.activeSubgraph === raw && mode !== 'subgraph') S.activeSubgraph = null
  void (async () => {
    await saveStore('folderPrefs', S.folderPrefs)
    await rebuildAround()
  })()
}

export function folderPresentationItems(n: GraphNode): MenuItem[] {
  const raw = n.raw
  if (!raw || !S.strategy.supportsPresentation) return []
  const pref = S.folderPrefs[raw]
  const items: MenuItem[] = [{ sep: true }]

  if (pref?.subgraph) {
    if (S.activeSubgraph !== raw) items.push({ label: t('menuOpenSubgraph'), action: () => openSubgraph(n) })
    else items.push({ label: t('menuBackToGraph'), action: () => closeSubgraph() })
    items.push({ label: t('menuRemoveSubgraph'), action: () => setFolderMode(n, null) })
  } else {
    items.push({ label: t('menuMakeSubgraph'), action: () => setFolderMode(n, 'subgraph') })
  }

  if (pref?.collapsed) {
    if (n.collapsed) items.push({ label: t('menuExpandTemporarily'), action: () => expandCollapsed(n) })
    else {
      items.push({
        label: t('menuCollapseNow'),
        action: () => {
          S.expandedFolders.delete(raw)
          void rebuildAround()
        }
      })
    }
    items.push({ label: t('menuDontCollapseByDefault'), action: () => setFolderMode(n, null) })
  } else {
    items.push({ label: t('menuCollapseByDefault'), action: () => setFolderMode(n, 'collapsed') })
  }
  return items
}
