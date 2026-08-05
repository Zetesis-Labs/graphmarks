import { simulation } from '../graph/simulation'
import { t } from '../i18n'
import { pinsOfView, S, saveLayoutSoon } from '../state'
import type { GraphNode, MenuItem } from '../types'
import { toast } from '../ui/toast'

export function unpinNode(n: GraphNode): void {
  const pins = pinsOfView()
  if (!pins[n.id]) return
  delete pins[n.id]
  n.fx = null
  n.fy = null
  saveLayoutSoon()
  simulation?.alpha(0.25).restart()
}

export function unpinAll(): void {
  S.pinned[S.viewMode] = {}
  for (const n of S.nodes) {
    n.fx = null
    n.fy = null
  }
  saveLayoutSoon()
  simulation?.alpha(0.5).restart()
  toast(t('toastUnpinAll'))
}

export function pinItem(n: GraphNode): MenuItem[] {
  return pinsOfView()[n.id] ? [{ label: t('menuUnpin'), action: () => unpinNode(n) }] : []
}
