import { t } from '../i18n'
import { normTags } from '../lib/tag-utils'
import type { DialogField, DialogSpec } from '../types'
import { dlg } from './dom'

type SubmitHandler = (values: Record<string, string>) => void

function buildInput(f: DialogField): HTMLInputElement | HTMLSelectElement {
  if (f.type === 'select') {
    const sel = document.createElement('select')
    for (const o of f.options ?? []) {
      const opt = document.createElement('option')
      opt.value = o.value
      opt.textContent = o.label
      if (o.value === f.value) opt.selected = true
      sel.appendChild(opt)
    }
    return sel
  }
  const inp = document.createElement('input')
  inp.type = f.type === 'tags' ? 'text' : (f.type ?? 'text')
  inp.value = f.value ?? ''
  if (f.placeholder) inp.placeholder = f.placeholder
  if (f.required) inp.required = true
  return inp
}

function buildTagCloud(f: DialogField, inp: HTMLInputElement | HTMLSelectElement): HTMLDivElement {
  const cloud = document.createElement('div')
  cloud.className = 'tagcloud'
  for (const [t, cnt] of f.cloud ?? []) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `#${t} ${cnt}`
    b.addEventListener('click', () => {
      const cur = normTags(inp.value)
      inp.value = (cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]).join(', ')
      inp.focus()
    })
    cloud.appendChild(b)
  }
  return cloud
}

export function openDialog(spec: DialogSpec, onSubmit: SubmitHandler): void {
  dlg.replaceChildren()
  const h = document.createElement('h3')
  h.textContent = spec.title
  dlg.appendChild(h)

  const form = document.createElement('form')
  form.method = 'dialog'
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {}

  for (const f of spec.fields ?? []) {
    const lab = document.createElement('label')
    lab.textContent = f.label
    const inp = buildInput(f)
    inp.name = f.name
    inputs[f.name] = inp
    lab.appendChild(inp)
    form.appendChild(lab)
    if (f.type === 'tags' && f.cloud?.length) form.appendChild(buildTagCloud(f, inp))
  }

  if (spec.note) {
    const p = document.createElement('p')
    p.className = 'note'
    p.textContent = spec.note
    form.appendChild(p)
  }

  const row = document.createElement('div')
  row.className = 'actions'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = t('dlgCancel')
  cancel.addEventListener('click', () => dlg.close())
  const ok = document.createElement('button')
  ok.type = 'submit'
  ok.className = spec.danger ? 'primary danger' : 'primary'
  ok.textContent = spec.submitLabel ?? t('dlgSave')
  row.append(cancel, ok)
  form.appendChild(row)

  form.addEventListener('submit', () => {
    const values: Record<string, string> = {}
    for (const [k, inp] of Object.entries(inputs)) values[k] = inp.value.trim()
    onSubmit(values)
  })
  dlg.appendChild(form)
  dlg.showModal()

  const first = form.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
  if (first) {
    first.focus()
    if (first instanceof HTMLInputElement) first.select()
  }
}
