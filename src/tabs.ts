import { app } from './bus'
import { IS_EXT, MOCK_TABS } from './env'
import { t } from './i18n'
import { saveStore } from './lib/storage'
import { bestBookmarkMatch, normPath, short } from './lib/utils'
import { S } from './state'
import type { GraphNode, TabInfo, WindowSummary, WinFilter } from './types'
import { tabcountEl, winchipEl } from './ui/dom'
import { showMenu } from './ui/menu'
import { toast } from './ui/toast'

interface RawTab {
  id?: number
  windowId?: number
  title?: string
  url?: string
  active?: boolean
  lastAccessed?: number
}

function tabStatus(text: string, warn = false): void {
  tabcountEl.hidden = !text
  tabcountEl.textContent = text
  tabcountEl.classList.toggle('warn', warn)
}

/* --- filtro por ventana (chip ⊞) --- */

export function effectiveWinFilter(): number | null {
  if (S.winFilter === 'all') return null
  if (S.winFilter === 'current') return S.currentWinId
  return S.winList.some(w => w.id === S.winFilter) ? S.winFilter : null
}

export function updateWinChip(): void {
  winchipEl.hidden = S.winList.length < 2
  const wf = effectiveWinFilter()
  let text = t('winAll')
  if (S.winFilter === 'current') text = t('winCurrent')
  else if (wf !== null) {
    const i = S.winList.findIndex(w => w.id === wf)
    text = t('winNumbered', i + 1)
  }
  winchipEl.textContent = text
  winchipEl.classList.toggle('active', S.winFilter !== 'all')
}

async function setWinFilter(v: WinFilter): Promise<void> {
  S.winFilter = v
  await saveStore('winFilter', v === 'all' || v === 'current' ? v : 'all')
  updateWinChip()
  await refreshTabs()
}

/* --- inventario y matching de pestañas --- */

interface OpenTabsResult {
  map: Map<string, TabInfo[]>
  ghosts: TabInfo[]
}

export async function computeOpenTabs(bms: GraphNode[]): Promise<OpenTabsResult> {
  let tabs: RawTab[]
  if (IS_EXT) {
    if (!chrome.tabs) {
      tabStatus(t('badgeNoTabsPermission'), true)
      return { map: new Map(), ghosts: [] }
    }
    tabs = await chrome.tabs.query({})
    const withUrl = tabs.filter(t => t.url).length
    if (tabs.length && !withUrl) {
      tabStatus(t('badgeHiddenUrls'), true)
      return { map: new Map(), ghosts: [] }
    }
  } else {
    tabs = MOCK_TABS
  }

  // inventario de ventanas (para el chip ⊞) antes de filtrar
  const byWin = new Map<number, WindowSummary>()
  for (const t of tabs) {
    if (!/^https?:/.test(t.url ?? '')) continue
    const winId = t.windowId ?? 0
    const w = byWin.get(winId) ?? { id: winId, count: 0, title: '' }
    w.count++
    if (t.active) w.title = t.title ?? w.title
    byWin.set(winId, w)
  }
  S.winList = [...byWin.values()].sort((a, b) => a.id - b.id)
  updateWinChip()
  const wf = effectiveWinFilter()
  if (wf !== null) tabs = tabs.filter(t => t.windowId === wf)

  const map = new Map<string, TabInfo[]>()
  const ghosts: TabInfo[] = []
  for (const t of tabs) {
    if (!/^https?:/.test(t.url ?? '')) continue
    let u: URL
    try {
      u = new URL(t.url ?? '')
    } catch {
      continue
    }
    const host = u.host.toLowerCase()
    const path = normPath(u.pathname)
    const best = bestBookmarkMatch(bms, host, path)
    const info: TabInfo = {
      id: t.id ?? 0,
      windowId: t.windowId ?? 0,
      title: t.title ?? t.url ?? '',
      url: t.url ?? '',
      host: u.host,
      active: !!t.active,
      last: t.lastAccessed ?? 0
    }
    if (best) {
      if (!map.has(best.id)) map.set(best.id, [])
      map.get(best.id)?.push(info)
    } else {
      ghosts.push(info)
    }
  }
  for (const list of map.values()) list.sort((a, b) => b.last - a.last)
  return { map, ghosts }
}

function openKey(map: Map<string, TabInfo[]>): string {
  return [...map.keys()].sort().join('|')
}

export function sessionKey(): string {
  return `${openKey(S.openTabs)}‖${S.ghostTabs
    .map(g => g.id)
    .sort((a, b) => a - b)
    .join(',')}`
}

export function updateBadge(): void {
  const matched = [...S.openTabs.values()].reduce((s, l) => s + l.length, 0)
  if (tabcountEl.classList.contains('warn')) return
  const loose = S.ghostTabs.length
    ? S.ghostTabs.length === 1
      ? t('badgeLooseOne')
      : t('badgeLoose', S.ghostTabs.length)
    : ''
  tabStatus(
    S.onlyOpen ? t('badgeOnlyOpen', matched) : `${matched === 1 ? t('badgeOpenOne') : t('badgeOpen', matched)}${loose}`
  )
  tabcountEl.classList.toggle('active', S.onlyOpen)
}

