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

let root: HTMLDivElement | null = null
let spot: HTMLDivElement | null = null
let pop: HTMLDivElement | null = null
let steps: TourStep[] = []
let idx = 0
let onEnd: (() => void) | null = null
let repositionTimer: ReturnType<typeof setInterval> | undefined

export function isTourOpen(): boolean {
  return root !== null
}

function position(): void {
  if (!spot || !pop) return
  const target = steps[idx]?.target?.() ?? null
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

function render(): void {
  if (!pop) return
  const step = steps[idx]
  if (!step) return
  pop.replaceChildren()
  const h = document.createElement('h3')
  h.textContent = step.title
  const body = document.createElement('p')
  body.textContent = step.body
  const row = document.createElement('div')
  row.className = 'actions'
  const count = document.createElement('span')
  count.className = 'count'
  count.textContent = t('tourCount', idx + 1, steps.length)
  const skip = document.createElement('button')
  skip.type = 'button'
  skip.textContent = t('tourSkip')
  skip.addEventListener('click', () => endTour())
  const prev = document.createElement('button')
  prev.type = 'button'
  prev.textContent = t('tourPrev')
  prev.hidden = idx === 0
  prev.addEventListener('click', () => go(idx - 1))
  const next = document.createElement('button')
  next.type = 'button'
  next.className = 'primary'
  next.textContent = idx === steps.length - 1 ? (step.cta ?? t('tourNext')) : t('tourNext')
  next.addEventListener('click', () => (idx === steps.length - 1 ? endTour() : go(idx + 1)))
  row.append(count, skip, prev, next)
  pop.append(h, body, row)
  position()
}

function go(i: number): void {
  const next = Math.max(0, Math.min(i, steps.length - 1))
  if (next === idx) return
  idx = next
  steps[idx]?.onEnter?.()
  render()
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    endTour()
  } else if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
    ev.preventDefault()
    ev.stopPropagation()
    if (idx === steps.length - 1) endTour()
    else go(idx + 1)
  } else if (ev.key === 'ArrowLeft') {
    ev.preventDefault()
    ev.stopPropagation()
    go(idx - 1)
  } else if (ev.key.length === 1) {
    // que escribir bajo el velo no dispare el buscador
    ev.stopPropagation()
  }
}

export function endTour(): void {
  if (!root) return
  document.removeEventListener('keydown', onKey, true)
  removeEventListener('resize', position)
  clearInterval(repositionTimer)
  root.remove()
  root = null
  spot = null
  pop = null
  const done = onEnd
  onEnd = null
  done?.()
}

export function startTour(list: TourStep[], done: () => void): void {
  if (root || !list.length) return
  steps = list
  idx = 0
  onEnd = done
  root = document.createElement('div')
  root.id = 'tour'
  root.addEventListener('click', ev => ev.stopPropagation())
  spot = document.createElement('div')
  spot.className = 'spot'
  pop = document.createElement('div')
  pop.className = 'pop'
  root.append(spot, pop)
  document.body.appendChild(root)
  // captura: el tour se queda los atajos mientras está abierto
  document.addEventListener('keydown', onKey, true)
  // los nodos del grafo derivan con la física: reubicar el foco periódicamente
  repositionTimer = setInterval(position, 400)
  addEventListener('resize', position)
  steps[0]?.onEnter?.()
  render()
}
