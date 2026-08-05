import en from './locales/en.json'
import es from './locales/es.json'

export type MessageKey = keyof typeof es

const CATALOGS: Record<string, Record<string, string>> = { es, en }

/**
 * Idioma de la interfaz. Dentro de la extensión manda `chrome.i18n`, que ya
 * resuelve el idioma del navegador contra `_locales/`; en la preview
 * standalone se decide por `navigator.language`.
 */
function pickCatalog(): Record<string, string> {
  const lang = (
    typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : typeof navigator !== 'undefined'
        ? navigator.language
        : 'en'
  )
    .slice(0, 2)
    .toLowerCase()
  return CATALOGS[lang] ?? en
}

const fallback = pickCatalog()

function substitute(message: string, subs: Array<string | number>): string {
  return subs.reduce<string>((acc, value, i) => acc.replaceAll(`$${i + 1}`, String(value)), message)
}

/** Texto traducido con sustituciones posicionales ($1, $2…). */
export function t(key: MessageKey, ...subs: Array<string | number>): string {
  const own = fallback[key]
  return own ? substitute(own, subs) : key
}

/** Rellena `data-i18n` / `data-i18n-attr` del HTML estático. */
export function localizeDom(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MessageKey | undefined
    if (key) el.textContent = t(key)
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (el.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim())
      if (attr && key) el.setAttribute(attr, t(key as MessageKey))
    }
  }
}
