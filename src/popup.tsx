import { createResource, createSignal, For, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { IS_EXT } from './env'
import { focusOrOpenGraph } from './graph-tab'
import { t } from './i18n'
import { suggestFolder } from './lib/folder-suggest'
import { type AppSettings, normalizeSettings, SETTINGS_DEFAULTS } from './lib/settings-shape'
import { loadStore } from './lib/storage'
import { normTags } from './lib/tag-utils'
import { S } from './state'
import { allTags, loadTags, tagsOf, setTags as writeTags } from './tags'
import type { FolderOption, RawBookmarkNode } from './types'

/* Popup de captura: guarda la pestaña actual sin abrir el grafo. Página propia
   con su bundle — es el piloto de Solid, el resto de la app sigue en DOM
   imperativo y el grafo nunca sale del canvas. */

/** El service worker escucha el cierre de este puerto para devolver el botón a su modo. */
const CAPTURE_PORT = 'capture-popup'
const CLOSE_DELAY_MS = 450

async function openGraph(): Promise<void> {
  await focusOrOpenGraph(S.settings)
  window.close()
}

/**
 * Pestaña a guardar. En el popup anclado basta la activa de la ventana actual;
 * cuando se abre como ventana propia (respaldo sin `openPopup`), esa ventana es
 * la nuestra y hay que mirar fuera.
 */
async function resolveTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const own = chrome.runtime.getURL('')
  const isOwn = (tb: chrome.tabs.Tab): boolean => (tb.url ?? '').startsWith(own)
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (current && !isOwn(current)) return current
  // sin API de orden de foco, la primera candidata es la mejor aproximación
  const actives = await chrome.tabs.query({ active: true, windowType: 'normal' })
  return actives.find(tb => !isOwn(tb))
}

function flattenFolders(tree: RawBookmarkNode[]): FolderOption[] {
  const out: FolderOption[] = []
  const walk = (items: RawBookmarkNode[], depth: number): void => {
    for (const it of items) {
      if (it.url) continue
      out.push({ id: it.id, title: it.title || t('folderUnnamed'), depth })
      walk(it.children ?? [], depth + 1)
    }
  }
  walk(tree[0]?.children ?? [], 0)
  return out
}

interface CaptureData {
  url: string
  title: string
  favicon?: string
  folders: FolderOption[]
  folderId: string
  tags: string[]
  cloud: string[]
  existing?: chrome.bookmarks.BookmarkTreeNode
  existingFolder: string
}

/** null = no hay nada que guardar aquí (preview, chrome://, Web Store…). */
async function loadCapture(): Promise<CaptureData | null> {
  if (!IS_EXT || !chrome.tabs) return null
  chrome.runtime.connect({ name: CAPTURE_PORT })

  S.settings = normalizeSettings(await loadStore<AppSettings>('settings', SETTINGS_DEFAULTS))
  S.tagsMap = await loadTags()

  const tab = await resolveTargetTab()
  const url = tab?.url ?? ''
  if (!tab || !/^https?:/.test(url)) return null

  const tree = (await chrome.bookmarks.getTree()) as RawBookmarkNode[]
  const existing = (await chrome.bookmarks.search({ url }))[0]
  const parent = existing?.parentId ? (await chrome.bookmarks.get(existing.parentId))[0] : undefined
  const folders = flattenFolders(tree)

  return {
    url,
    title: existing?.title || tab.title || url,
    favicon: tab.favIconUrl,
    folders,
    folderId: existing?.parentId ?? suggestFolder(tree, url) ?? folders[0]?.id ?? '',
    tags: tagsOf(url),
    cloud: allTags()
      .slice(0, 10)
      .map(([tag]) => tag),
    existing,
    existingFolder: parent?.title ?? ''
  }
}