export function clearBadgeWarn(): void {
  tabcountEl.classList.remove('warn')
}

export async function refreshTabs(): Promise<void> {
  clearBadgeWarn()
  const res = await computeOpenTabs(S.allBms)
  S.openTabs = res.map
  S.ghostTabs = res.ghosts
  updateBadge()
  const key = sessionKey()
  const changed = key !== S.lastOpenKey
  S.lastOpenKey = key
  if (changed && (S.onlyOpen || (S.showGhosts && S.viewMode !== 'history'))) {
    app.rebuildSoon()
    return
  }
  app.requestDraw()
}

let tabsTimer: ReturnType<typeof setTimeout> | undefined
export function rescanTabsSoon(): void {
  clearTimeout(tabsTimer)
  tabsTimer = setTimeout(() => void refreshTabs(), 250)
}

export async function toggleOnlyOpen(): Promise<void> {
  S.onlyOpen = !S.onlyOpen
  await saveStore('onlyOpen', S.onlyOpen)
  await app.rebuild(false)
  app.zoomToNodes(S.nodes, 80)
}

export async function activateTab(tab: TabInfo): Promise<void> {
  if (!IS_EXT) {
    toast(t('toastPreviewGoToTab', short(tab.title)))
    return
  }
  try {
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    const self = await chrome.tabs.getCurrent()
    if (self?.id !== undefined && self.id !== tab.id) void chrome.tabs.remove(self.id)
  } catch (e) {
    toast(t('toastTabError', (e as Error).message ?? String(e)))
    rescanTabsSoon()
  }
}

export async function closeTab(tab: TabInfo): Promise<void> {
  if (!IS_EXT) {
    const i = MOCK_TABS.findIndex(t => t.id === tab.id)
    if (i >= 0) MOCK_TABS.splice(i, 1)
    toast(t('toastPreviewCloseTab', short(tab.title)))
    rescanTabsSoon()
    return
  }
  try {
    await chrome.tabs.remove(tab.id)
  } catch (e) {
    toast(t('toastCloseError', (e as Error).message ?? String(e)))
  }
}

/* --- permisos --- */

/** tabGroups es opcional: se pide en runtime (requiere un gesto del usuario). */
export async function ensureTabGroups(): Promise<boolean> {
  if (!IS_EXT || chrome.tabGroups) return !!chrome.tabGroups
  if (!chrome.permissions?.request) return false
  try {
    const ok = await chrome.permissions.request({ permissions: ['tabGroups'] })
    if (ok && !chrome.tabGroups) toast(t('toastPermissionGranted'))
    return !!chrome.tabGroups
  } catch (e) {
    toast(t('toastPermissionError', (e as Error).message ?? String(e)))
    return false
  }
}

export async function checkPermissions(): Promise<void> {
  if (!IS_EXT || !chrome.permissions) return
  try {
    const g = await chrome.permissions.getAll()
    const have = new Set(g.permissions ?? [])
    const missing = ['tabs', 'history', 'storage'].filter(p => !have.has(p))
    if (missing.length) {
      toast(t('toastMissingPermissions', missing.join(', ')))
      return
    }
    if (!chrome.tabGroups) {
      toast(t('toastNoTabGroups'), () => void ensureTabGroups(), t('toastGrant'))
    }
  } catch {
    /* nada */
  }
}

/* --- UI: listeners de chips --- */

export function initTabsUi(): void {
  tabcountEl.addEventListener('click', () => void toggleOnlyOpen())
  winchipEl.addEventListener('click', ev => {
    ev.stopPropagation() // que el clic no llegue al cierre global del menú
    const r = winchipEl.getBoundingClientRect()
    const mark = (on: boolean) => (on ? '✓ ' : '  ')
    showMenu(r.left, r.bottom + 6, [
      { label: `${mark(S.winFilter === 'all')}${t('winMenuAll')}`, action: () => void setWinFilter('all') },
      { label: `${mark(S.winFilter === 'current')}${t('winMenuCurrent')}`, action: () => void setWinFilter('current') },
      { sep: true },
      ...S.winList.map((w, i) => ({
        label: `${mark(S.winFilter === w.id)}${t('winMenuItem', i + 1, short(w.title || t('winUntitled'), 20), w.count)}`,
        action: () => void setWinFilter(w.id)
      }))
    ])
  })
}

export async function resolveCurrentWindow(): Promise<void> {
  if (IS_EXT) {
    try {
      S.currentWinId = (await chrome.windows.getCurrent()).id ?? null
    } catch {
      S.currentWinId = null
    }
  } else {
    S.currentWinId = 1
  }
}
