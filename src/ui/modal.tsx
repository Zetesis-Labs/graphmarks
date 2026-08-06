import type { JSX } from 'solid-js'
import { render } from 'solid-js/web'
import { dlg } from './dom'

/**
 * Host del `<dialog>` compartido. Todos los modales viven en el mismo elemento,
 * así que montar uno desmonta el anterior: `dispose()` de Solid libera el
 * ámbito reactivo y vacía el contenedor.
 */

let dispose: (() => void) | undefined

export function renderModal(component: () => JSX.Element, className = ''): void {
  dispose?.()
  dlg.className = className
  dlg.replaceChildren()
  dispose = render(component, dlg)
  if (!dlg.open) dlg.showModal()
}

export function closeModal(): void {
  dlg.close()
}

dlg.addEventListener('close', () => {
  dispose?.()
  dispose = undefined
})
