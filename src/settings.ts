import { app } from './bus'
import { HAS_SYNC, IS_EXT, IS_FIREFOX } from './env'
import { type MessageKey, t } from './i18n'
import {
  type ActionMode,
  type AppSettings,
  NATIVE_NEWTAB_URL,
  OPEN_SOURCE_PARAM,
  type OpenMode,
  shouldReleaseNewTab
} from './lib/settings-shape'
import { saveStore } from './lib/storage'
import { loadSessions } from './sessions'
import { S } from './state'
import { loadTags } from './tags'
import { dlg, settingsBtn } from './ui/dom'

async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  S.settings = { ...S.settings, ...patch }
  await saveStore('settings', S.settings)
}

/**
 * Con «solo botón», la pestaña nueva se devuelve al NTP nativo navegando a él.
 * En Firefox esa URL es privilegiada y la navegación falla: se degrada
 * mostrando el grafo, que siempre es mejor que una pestaña muerta.
 */
export async function maybeReleaseNewTab(params: URLSearchParams): Promise<boolean> {
  if (!IS_EXT || !chrome.tabs) return false
  if (!shouldReleaseNewTab(S.settings, params.get(OPEN_SOURCE_PARAM))) return false
  try {
    const own = await chrome.tabs.getCurrent()
    if (own?.id === undefined) return false
    await chrome.tabs.update(own.id, { url: NATIVE_NEWTAB_URL })
    return true
  } catch {
    // degradación deliberada: sin NTP alcanzable, se sigue con el arranque normal
    return false
  }
}

interface RadioOption<T extends string> {
  value: T
  labelKey: MessageKey
  descKey: MessageKey
}

const OPEN_MODE_OPTIONS: RadioOption<OpenMode>[] = [
  { value: 'newtab', labelKey: 'settingsOpenModeNewtab', descKey: 'settingsOpenModeNewtabDesc' },
  { value: 'action', labelKey: 'settingsOpenModeAction', descKey: 'settingsOpenModeActionDesc' }
]

const ACTION_MODE_OPTIONS: RadioOption<ActionMode>[] = [
  { value: 'auto', labelKey: 'settingsActionModeAuto', descKey: 'settingsActionModeAutoDesc' },
  { value: 'capture', labelKey: 'settingsActionModeCapture', descKey: 'settingsActionModeCaptureDesc' },
  { value: 'graph', labelKey: 'settingsActionModeGraph', descKey: 'settingsActionModeGraphDesc' }
]

function buildRadioOption<T extends string>(
  group: string,
  opt: RadioOption<T>,
  current: T,
  onPick: (value: T) => void
): HTMLLabelElement {
  const lab = document.createElement('label')
  lab.className = 'opt'
  const radio = document.createElement('input')
  radio.type = 'radio'
  radio.name = group
  radio.value = opt.value
  radio.checked = current === opt.value
  radio.addEventListener('change', () => {
    if (radio.checked) onPick(opt.value)
  })
  const body = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'opt-title'
  title.textContent = t(opt.labelKey)
  const desc = document.createElement('div')
  desc.className = 'opt-desc'
  desc.textContent = t(opt.descKey)
  body.append(title, desc)
  lab.append(radio, body)
  return lab
}

function buildOpenModeOptions(): HTMLElement[] {
  return OPEN_MODE_OPTIONS.map(opt =>
    buildRadioOption('openMode', opt, S.settings.openMode, value => {
      // en «automático» el botón depende de esto: hay que repintar el panel
      void saveSettings({ openMode: value }).then(() => openSettingsPanel())
    })
  )
}

function buildActionModeOptions(): HTMLElement[] {
  return ACTION_MODE_OPTIONS.map(opt =>
    buildRadioOption('actionMode', opt, S.settings.actionMode, value => {
      void saveSettings({ actionMode: value })
    })
  )
}

/* --- atajos de teclado ---
   Ningún navegador deja que una extensión *asigne* combinaciones (evitaría que
   se secuestre ⌘T sin permiso): `commands` es de solo lectura y el rebindeo
   vive en la página del navegador. Aquí se muestran los atajos vigentes y se
   abre esa página, que además no admite enlace directo — hay que navegarla
   con tabs.create. */

const SHORTCUTS_URL = IS_FIREFOX ? 'about:addons' : 'chrome://extensions/shortcuts'

/** El manifest no localiza la descripción de `_execute_action`: la ponemos aquí. */
const COMMAND_LABELS: Record<string, MessageKey> = {
  _execute_action: 'shortcutsActionButton',
  'open-graph': 'menuActionOpenGraph',
  'save-page': 'menuActionSavePage'
}

