import { IS_EXT, MOCK_TABS } from './env'
import { loadStore, saveStore } from './lib/storage'
import { short } from './lib/utils'
import { S } from './state'
import { ensureTabGroups } from './tabs'
import type { SavedSession, SavedTab, SessionWindow } from './types'
import { openDialog } from './ui/dialog'
import { sessionsEl } from './ui/dom'
import { showMenu } from './ui/menu'
import { toast } from './ui/toast'

type Scope = 'all' | number

export function sessionTabCount(s: SavedSession): number {
  return s.windows.reduce((a, w) => a + w.tabs.length, 0)
}

export function updateSessionsChip(): void {
  sessionsEl.textContent = S.savedSessions.length ? `▤ Sesiones · ${S.savedSessions.length}` : '▤ Sesiones'
}

function countSplits(s: SavedSession): number {
  return new Set(s.windows.flatMap(w => w.tabs.map(t => t.splitId).filter(x => x != null))).size
}

/* --- captura --- */

interface WinLike {
  id?: number
  left?: number
  top?: number
  width?: number
  height?: number
  state?: string
  tabs?: chrome.tabs.Tab[]
}

function mockWindowsFromTabs(): WinLike[] {
  const byWin = new Map<number, WinLike>()
  for (const t of MOCK_TABS) {
    let w = byWin.get(t.windowId)
    if (!w) {
      w = { id: t.windowId, left: 80, top: 80, width: 1280, height: 800, state: 'normal', tabs: [] }
      byWin.set(t.windowId, w)
    }
    w.tabs?.push({ ...t, groupId: -1 } as unknown as chrome.tabs.Tab)
  }
  return [...byWin.values()]
}

/**
 * splitViewId es de solo lectura y su nombre puede variar entre versiones de
 * Chrome; aceptamos cualquier propiedad *split* con valor real.
 */
function readSplitId(tab: Record<string, unknown>): number | null {
  let splitId: number | null = null
  for (const [k, v] of Object.entries(tab)) if (/split/i.test(k) && v != null && v !== -1) splitId = v as number
  return splitId
}

export async function captureSession(name: string, winScope: Scope): Promise<SavedSession> {
  // las pestañas salen de tabs.query: es la vía que garantiza splitViewId
  // (los Tab de windows.getAll(populate) pueden venir sin ese campo)
  let wins: WinLike[]
  let allTabs: chrome.tabs.Tab[] | null = null
  if (IS_EXT) {
    wins = await chrome.windows.getAll({ windowTypes: ['normal'] })
    allTabs = await chrome.tabs.query({})
  } else {
    wins = mockWindowsFromTabs()
  }

  const groupsById = new Map<number, chrome.tabGroups.TabGroup>()
  if (IS_EXT && chrome.tabGroups) {
    try {
      for (const g of await chrome.tabGroups.query({})) groupsById.set(g.id, g)
    } catch {
      /* sin permiso tabGroups */
    }
  }

  const selfUrl = IS_EXT ? chrome.runtime.getURL('') : null
  const windows: SessionWindow[] = []
  for (const w of wins) {
    if (winScope !== 'all' && w.id !== winScope) continue
    const wTabs = allTabs ? allTabs.filter(t => t.windowId === w.id).sort((a, b) => a.index - b.index) : (w.tabs ?? [])
    const groups: SessionWindow['groups'] = []
    const gIndex = new Map<number, number>()
    const tabs: SavedTab[] = []

    for (const t of wTabs) {
      const url = t.url ?? ''
      if (!url) continue
      if (selfUrl && url.startsWith(selfUrl)) continue // esta new tab
      if (url.startsWith('chrome://newtab')) continue
      let groupIdx: number | null = null
      if (t.groupId != null && t.groupId !== -1) {
        if (!gIndex.has(t.groupId)) {
          const g = groupsById.get(t.groupId)
          gIndex.set(t.groupId, groups.length)
          groups.push({ title: g?.title ?? '', color: g?.color ?? 'grey', collapsed: !!g?.collapsed })
        }
        groupIdx = gIndex.get(t.groupId) ?? null
      }
      tabs.push({
        url,
        title: t.title ?? url,
        pinned: !!t.pinned,
        active: !!t.active,
        groupIdx,
        splitId: readSplitId(t as unknown as Record<string, unknown>)
      })
    }
    if (!tabs.length) continue
    windows.push({
      bounds: { left: w.left, top: w.top, width: w.width, height: w.height, state: w.state },
      tabs,
      groups
    })
  }

  return { id: `s${Date.now().toString(36)}`, name, created: new Date().toISOString(), windows }
}

