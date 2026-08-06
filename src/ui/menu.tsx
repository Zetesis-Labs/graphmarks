import { createSignal, For, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import type { MenuItem } from '../types'
import { menuEl } from './dom'

const [items, setItems] = createSignal<MenuItem[]>([])

let activeTriggerEl: HTMLElement | null = null

export function hideMenu(): void {
  menuEl.hidden = true
  activeTriggerEl = null
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

export function showMenu(x: number, y: number, list: MenuItem[], triggerEl?: HTMLElement | null): void {
  activeTriggerEl = triggerEl ?? null
  setItems(list)
  menuEl.hidden = false
  // colocar exige medir después de pintar: es trabajo post-layout, no reactivo
  const r = menuEl.getBoundingClientRect()
  menuEl.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`
  menuEl.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`
}

export function installMenuDismiss(): void {
  render(() => <Menu />, menuEl)
  document.addEventListener('click', ev => {
    const target = ev.target as Node
    if (menuEl.contains(target) || activeTriggerEl?.contains(target)) {
      return
    }
    hideMenu()
  })
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hideMenu()
  })
}