async function fillShortcuts(list: HTMLDivElement): Promise<void> {
  const note = document.createElement('div')
  note.className = 'opt-desc'
  if (!IS_EXT || !chrome.commands?.getAll) {
    note.textContent = t('shortcutsUnavailable')
    list.replaceChildren(note)
    return
  }
  const commands = await chrome.commands.getAll()
  if (!commands.length) {
    note.textContent = t('shortcutsUnavailable')
    list.replaceChildren(note)
    return
  }
  list.replaceChildren()
  for (const cmd of commands) {
    const row = document.createElement('div')
    row.className = 'kbd-row'
    const label = document.createElement('span')
    const key = COMMAND_LABELS[cmd.name ?? '']
    label.textContent = key ? t(key) : (cmd.description ?? cmd.name ?? '')
    const combo = document.createElement('span')
    combo.className = cmd.shortcut ? 'kbd' : 'kbd unset'
    combo.textContent = cmd.shortcut || t('shortcutsUnset')
    row.append(label, combo)
    list.appendChild(row)
  }
}

function buildShortcutsContent(): HTMLElement[] {
  const list = document.createElement('div')
  list.className = 'kbd-list'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'opt-btn'
  btn.textContent = t('shortcutsConfigure')
  btn.disabled = !IS_EXT
  btn.addEventListener('click', () => void chrome.tabs.create({ url: SHORTCUTS_URL }))
  void fillShortcuts(list)
  return [list, btn]
}

/**
 * Al reactivar sync mandan los datos remotos si existen (loadTags ya migra el
 * local hacia arriba cuando los buckets están vacíos); al apagarlo se refresca
 * el espejo local de etiquetas, que en modo sync no siempre se escribe.
 */
async function applySyncToggle(enabled: boolean): Promise<void> {
  await saveSettings({ syncEnabled: enabled })
  if (enabled) {
    S.tagsMap = await loadTags()
    await loadSessions()
    app.rebuildSoon()
  } else {
    await saveStore('tags', S.tagsMap)
  }
}

function buildSyncContent(): HTMLElement[] {
  const lab = document.createElement('label')
  lab.className = 'opt'
  const check = document.createElement('input')
  check.type = 'checkbox'
  check.checked = S.settings.syncEnabled
  check.disabled = IS_EXT && !HAS_SYNC
  check.addEventListener('change', () => void applySyncToggle(check.checked))
  const body = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'opt-title'
  title.textContent = t('settingsSyncLabel')
  const desc = document.createElement('div')
  desc.className = 'opt-desc'
  desc.textContent = check.disabled ? t('settingsSyncUnavailable') : t('settingsSyncDesc')
  body.append(title, desc)
  lab.append(check, body)
  return [lab]
}

interface PanelSection {
  titleKey: MessageKey
  hintKey: MessageKey
  build: () => HTMLElement[]
}

const SECTIONS: PanelSection[] = [
  { titleKey: 'settingsOpenMode', hintKey: 'settingsOpenModeHint', build: buildOpenModeOptions },
  { titleKey: 'settingsActionMode', hintKey: 'settingsActionModeHint', build: buildActionModeOptions },
  { titleKey: 'settingsShortcuts', hintKey: 'settingsShortcutsHint', build: buildShortcutsContent },
  { titleKey: 'settingsSync', hintKey: 'settingsSyncHint', build: buildSyncContent }
]

/** Sección visible; se conserva entre repintados para no saltar al principio. */
let activeSection = 0

function buildPane(section: PanelSection): HTMLDivElement {
  const pane = document.createElement('div')
  pane.className = 'md-pane'
  const title = document.createElement('h4')
  title.textContent = t(section.titleKey)
  const hint = document.createElement('p')
  hint.className = 'pane-hint'
  hint.textContent = t(section.hintKey)
  pane.append(title, hint, ...section.build())
  return pane
}

function buildNav(onPick: (index: number) => void): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = 'md-nav'
  SECTIONS.forEach((section, i) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = i === activeSection ? 'md-tab active' : 'md-tab'
    tab.textContent = t(section.titleKey)
    tab.addEventListener('click', () => onPick(i))
    nav.appendChild(tab)
  })
  return nav
}

/**
 * Panel modal de ajustes en maestro-detalle: los cambios se aplican y
 * persisten al instante, sin botón de guardar.
 */
export function openSettingsPanel(): void {
  dlg.className = 'settings'
  dlg.replaceChildren()

  const h = document.createElement('h3')
  h.textContent = t('settingsTitle')

  const body = document.createElement('div')
  body.className = 'master-detail'
  const section = SECTIONS[activeSection] ?? SECTIONS[0]
  body.append(
    buildNav(i => {
      activeSection = i
      openSettingsPanel()
    }),
    section ? buildPane(section) : document.createElement('div')
  )

  const row = document.createElement('div')
  row.className = 'actions'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'primary'
  close.textContent = t('dlgClose')
  close.addEventListener('click', () => dlg.close())
  row.appendChild(close)

  dlg.append(h, body, row)
  if (!dlg.open) dlg.showModal()
}

export function initSettingsUi(): void {
  settingsBtn.addEventListener('click', openSettingsPanel)
}