/* --- restauración --- */

async function restoreGroups(w: SessionWindow, win: chrome.windows.Window, created: chrome.tabs.Tab[]): Promise<void> {
  // agrupar aunque falte el permiso tabGroups: chrome.tabs.group no lo
  // necesita; solo los metadatos (título/color/plegado) lo requieren
  if (!chrome.tabs.group) return
  const byGroup = new Map<number, number[]>()
  w.tabs.forEach((t, i) => {
    const tab = created[i]
    if (t.groupIdx == null || !tab?.id) return
    if (!byGroup.has(t.groupIdx)) byGroup.set(t.groupIdx, [])
    byGroup.get(t.groupIdx)?.push(tab.id)
  })
  for (const [gi, tabIds] of byGroup) {
    try {
      const gid = await chrome.tabs.group({ tabIds, createProperties: { windowId: win.id } })
      if (!chrome.tabGroups) continue
      const spec = w.groups[gi] ?? { title: '', color: 'grey', collapsed: false }
      const props = {
        title: spec.title,
        color: spec.color as chrome.tabGroups.ColorEnum,
        collapsed: spec.collapsed
      }
      try {
        await chrome.tabGroups.update(gid, props)
      } catch {
        // reintento: el grupo puede estar aún creándose
        await new Promise(r => setTimeout(r, 350))
        await chrome.tabGroups
          .update(gid, props)
          .catch((e2: Error) => toast(`Metadatos de grupo no aplicados: ${e2.message}`))
      }
    } catch (e) {
      toast(`Grupo no recreado: ${(e as Error).message}`)
    }
  }
}

/**
 * Chrome no expone API para recrear la división (splitViewId es de solo
 * lectura, w3c/webextensions#967). Si algún día aparece chrome.tabs.split se
 * usará sola; mientras, el par queda seleccionado para rehacerlo en un clic.
 */
async function restoreSplits(w: SessionWindow, win: chrome.windows.Window, created: chrome.tabs.Tab[]): Promise<void> {
  const bySplit = new Map<number, number[]>()
  w.tabs.forEach((t, i) => {
    const tab = created[i]
    if (t.splitId == null || !tab?.id) return
    if (!bySplit.has(t.splitId)) bySplit.set(t.splitId, [])
    bySplit.get(t.splitId)?.push(tab.id)
  })
  for (const ids of bySplit.values()) {
    if (ids.length < 2) continue
    const maybeSplit = (chrome.tabs as unknown as { split?: (o: { tabIds: number[] }) => Promise<unknown> }).split
    if (typeof maybeSplit === 'function') {
      try {
        await maybeSplit({ tabIds: ids })
        continue
      } catch {
        /* caer a la selección */
      }
    }
    try {
      // índices frescos: fijar/agrupar puede haberlos desplazado
      const idx: number[] = []
      for (const id of ids) idx.push((await chrome.tabs.get(id)).index)
      await chrome.tabs.highlight({ windowId: win.id, tabs: idx })
    } catch {
      /* seguir */
    }
    break // solo se puede dejar seleccionado un par por ventana
  }
}

