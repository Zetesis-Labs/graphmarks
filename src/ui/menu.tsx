import { createSignal, For, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import type { MenuItem } from '../types'
import { menuEl } from './dom'

const [items, setItems] = createSignal<MenuItem[]>([])

let justOpenedTime = 0

export function hideMenu(): void {
  menuEl.hidden = true
}

function Menu(): JSX.Element {
  return (
    <For each={items()}>
      {it => (
        <Show when={!it.sep} fallback={<div class="sep" />}>
          <button
            type="button"
            class={it.danger ? 'danger' : ''}
            onClick={() => {
              hideMenu()
              it.action?.()
            }}
          >
            {it.label ?? ''}
          </button>
        </Show>
      )}
    </For>
  )
}

export function showMenu(x: number, y: number, list: MenuItem[]): void {
  setItems(list)
  menuEl.hidden = false
  justOpenedTime = performance.now()
  // colocar exige medir después de pintar: es trabajo post-layout, no reactivo
  const r = menuEl.getBoundingClientRect()
  menuEl.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`
  menuEl.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`
}

export function installMenuDismiss(): void {
  render(() => <Menu />, menuEl)
  document.addEventListener('click', ev => {
    if (performance.now() - justOpenedTime < 50) return
    if (!menuEl.contains(ev.target as Node)) hideMenu()
  })
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hideMenu()
  })
}
