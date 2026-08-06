import { IS_EXT } from './env'
import { focusOrOpenGraph } from './graph-tab'
import { localizeDom, t } from './i18n'
import { suggestFolder } from './lib/folder-suggest'
import { type AppSettings, normalizeSettings, SETTINGS_DEFAULTS } from './lib/settings-shape'
import { loadStore } from './lib/storage'
import { normTags } from './lib/tag-utils'
import { S } from './state'
import { allTags, loadTags, setTags, tagsOf } from './tags'
import type { RawBookmarkNode } from './types'

/* Popup de captura: guarda la pestaña actual sin abrir el grafo. Es una
   página propia — no comparte el DOM de newtab, así que no usa ui/dom. */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Elemento #${id} no encontrado`)
  return node as T
}

const tabinfoEl = el<HTMLDivElement>('tabinfo')
const favEl = el<HTMLImageElement>('fav')
const titleEl = el<HTMLInputElement>('tabtitle')
const urlEl = el<HTMLDivElement>('taburl')
const formEl = el<HTMLFormElement>('saveform')
const folderEl = el<HTMLSelectElement>('folder')
const tagsEl = el<HTMLInputElement>('tags')
const cloudEl = el<HTMLDivElement>('tagcloud')
const savedMsgEl = el<HTMLSpanElement>('savedmsg')
const removeEl = el<HTMLButtonElement>('remove')
const saveEl = el<HTMLButtonElement>('save')
const nosaveEl = el<HTMLParagraphElement>('nosave')

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

function fillFolderSelect(tree: RawBookmarkNode[], selectedId: string | null): void {
  folderEl.replaceChildren()
  const add = (items: RawBookmarkNode[], depth: number): void => {
    for (const it of items) {
      if (it.url) continue
      const opt = document.createElement('option')
      opt.value = it.id
      opt.textContent = `${'  '.repeat(depth)}${it.title || t('folderUnnamed')}`
      if (it.id === selectedId) opt.selected = true
      folderEl.appendChild(opt)
      add(it.children ?? [], depth + 1)
    }
  }
  add(tree[0]?.children ?? [], 0)
}

function fillTagCloud(): void {
  cloudEl.replaceChildren()
  for (const [tag] of allTags().slice(0, 10)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `#${tag}`
    b.addEventListener('click', () => {
      const cur = normTags(tagsEl.value)
      tagsEl.value = (cur.includes(tag) ? cur.filter(x => x !== tag) : [...cur, tag]).join(', ')
      tagsEl.focus()
    })
    cloudEl.appendChild(b)
  }
}

function showSavedState(folderTitle: string): void {
  savedMsgEl.textContent = t('popupAlreadySaved', folderTitle)
  savedMsgEl.hidden = false
  removeEl.hidden = false
  saveEl.textContent = t('popupUpdate')
}

async function init(): Promise<void> {
  localizeDom()
  el<HTMLButtonElement>('open-graph').addEventListener('click', () => void openGraph())
  if (!IS_EXT || !chrome.tabs) {
    nosaveEl.hidden = false
    return
  }

  // el service worker escucha el cierre de este puerto para devolver el botón
  // a su comportamiento cuando la captura se abrió por atajo o menú
  chrome.runtime.connect({ name: 'capture-popup' })

  S.settings = normalizeSettings(await loadStore<AppSettings>('settings', SETTINGS_DEFAULTS))
  S.tagsMap = await loadTags()

  const tab = await resolveTargetTab()
  const url = tab?.url ?? ''
  if (!tab || !/^https?:/.test(url)) {
    nosaveEl.hidden = false
    return
  }

  tabinfoEl.hidden = false
  formEl.hidden = false
  titleEl.value = tab.title ?? url
  urlEl.textContent = url
  if (tab.favIconUrl) {
    favEl.src = tab.favIconUrl
    favEl.hidden = false
  }

  const tree = (await chrome.bookmarks.getTree()) as RawBookmarkNode[]
  const existing = (await chrome.bookmarks.search({ url }))[0]
  const suggested = existing?.parentId ?? suggestFolder(tree, url)
  fillFolderSelect(tree, suggested ?? null)
  tagsEl.value = tagsOf(url).join(', ')
  fillTagCloud()

  if (existing) {
    const parent = existing.parentId ? (await chrome.bookmarks.get(existing.parentId))[0] : undefined
    showSavedState(parent?.title ?? '')
    if (existing.title) titleEl.value = existing.title
  }

  removeEl.addEventListener('click', () => {
    void (async () => {
      if (existing) await chrome.bookmarks.remove(existing.id)
      window.close()
    })()
  })

  formEl.addEventListener('submit', ev => {
    ev.preventDefault()
    void (async () => {
      const parentId = folderEl.value
      const title = titleEl.value.trim() || url
      if (existing) {
        if (existing.parentId !== parentId) await chrome.bookmarks.move(existing.id, { parentId })
        if (existing.title !== title) await chrome.bookmarks.update(existing.id, { title })
      } else {
        await chrome.bookmarks.create({ parentId, title, url })
      }
      await setTags(url, normTags(tagsEl.value))
      saveEl.textContent = t('popupDone')
      setTimeout(() => window.close(), 450)
    })()
  })

  tagsEl.focus()
}

/* Un fallo aquí dejaría la ventana en blanco (todo nace oculto y lo muestra el
   script): mejor un mensaje visible que un popup mudo. */
void init().catch((err: unknown) => {
  nosaveEl.hidden = false
  nosaveEl.textContent = t('popupError', (err as Error)?.message ?? String(err))
})