export async function restoreSession(s: SavedSession): Promise<void> {
  if (!IS_EXT) {
    toast(`Vista previa: abriría ${s.windows.length} ventana(s) con ${sessionTabCount(s)} pestañas`)
    return
  }
  if (s.windows.some(w => w.groups.length)) await ensureTabGroups()

  for (const w of s.windows) {
    const props: chrome.windows.CreateData = { url: w.tabs.map(t => t.url) }
    if (w.bounds.state === 'maximized' || w.bounds.state === 'fullscreen') {
      props.state = w.bounds.state as chrome.windows.windowStateEnum
    } else if (Number.isFinite(w.bounds.left)) {
      props.left = w.bounds.left
      props.top = w.bounds.top
      props.width = w.bounds.width
      props.height = w.bounds.height
    }
    let win: chrome.windows.Window | undefined
    try {
      win = await chrome.windows.create(props)
    } catch (e) {
      toast(`No se pudo abrir la ventana: ${(e as Error).message}`)
      continue
    }
    if (!win) continue
    const created = win.tabs ?? []

    for (let i = 0; i < w.tabs.length; i++) {
      const tab = created[i]
      if (w.tabs[i]?.pinned && tab?.id) {
        try {
          await chrome.tabs.update(tab.id, { pinned: true })
        } catch {
          /* seguir */
        }
      }
    }
    await restoreGroups(w, win, created)

    const ai = w.tabs.findIndex(t => t.active)
    const activeTab = ai >= 0 ? created[ai] : undefined
    if (activeTab?.id) {
      try {
        await chrome.tabs.update(activeTab.id, { active: true })
      } catch {
        /* seguir */
      }
    }
    await restoreSplits(w, win, created)
  }

  toast(
    countSplits(s)
      ? `Sesión «${short(s.name)}» restaurada — Chrome no deja recrear la vista dividida desde extensiones; el par queda seleccionado: clic derecho sobre la selección → «vista dividida»`
      : `Sesión «${short(s.name)}» restaurada`
  )
}

/* --- UI --- */

async function promptSaveSession(): Promise<void> {
  await ensureTabGroups() // pedirlo aquí: estamos dentro de un gesto de clic
  const winOpts = [{ value: 'all', label: 'Todas las ventanas' }]
  S.winList.forEach((w, i) => {
    winOpts.push({
      value: String(w.id),
      label: `${w.id === S.currentWinId ? 'Esta ventana' : `Ventana ${i + 1}`} · ${short(w.title || 'sin título', 18)} (${w.count})`
    })
  })

  openDialog(
    {
      title: 'Guardar sesión de ventanas',
      note:
        'Guarda qué pestañas hay en cada ventana, su orden, las fijadas, los grupos (título, color, plegado) y la posición y tamaño de cada ventana.' +
        (IS_EXT && !chrome.tabGroups
          ? ' ⚠ Ahora mismo el permiso «tabGroups» NO está activo: los grupos se guardarían sin título ni color.'
          : ''),
      fields: [
        { name: 'name', label: 'Nombre', required: true, placeholder: 'p. ej. Proyecto Konect' },
        { name: 'scope', label: 'Qué guardar', type: 'select', value: 'all', options: winOpts }
      ],
      submitLabel: 'Guardar'
    },
    v => {
      void (async () => {
        const scope: Scope = v.scope === 'all' ? 'all' : Number(v.scope)
        const s = await captureSession(v.name ?? '', scope)
        if (!s.windows.length) {
          toast('No hay pestañas que guardar en ese ámbito')
          return
        }
        S.savedSessions.push(s)
        await saveStore('sessions', S.savedSessions)
        updateSessionsChip()

        const nGroups = s.windows.reduce((a, w) => a + w.groups.length, 0)
        const nSplits = countSplits(s)
        let msg = `Sesión «${short(v.name ?? '')}» guardada: ${s.windows.length} ventana${s.windows.length === 1 ? '' : 's'}, ${sessionTabCount(s)} pestañas`
        if (nGroups) msg += `, ${nGroups} grupo${nGroups === 1 ? '' : 's'}`
        if (nSplits) msg += `, ${nSplits} dividida${nSplits === 1 ? '' : 's'}`
        if (nGroups && IS_EXT && !chrome.tabGroups)
          msg += ' — sin el permiso «tabGroups» los grupos se restaurarán sin título ni color'
        toast(msg)
      })()
    }
  )
}

