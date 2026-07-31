import type { MenuItem } from '../types'
import { menuEl } from './dom'

export function hideMenu(): void {
  menuEl.hidden = true
}

export function showMenu(x: number, y: number, items: MenuItem[]): void {
  menuEl.innerHTML = ''
  for (const it of items) {
    if (it.sep) {
      const hr = document.createElement('div')
      hr.className = 'sep'
      menuEl.appendChild(hr)
      continue
    }
    const b = document.createElement('button')
    b.textContent = it.label ?? ''
    if (it.danger) b.classList.add('danger')
    b.addEventListener('click', () => {
      hideMenu()
      it.action?.()
    })
    menuEl.appendChild(b)
  }
  menuEl.hidden = false
  const r = menuEl.getBoundingClientRect()
  menuEl.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`
  menuEl.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`
}

export function installMenuDismiss(): void {
  document.addEventListener('click', ev => {
    if (!menuEl.contains(ev.target as Node)) hideMenu()
  })
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hideMenu()
  })
}