function CaptureForm(props: { data: CaptureData }): JSX.Element {
  const [title, setTitle] = createSignal(props.data.title)
  const [folderId, setFolderId] = createSignal(props.data.folderId)
  const [tagText, setTagText] = createSignal(props.data.tags.join(', '))
  const [saved, setSaved] = createSignal(false)
  let tagsInput: HTMLInputElement | undefined

  const toggleTag = (tag: string): void => {
    const cur = normTags(tagText())
    setTagText((cur.includes(tag) ? cur.filter(x => x !== tag) : [...cur, tag]).join(', '))
    tagsInput?.focus()
  }

  const save = (ev: Event): void => {
    ev.preventDefault()
    void (async () => {
      const { existing, url } = props.data
      const parentId = folderId()
      const name = title().trim() || url
      if (existing) {
        if (existing.parentId !== parentId) await chrome.bookmarks.move(existing.id, { parentId })
        if (existing.title !== name) await chrome.bookmarks.update(existing.id, { title: name })
      } else {
        await chrome.bookmarks.create({ parentId, title: name, url })
      }
      await writeTags(url, normTags(tagText()))
      setSaved(true)
      setTimeout(() => window.close(), CLOSE_DELAY_MS)
    })()
  }

  const remove = (): void => {
    void (async () => {
      const id = props.data.existing?.id
      if (id) await chrome.bookmarks.remove(id)
      window.close()
    })()
  }

  const submitLabel = (): string => {
    if (saved()) return t('popupDone')
    return props.data.existing ? t('popupUpdate') : t('popupSave')
  }

  return (
    <>
      <div id="tabinfo">
        <Show when={props.data.favicon}>{src => <img id="fav" alt="" src={src()} />}</Show>
        <div id="tabmeta">
          <input
            id="tabtitle"
            type="text"
            spellcheck={false}
            value={title()}
            onInput={e => setTitle(e.currentTarget.value)}
          />
          <div id="taburl">{props.data.url}</div>
        </div>
      </div>

      <form id="saveform" onSubmit={save}>
        <label>
          <span>{t('popupFolder')}</span>
          <select value={folderId()} onChange={e => setFolderId(e.currentTarget.value)}>
            <For each={props.data.folders}>
              {f => <option value={f.id}>{`${'  '.repeat(f.depth)}${f.title}`}</option>}
            </For>
          </select>
        </label>
        <label>
          <span>{t('popupTags')}</span>
          <input
            ref={tagsInput}
            type="text"
            autocomplete="off"
            spellcheck={false}
            placeholder={t('popupTagsPlaceholder')}
            value={tagText()}
            onInput={e => setTagText(e.currentTarget.value)}
          />
        </label>

        <div id="tagcloud">
          <For each={props.data.cloud}>
            {tag => (
              <button type="button" onClick={() => toggleTag(tag)}>
                #{tag}
              </button>
            )}
          </For>
        </div>

        <div id="statusrow">
          <Show when={props.data.existing}>
            <span id="savedmsg">{t('popupAlreadySaved', props.data.existingFolder)}</span>
            <button type="button" class="danger" onClick={remove}>
              {t('popupRemove')}
            </button>
          </Show>
          <button type="submit" class="primary">
            {submitLabel()}
          </button>
        </div>
      </form>
    </>
  )
}

function Popup(): JSX.Element {
  const [capture] = createResource(loadCapture)

  return (
    <>
      <header>
        <span id="brand">GraphMarks</span>
        <button type="button" onClick={() => void openGraph()}>
          {t('popupOpenGraph')}
        </button>
      </header>
      <main>
        <Show when={capture.error}>
          <p id="nosave">{t('popupError', (capture.error as Error)?.message ?? String(capture.error))}</p>
        </Show>
        <Show when={!capture.loading && !capture.error && !capture()}>
          <p id="nosave">{t('popupNoTab')}</p>
        </Show>
        <Show when={capture()}>{data => <CaptureForm data={data()} />}</Show>
      </main>
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root no encontrado')
render(() => <Popup />, root)