async function showDiagnostics(): Promise<void> {
  if (!IS_EXT) {
    toast('El diagnóstico solo tiene sentido dentro de la extensión')
    return
  }
  const lines: string[] = []
  try {
    const g = await chrome.permissions.getAll()
    lines.push(`Permisos concedidos: ${(g.permissions ?? []).join(', ')}`)
  } catch (e) {
    lines.push(`permissions.getAll: ${(e as Error).message}`)
  }
  lines.push(
    `APIs activas: tabGroups=${!!chrome.tabGroups} · tabs.group=${!!chrome.tabs?.group} · history=${!!chrome.history}`
  )
  const tabsSplit = Object.keys(chrome.tabs ?? {}).filter(k => /split/i.test(k))
  const rootSplit = Object.keys(chrome).filter(k => /split/i.test(k))
  lines.push(
    `Claves *split*: chrome.tabs=[${tabsSplit.join(', ') || 'ninguna'}] · chrome=[${rootSplit.join(', ') || 'ninguna'}]`
  )
  try {
    const gs = chrome.tabGroups ? await chrome.tabGroups.query({}) : []
    lines.push(`Grupos abiertos ahora: ${gs.length}`)
    for (const g of gs.slice(0, 5))
      lines.push(`  · «${g.title || '(sin título)'}» ${g.color}${g.collapsed ? ' plegado' : ''} win=${g.windowId}`)
  } catch (e) {
    lines.push(`tabGroups.query: ${(e as Error).message}`)
  }
  try {
    const tabs = await chrome.tabs.query({})
    const t = (tabs.find(x => /^https?:/.test(x.url ?? '')) ?? tabs[0] ?? {}) as Record<string, unknown>
    lines.push(`Campos de una pestaña: ${Object.keys(t).sort().join(', ')}`)
    const split = tabs.filter(x =>
      Object.entries(x as unknown as Record<string, unknown>).some(
        ([k, v]) => /split/i.test(k) && v != null && v !== -1
      )
    )
    lines.push(`Pestañas con campo split activo: ${split.length}`)
    const first = split[0] as unknown as Record<string, unknown> | undefined
    if (first) {
      const subset = Object.fromEntries(
        Object.entries(first).filter(([k]) => /split|^id$|index|windowId|groupId/i.test(k))
      )
      lines.push(`  ejemplo: ${JSON.stringify(subset)}`)
    }
  } catch (e) {
    lines.push(`tabs.query: ${(e as Error).message}`)
  }
  for (const s of S.savedSessions.slice(-3)) {
    const gtxt = s.windows
      .map(w => w.groups.map(g => `«${g.title || 'sin título'}»/${g.color}`).join(' + ') || 'sin grupos')
      .join(' | ')
    const nSplit = s.windows.reduce((a, w) => a + w.tabs.filter(t => t.splitId != null).length, 0)
    lines.push(`Sesión guardada «${s.name}»: ${gtxt} · pestañas con split: ${nSplit}`)
  }
  openDialog({ title: 'Diagnóstico de sesiones', note: lines.join('\n'), submitLabel: 'Cerrar' }, () => {})
}

function deleteSessionMenu(anchor: DOMRect): void {
  showMenu(
    anchor.left,
    anchor.bottom + 6,
    S.savedSessions.map(s => ({
      label: `✕ ${short(s.name, 30)}`,
      danger: true,
      action: () => {
        void (async () => {
          S.savedSessions = S.savedSessions.filter(x => x.id !== s.id)
          await saveStore('sessions', S.savedSessions)
          updateSessionsChip()
          toast(`Sesión «${short(s.name)}» eliminada`)
        })()
      }
    }))
  )
}

export function initSessionsUi(): void {
  sessionsEl.addEventListener('click', ev => {
    ev.stopPropagation() // que el clic no llegue al cierre global del menú
    const r = sessionsEl.getBoundingClientRect()
    const items = [{ label: 'Guardar ventanas abiertas…', action: () => void promptSaveSession() }]
    if (S.savedSessions.length) {
      items.push({ sep: true } as never)
      for (const s of S.savedSessions) {
        items.push({
          label: `▶ ${short(s.name, 24)} — ${s.windows.length} vent · ${sessionTabCount(s)} pest`,
          action: () => void restoreSession(s)
        })
      }
      items.push({ sep: true } as never)
      items.push({
        label: 'Eliminar una sesión…',
        danger: true,
        action: () => setTimeout(() => deleteSessionMenu(r), 0)
      } as never)
    }
    items.push({ sep: true } as never)
    items.push({ label: '🩺 Diagnóstico…', action: () => void showDiagnostics() })
    showMenu(r.left, r.bottom + 6, items)
  })
}

export async function loadSessions(): Promise<void> {
  S.savedSessions = await loadStore<SavedSession[]>('sessions', [])
  updateSessionsChip()
}
