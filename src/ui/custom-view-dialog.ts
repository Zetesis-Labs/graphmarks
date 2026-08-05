import { app } from '../bus'
import { t } from '../i18n'
import { GraphIndex } from '../lib/graph-index'
import { evaluateGraphQuery, parseGraphQuery } from '../lib/graph-query'
import { getQuerySuggestions } from '../lib/query-autocomplete'
import { saveStore } from '../lib/storage'
import { buildViews } from '../panels'
import { S } from '../state'
import type { CustomViewSpec } from '../types'
import { dlg } from './dom'

export function promptCustomViewDialog(existing?: CustomViewSpec): void {
  const isEdit = !!existing
  const spec: CustomViewSpec = existing ?? {
    id: `custom-${Date.now()}`,
    name: '',
    icon: '⭐',
    query: 'tag:dev'
  }

  dlg.replaceChildren()

  const titleEl = document.createElement('h3')
  titleEl.textContent = isEdit ? t('editCustomView') : t('newCustomView')

  const form = document.createElement('form')
  form.className = 'dlg-form'

  // Name field
  const nameLabel = document.createElement('label')
  nameLabel.textContent = t('customViewName')
  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.value = spec.name
  nameInput.placeholder = 'ej. Mis Proyectos'
  nameInput.required = true

  // Icon field
  const iconLabel = document.createElement('label')
  iconLabel.textContent = t('customViewIcon')
  const iconInput = document.createElement('input')
  iconInput.type = 'text'
  iconInput.value = spec.icon
  iconInput.style.width = '60px'

  // Query field
  const queryLabel = document.createElement('label')
  queryLabel.textContent = t('customViewQuery')
  const queryWrapper = document.createElement('div')
  queryWrapper.style.position = 'relative'

  const queryInput = document.createElement('input')
  queryInput.type = 'text'
  queryInput.value = spec.query
  queryInput.placeholder = 'tag:dev is:open visits:>5'
  queryInput.required = true
  queryInput.style.width = '100%'

  // Autocomplete suggestions box
  const sugBox = document.createElement('div')
  sugBox.className = 'query-sug-box'
  sugBox.style.cssText =
    'position:absolute;top:100%;left:0;right:0;background:var(--bg-surface,#1e1e24);border:1px solid rgba(255,255,255,0.15);border-radius:6px;max-height:160px;overflow-y:auto;z-index:99;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.4);'

  queryWrapper.append(queryInput, sugBox)

  // Preview element
  const previewEl = document.createElement('div')
  previewEl.className = 'dlg-note'
  previewEl.style.marginTop = '8px'

  function updatePreview(): void {
    const tempNodes = S.allBms.length ? S.allBms : S.nodes
    const index = new GraphIndex(tempNodes, [])
    const ast = parseGraphQuery(queryInput.value)
    const matches = evaluateGraphQuery(ast, index, S.openTabs, new Set(Object.keys(S.pinned)))
    previewEl.textContent = t('customViewPreview', matches.length)
  }

  function updateAutocomplete(): void {
    const text = queryInput.value
    const pos = queryInput.selectionStart ?? text.length
    const tags = Array.from(new Set(S.allBms.flatMap(n => n.tags ?? [])))
    const folders = Array.from(new Set(S.nodes.filter(n => n.type === 'folder').map(n => n.title)))
    const domains = Array.from(new Set(S.allBms.map(n => n.mHost).filter((h): h is string => !!h)))
    const sugs = getQuerySuggestions(text, pos, { tags, folders, domains })

    if (!sugs.length) {
      sugBox.style.display = 'none'
      return
    }

    sugBox.replaceChildren()
    sugs.forEach(s => {
      const item = document.createElement('div')
      item.style.cssText =
        'padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-color,#eee);'
      item.innerHTML = `<span>${s.icon ?? '🔍'}</span> <strong>${s.label}</strong> <span style="opacity:0.6;margin-left:auto;">${s.detail ?? ''}</span>`
      item.addEventListener('mousedown', ev => {
        ev.preventDefault()
        queryInput.value = s.replacement
        sugBox.style.display = 'none'
        updatePreview()
        queryInput.focus()
      })
      sugBox.appendChild(item)
    })
    sugBox.style.display = 'block'
  }

  queryInput.addEventListener('input', () => {
    updateAutocomplete()
    updatePreview()
  })
  queryInput.addEventListener('focus', () => updateAutocomplete())
  queryInput.addEventListener('blur', () => {
    setTimeout(() => {
      sugBox.style.display = 'none'
    }, 150)
  })

  // Action buttons
  const btns = document.createElement('div')
  btns.className = 'dlg-actions'

  const saveBtn = document.createElement('button')
  saveBtn.type = 'submit'
  saveBtn.className = 'btn primary'
  saveBtn.textContent = t('customViewSave')

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'btn'
  cancelBtn.textContent = 'Cancelar'
  cancelBtn.addEventListener('click', () => dlg.close())

  btns.append(saveBtn, cancelBtn)

  if (isEdit) {
    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'btn danger'
    delBtn.textContent = t('deleteCustomView')
    delBtn.style.marginRight = 'auto'
    delBtn.addEventListener('click', () => {
      S.customViews = S.customViews.filter(v => v.id !== spec.id)
      void saveStore('customViews', S.customViews)
      buildViews()
      dlg.close()
      if (S.viewMode === spec.id) {
        app.switchView('folders')
      }
    })
    btns.prepend(delBtn)
  }

  form.append(nameLabel, nameInput, iconLabel, iconInput, queryLabel, queryWrapper, previewEl, btns)

  form.addEventListener('submit', ev => {
    ev.preventDefault()
    spec.name = nameInput.value.trim() || 'Vista'
    spec.icon = iconInput.value.trim() || '⭐'
    spec.query = queryInput.value.trim()

    if (!isEdit) {
      S.customViews.push(spec)
    } else {
      const idx = S.customViews.findIndex(v => v.id === spec.id)
      if (idx >= 0) S.customViews[idx] = spec
    }

    void saveStore('customViews', S.customViews)
    buildViews()
    dlg.close()
    app.switchView(spec.id)
  })

  dlg.append(titleEl, form)
  dlg.showModal()
  updatePreview()
}
