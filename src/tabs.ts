import { createEffect, createRoot, createSignal } from 'solid-js'
import { activePort } from './browser-port'
import { app } from './bus'
import { IS_EXT, MOCK_TABS } from './env'
import { focusTab } from './graph-tab'
import { t } from './i18n'
import { badgeView, effectiveWinFilter as pickWinFilter, winChipView } from './lib/badge-label'
import { saveStore } from './lib/storage'
import { matchTabsToBookmarks, summarizeWindows } from './lib/tab-match'
import { short } from './lib/utils'
import { S } from './state'
import type { GraphNode, TabInfo, WinFilter } from './types'
import { tabcountEl, winchipEl } from './ui/dom'
import { showMenu } from './ui/menu'
import { toast } from './ui/toast'

/** Aviso de plataforma (sin permiso, URLs ocultas); null = contador normal. */
const [badgeWarn, setBadgeWarn] = createSignal<string | null>(null)

/* --- filtro por ventana (chip ⊞) --- */

export function effectiveWinFilter(): number | null {
  return pickWinFilter(S.winFilter, S.currentWinId, S.winList)
}

async function setWinFilter(v: WinFilter): Promise<void> {
  S.winFilter = v
  await saveStore('winFilter', v === 'all' || v === 'current' ? v : 'all')
  await refreshTabs()
}

/* --- inventario y matching de pestañas --- */

interface OpenTabsResult {
  map: Map<string, TabInfo[]>
  ghosts: TabInfo[]
}

export async function computeOpenTabs(bms: GraphNode[]): Promise<OpenTabsResult> {
  const { tabs, warning } = await activePort().queryTabs()
  if (warning) {
    setBadgeWarn(warning === 'no-permission' ? t('badgeNoTabsPermission') : t('badgeHiddenUrls'))
    return { map: new Map(), ghosts: [] }
  }
  // inventario de ventanas (para el chip ⊞) antes de filtrar
  S.winList = summarizeWindows(tabs)
  const wf = effectiveWinFilter()
  const scoped = wf !== null ? tabs.filter(t => t.windowId === wf) : tabs
  return matchTabsToBookmarks(scoped, bms)
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

/* Los chips se pintan solos: efectos sobre los campos reactivos de S. Nadie
   tiene que acordarse de invocar un updateBadge tras cada escritura. */

function renderBadge(): void {
  const view = badgeView(
    {
      warn: badgeWarn(),
      scanned: !!S.lastOpenKey,
      matched: [...S.openTabs.values()].reduce((sum, l) => sum + l.length, 0),
      loose: S.ghostTabs.length,
      onlyOpen: S.onlyOpen
    },
    t
  )
  tabcountEl.hidden = view.hidden
  tabcountEl.textContent = view.text
  tabcountEl.classList.toggle('warn', view.warn === true)
  tabcountEl.classList.toggle('active', view.active)
}

function renderWinChip(): void {
  const view = winChipView(S.winFilter, S.currentWinId, S.winList, t)
  winchipEl.hidden = view.hidden
  winchipEl.textContent = view.text
  winchipEl.classList.toggle('active', view.active)
}

export function clearBadgeWarn(): void {
  setBadgeWarn(null)
}

export async function refreshTabs(): Promise<void> {
  clearBadgeWarn()
  const res = await computeOpenTabs(S.allBms)
  S.openTabs = res.map
  S.ghostTabs = res.ghosts
  const key = sessionKey()
  const changed = key !== S.lastOpenKey
  S.lastOpenKey = key
  if (changed && (S.onlyOpen || (S.showGhosts && S.strategy.supportsGhosts))) {
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
    await focusTab(tab.id, tab.windowId)
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
  // raíz sin dispose: los chips viven lo que la página
  createRoot(() => {
    createEffect(renderBadge)
    createEffect(renderWinChip)
  })
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
