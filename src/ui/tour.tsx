import { createSignal, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { t } from '../i18n'
import { placePopover, type Rect } from '../lib/tour-place'

/** Motor genérico de visita guiada: foco + popover + navegación. Los pasos son datos. */

export interface TourStep {
  title: string
  body: string
  /** Rect del objetivo en coordenadas de viewport; ausente = paso centrado. */
  target?: () => Rect | null
  /** Acción que el paso ejecuta sobre la app al mostrarse (la guía conduce). */
  onEnter?: () => void
  /** Etiqueta del botón de avance (el último paso suele querer una llamada a la acción). */
  cta?: string
}

const SPOT_PAD = 8
const REPOSITION_MS = 400

const [steps, setSteps] = createSignal<TourStep[]>([])
const [idx, setIdx] = createSignal(0)

let root: HTMLDivElement | null = null
let spot: HTMLDivElement | undefined
let pop: HTMLDivElement | undefined
let dispose: (() => void) | undefined
let onEnd: (() => void) | null = null
let repositionTimer: ReturnType<typeof setInterval> | undefined

export function isTourOpen(): boolean {
  return root !== null
}

/* El posicionamiento se queda imperativo a propósito: depende de medidas del
   DOM ya pintado (offsetWidth del popover) y del rect del nodo, que deriva con
   la física del grafo. No hay nada reactivo que modelar aquí. */
function position(): void {
  if (!spot || !pop) return
  const target = steps()[idx()]?.target?.() ?? null
  if (target) {
    spot.style.opacity = '1'
    spot.style.left = `${target.x - SPOT_PAD}px`
    spot.style.top = `${target.y - SPOT_PAD}px`
    spot.style.width = `${target.w + SPOT_PAD * 2}px`
    spot.style.height = `${target.h + SPOT_PAD * 2}px`
  } else {
    // sin objetivo: el foco se encoge a nada y solo queda el velo
    spot.style.opacity = '0'
    spot.style.left = `${innerWidth / 2}px`
    spot.style.top = `${innerHeight / 2}px`
    spot.style.width = '0px'
    spot.style.height = '0px'
  }
  const spotRect = target
    ? { x: target.x - SPOT_PAD, y: target.y - SPOT_PAD, w: target.w + SPOT_PAD * 2, h: target.h + SPOT_PAD * 2 }
    : null
  const at = placePopover(spotRect, { w: pop.offsetWidth, h: pop.offsetHeight }, { w: innerWidth, h: innerHeight })
  pop.style.left = `${at.x}px`
  pop.style.top = `${at.y}px`
}

function go(i: number): void {
  const next = Math.max(0, Math.min(i, steps().length - 1))
  if (next === idx()) return
  setIdx(next)
  steps()[next]?.onEnter?.()
  position()
}

const isLast = (): boolean => idx() === steps().length - 1

function onKey(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    endTour()
  } else if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
    ev.preventDefault()
    ev.stopPropagation()
    if (isLast()) endTour()
    else go(idx() + 1)
  } else if (ev.key === 'ArrowLeft') {
    ev.preventDefault()
    ev.stopPropagation()
    go(idx() - 1)
  } else if (ev.key.length === 1) {
    // que escribir bajo el velo no dispare el buscador
    ev.stopPropagation()
  }
}

function TourOverlay(): JSX.Element {
  const step = (): TourStep | undefined => steps()[idx()]
  return (
    <>
      <div class="spot" ref={spot} />
      <div class="pop" ref={pop}>
        <h3>{step()?.title ?? ''}</h3>
        <p>{step()?.body ?? ''}</p>
        <div class="actions">
          <span class="count">{t('tourCount', idx() + 1, steps().length)}</span>
          {/* on:click nativo: el root del tour corta la propagación para que
              nada atraviese el velo, y eso mataría los onClick delegados */}
          <button type="button" on:click={() => endTour()}>
            {t('tourSkip')}
          </button>
          <Show when={idx() > 0}>
            <button type="button" on:click={() => go(idx() - 1)}>
              {t('tourPrev')}
            </button>
          </Show>
          <button type="button" class="primary" on:click={() => (isLast() ? endTour() : go(idx() + 1))}>
            {isLast() ? (step()?.cta ?? t('tourNext')) : t('tourNext')}
          </button>
        </div>
      </div>
    </>
  )
}

export function endTour(): void {
  if (!root) return
  document.removeEventListener('keydown', onKey, true)
  removeEventListener('resize', position)
  clearInterval(repositionTimer)
  dispose?.()
  dispose = undefined
  root.remove()
  root = null
  spot = undefined
  pop = undefined
  const done = onEnd
  onEnd = null
  done?.()
}

export function startTour(list: TourStep[], done: () => void): void {
  if (root || !list.length) return
  setSteps(list)
  setIdx(0)
  onEnd = done
  root = document.createElement('div')
  root.id = 'tour'
  root.addEventListener('click', ev => ev.stopPropagation())
  document.body.appendChild(root)
  dispose = render(() => <TourOverlay />, root)
  // captura: el tour se queda los atajos mientras está abierto
  document.addEventListener('keydown', onKey, true)
  // los nodos del grafo derivan con la física: reubicar el foco periódicamente
  repositionTimer = setInterval(position, REPOSITION_MS)
  addEventListener('resize', position)
  list[0]?.onEnter?.()
  position()
}
