import { t } from '../i18n'

/** Referencias tipadas al DOM estático de newtab.html. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Elemento #${id} no encontrado`)
  return node as T
}

export const canvas = el<HTMLCanvasElement>('graph')
const context = canvas.getContext('2d')
if (!context) throw new Error('Canvas 2D no disponible')
export const ctx = context

export const tooltip = el<HTMLDivElement>('tooltip')
export const searchBox = el<HTMLInputElement>('search')
export const resultsEl = el<HTMLUListElement>('results')
export const legendEl = el<HTMLElement>('legend')
export const listPanel = el<HTMLElement>('list-panel')
export const listToggle = el<HTMLButtonElement>('list-toggle')
export const emptyEl = el<HTMLDivElement>('empty')
export const menuEl = el<HTMLDivElement>('ctxmenu')
export const dlg = el<HTMLDialogElement>('dlg')
export const toastEl = el<HTMLDivElement>('toast')
export const viewsEl = el<HTMLElement>('views')
export const tabcountEl = el<HTMLButtonElement>('tabcount')
export const winchipEl = el<HTMLButtonElement>('winchip')
export const sessionsEl = el<HTMLButtonElement>('sessions')

export function showFatal(msg: string): void {
  emptyEl.hidden = false
  const h = document.createElement('h2')
  h.textContent = t('fatalTitle')
  const p = document.createElement('p')
  p.textContent = msg
  emptyEl.replaceChildren(h, p)
}

export function installErrorSurface(): void {
  window.addEventListener('error', ev => showFatal(ev.message || 'error desconocido'))
  window.addEventListener('unhandledrejection', ev => {
    const reason = ev.reason as { message?: string } | undefined
    showFatal(String(reason?.message ?? ev.reason ?? 'promesa rechazada'))
  })
}
