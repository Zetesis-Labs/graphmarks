import { createSignal, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { t } from '../i18n'
import { toastEl } from './dom'

const VISIBLE_MS = 6000

interface ToastState {
  msg: string
  action?: (() => void) | null
  btnLabel: string
}

const [state, setState] = createSignal<ToastState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let mounted = false

function Toast(): JSX.Element {
  return (
    <Show when={state()}>
      {s => (
        <>
          <span>{s().msg}</span>
          <Show when={s().action}>
            {run => (
              <button
                type="button"
                onClick={() => {
                  toastEl.hidden = true
                  run()()
                }}
              >
                {s().btnLabel}
              </button>
            )}
          </Show>
        </>
      )}
    </Show>
  )
}

/** Aviso efímero; con `actionFn` añade un botón (deshacer, conceder…). */
export function toast(msg: string, actionFn?: (() => void) | null, btnLabel = t('toastUndo')): void {
  if (!mounted) {
    render(() => <Toast />, toastEl)
    mounted = true
  }
  setState({ msg, action: actionFn ?? null, btnLabel })
  toastEl.hidden = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    toastEl.hidden = true
  }, VISIBLE_MS)
}
