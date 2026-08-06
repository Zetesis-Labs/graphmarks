import { createResource, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
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
import { settingsBtn } from './ui/dom'
import { closeModal, renderModal } from './ui/modal'

/** Espejo reactivo de S.settings: el panel se actualiza solo al cambiarlos. */
const [settings, setSettings] = createSignal<AppSettings>(S.settings)

async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  S.settings = { ...S.settings, ...patch }
  setSettings(S.settings)
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

/* --- opciones --- */

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

function Radio<T extends string>(props: {
  group: string
  option: RadioOption<T>
  current: T
  onPick: (value: T) => void
}): JSX.Element {
  return (
    <label class="opt">
      <input
        type="radio"
        name={props.group}
        value={props.option.value}
        checked={props.current === props.option.value}
        onChange={e => {
          if (e.currentTarget.checked) props.onPick(props.option.value)
        }}
      />
      <div>
        <div class="opt-title">{t(props.option.labelKey)}</div>
        <div class="opt-desc">{t(props.option.descKey)}</div>
      </div>
    </label>
  )
}

function OpenModeSection(): JSX.Element {
  return (
    <For each={OPEN_MODE_OPTIONS}>
      {option => (
        <Radio
          group="openMode"
          option={option}
          current={settings().openMode}
          onPick={value => void saveSettings({ openMode: value })}
        />
      )}
    </For>
  )
}

function ActionModeSection(): JSX.Element {
  return (
    <For each={ACTION_MODE_OPTIONS}>
      {option => (
        <Radio
          group="actionMode"
          option={option}
          current={settings().actionMode}
          onPick={value => void saveSettings({ actionMode: value })}
        />
      )}
    </For>
  )
}

/* --- atajos ---
   Ningún navegador deja que una extensión *asigne* combinaciones (evitaría que
   se secuestre ⌘T sin permiso): `commands` es de solo lectura y el rebindeo
   vive en la página del navegador. Aquí se muestran los vigentes y se abre esa
   página, que además no admite enlace directo — hay que navegarla con
   tabs.create. */

const SHORTCUTS_URL = IS_FIREFOX ? 'about:addons' : 'chrome://extensions/shortcuts'

/** El manifest no localiza la descripción de `_execute_action`: la ponemos aquí. */
const COMMAND_LABELS: Record<string, MessageKey> = {
  _execute_action: 'shortcutsActionButton',
  'open-graph': 'menuActionOpenGraph',
  'save-page': 'menuActionSavePage'
}

function ShortcutsSection(): JSX.Element {
  const [commands] = createResource(async () => {
    if (!IS_EXT || !chrome.commands?.getAll) return []
    return chrome.commands.getAll()
  })

  return (
    <>
      <div class="kbd-list">
        <Show when={commands()?.length} fallback={<div class="opt-desc">{t('shortcutsUnavailable')}</div>}>
          <For each={commands()}>
            {cmd => {
              const key = COMMAND_LABELS[cmd.name ?? '']
              return (
                <div class="kbd-row">
                  <span>{key ? t(key) : (cmd.description ?? cmd.name ?? '')}</span>
                  <span class={cmd.shortcut ? 'kbd' : 'kbd unset'}>{cmd.shortcut || t('shortcutsUnset')}</span>
                </div>
              )
            }}
          </For>
        </Show>
      </div>
      <button
        type="button"
        class="opt-btn"
        disabled={!IS_EXT}
        onClick={() => void chrome.tabs.create({ url: SHORTCUTS_URL })}
      >
        {t('shortcutsConfigure')}
      </button>
    </>
  )
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

function SyncSection(): JSX.Element {
  const unavailable = IS_EXT && !HAS_SYNC
  return (
    <label class="opt">
      <input
        type="checkbox"
        checked={settings().syncEnabled}
        disabled={unavailable}
        onChange={e => void applySyncToggle(e.currentTarget.checked)}
      />
      <div>
        <div class="opt-title">{t('settingsSyncLabel')}</div>
        <div class="opt-desc">{unavailable ? t('settingsSyncUnavailable') : t('settingsSyncDesc')}</div>
      </div>
    </label>
  )
}

/* --- maestro-detalle --- */

interface PanelSection {
  titleKey: MessageKey
  hintKey: MessageKey
  Body: () => JSX.Element
}

const SECTIONS: PanelSection[] = [
  { titleKey: 'settingsOpenMode', hintKey: 'settingsOpenModeHint', Body: OpenModeSection },
  { titleKey: 'settingsActionMode', hintKey: 'settingsActionModeHint', Body: ActionModeSection },
  { titleKey: 'settingsShortcuts', hintKey: 'settingsShortcutsHint', Body: ShortcutsSection },
  { titleKey: 'settingsSync', hintKey: 'settingsSyncHint', Body: SyncSection }
]

function SettingsPanel(): JSX.Element {
  const [active, setActive] = createSignal(0)
  const sectionEls: HTMLElement[] = []
  let pane: HTMLDivElement | undefined

  onMount(() => {
    if (!pane) return
    // la banda superior del detalle decide qué sección se considera activa
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index ?? 0))
        }
      },
      { root: pane, rootMargin: '0px 0px -72% 0px' }
    )
    for (const el of sectionEls) observer.observe(el)
    onCleanup(() => observer.disconnect())
  })

  return (
    <>
      <h3>{t('settingsTitle')}</h3>
      <div class="master-detail">
        <nav class="md-nav">
          <For each={SECTIONS}>
            {(section, i) => (
              <button
                type="button"
                class={i() === active() ? 'md-tab active' : 'md-tab'}
                onClick={() => sectionEls[i()]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {t(section.titleKey)}
              </button>
            )}
          </For>
        </nav>
        <div class="md-pane" ref={pane}>
          <For each={SECTIONS}>
            {(section, i) => (
              <section
                class="md-section"
                data-index={i()}
                ref={el => {
                  sectionEls[i()] = el
                }}
              >
                <h4>{t(section.titleKey)}</h4>
                <p class="pane-hint">{t(section.hintKey)}</p>
                <Dynamic component={section.Body} />
              </section>
            )}
          </For>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="primary" onClick={closeModal}>
          {t('dlgClose')}
        </button>
      </div>
    </>
  )
}

/** Panel de ajustes: los cambios se aplican y persisten al instante. */
export function openSettingsPanel(): void {
  setSettings(S.settings)
  renderModal(() => <SettingsPanel />, 'settings')
}

export function initSettingsUi(): void {
  settingsBtn.addEventListener('click', openSettingsPanel)
}
