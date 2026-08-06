import { For, type JSX, onMount, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { t } from '../i18n'
import { normTags } from '../lib/tag-utils'
import type { DialogField, DialogSpec } from '../types'
import { closeModal, renderModal } from './modal'

type SubmitHandler = (values: Record<string, string>) => void

/** El `for`/`id` los ata explícitamente: el input vive dentro de un `<Show>`. */
const fieldId = (field: DialogField): string => `dlg-${field.name}`

function SelectField(props: { field: DialogField; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <select
      id={fieldId(props.field)}
      name={props.field.name}
      value={props.value}
      onChange={e => props.onChange(e.currentTarget.value)}
    >
      <For each={props.field.options ?? []}>{o => <option value={o.value}>{o.label}</option>}</For>
    </select>
  )
}

function TextField(props: {
  field: DialogField
  value: string
  autofocus: boolean
  onChange: (v: string) => void
}): JSX.Element {
  let input: HTMLInputElement | undefined
  onMount(() => {
    if (!props.autofocus) return
    input?.focus()
    input?.select()
  })
  return (
    <input
      ref={input}
      id={fieldId(props.field)}
      name={props.field.name}
      type={props.field.type === 'tags' ? 'text' : (props.field.type ?? 'text')}
      placeholder={props.field.placeholder ?? ''}
      required={props.field.required ?? false}
      value={props.value}
      onInput={e => props.onChange(e.currentTarget.value)}
    />
  )
}

/** Nube de etiquetas: cada botón alterna la suya dentro del campo de texto. */
function TagCloud(props: { field: DialogField; value: string; onChange: (v: string) => void }): JSX.Element {
  const toggle = (tag: string): void => {
    const cur = normTags(props.value)
    props.onChange((cur.includes(tag) ? cur.filter(x => x !== tag) : [...cur, tag]).join(', '))
  }
  return (
    <div class="tagcloud">
      <For each={props.field.cloud ?? []}>
        {([tag, count]) => (
          <button type="button" onClick={() => toggle(tag)}>
            #{tag} {count}
          </button>
        )}
      </For>
    </div>
  )
}

function DialogBody(props: { spec: DialogSpec; onSubmit: SubmitHandler }): JSX.Element {
  const fields = props.spec.fields ?? []
  const [values, setValues] = createStore<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.name, f.value ?? '']))
  )

  const submit = (ev: Event): void => {
    ev.preventDefault()
    props.onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
    closeModal()
  }

  return (
    <>
      <h3>{props.spec.title}</h3>
      <form onSubmit={submit}>
        <For each={fields}>
          {(field, i) => (
            <>
              <label for={fieldId(field)}>
                {field.label}
                <Show
                  when={field.type === 'select'}
                  fallback={
                    <TextField
                      field={field}
                      value={values[field.name] ?? ''}
                      autofocus={i() === 0}
                      onChange={v => setValues(field.name, v)}
                    />
                  }
                >
                  <SelectField
                    field={field}
                    value={values[field.name] ?? ''}
                    onChange={v => setValues(field.name, v)}
                  />
                </Show>
              </label>
              <Show when={field.type === 'tags' && field.cloud?.length}>
                <TagCloud field={field} value={values[field.name] ?? ''} onChange={v => setValues(field.name, v)} />
              </Show>
            </>
          )}
        </For>

        <Show when={props.spec.note}>
          <p class="note">{props.spec.note}</p>
        </Show>

        <div class="actions">
          <button type="button" onClick={closeModal}>
            {t('dlgCancel')}
          </button>
          <button type="submit" class={props.spec.danger ? 'primary danger' : 'primary'}>
            {props.spec.submitLabel ?? t('dlgSave')}
          </button>
        </div>
      </form>
    </>
  )
}

export function openDialog(spec: DialogSpec, onSubmit: SubmitHandler): void {
  renderModal(() => <DialogBody spec={spec} onSubmit={onSubmit} />)
}
