import { toastEl } from './dom'

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Aviso efímero; con `actionFn` añade un botón (deshacer, conceder…). */
export function toast(msg: string, actionFn?: (() => void) | null, btnLabel = 'Deshacer'): void {
  toastEl.innerHTML = ''
  const span = document.createElement('span')
  span.textContent = msg
  toastEl.appendChild(span)
  if (actionFn) {
    const b = document.createElement('button')
    b.textContent = btnLabel
    b.addEventListener('click', () => {
      toastEl.hidden = true
      actionFn()
    })
    toastEl.appendChild(b)
  }
  toastEl.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastEl.hidden = true
  }, 6000)
}
