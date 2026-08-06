import { createEffect, type JSX } from 'solid-js'
import { render } from 'solid-js/web'
import { graphVersion, S } from '../state'
import { emptyEl } from './dom'

/** Estado vacío del grafo: mensaje según la vista, visible solo sin marcadores. */
function EmptyState(): JSX.Element {
  const msg = (): { title: string; body: string } => {
    graphVersion()
    return S.strategy.emptyMessage()
  }
  // el atributo hidden vive en el host estático: efecto dentro de esta raíz
  createEffect(() => {
    graphVersion()
    emptyEl.hidden = S.nodes.some(n => n.type === 'bm')
  })
  return (
    <>
      <h2>{msg().title}</h2>
      <p>{msg().body}</p>
    </>
  )
}

export function initEmptyState(): void {
  render(() => <EmptyState />, emptyEl)
}
