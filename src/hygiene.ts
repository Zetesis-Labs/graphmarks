import { api, loadTree, safeOp } from './bookmarks'
import { t } from './i18n'
import { analyzeHygiene, duplicateRemovals, type HygieneItem, type HygieneReport } from './lib/hygiene'
import { short } from './lib/utils'
import { dlg } from './ui/dom'
import { toast } from './ui/toast'

/** Filas visibles por sección; el resto se resume para no inflar el DOM. */
const LIST_CAP = 40

function removeItems(items: HygieneItem[], asTree: boolean): void {
  void safeOp(async () => {
    for (const it of items) await (asTree ? api.removeTree(it.id) : api.remove(it.id))
    toast(t('toastHygieneRemoved', items.length), () =>
      safeOp(async () => {
        // recrear por índice ascendente conserva las posiciones originales
        for (const it of [...items].sort((a, b) => a.index - b.index)) {
          await api.create({ parentId: it.parentId, title: it.title, url: it.url, index: it.index })
        }
      })
    )
    render(analyzeHygiene(await loadTree()))
  })
}

function buildSection(
  headText: string,
  items: HygieneItem[],
  actionLabel: string,
  onAction: () => void
): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'opt-group'
  const head = document.createElement('div')
  head.className = 'opt-head'
  head.textContent = headText
  const list = document.createElement('div')
  list.className = 'hyg-list'
  for (const it of items.slice(0, LIST_CAP)) {
    const row = document.createElement('div')
    row.className = 'hyg-row'
    const title = document.createElement('span')
    title.textContent = short(it.title)
    const path = document.createElement('span')
    path.className = 'hyg-path'
    path.textContent = it.path
    row.append(title, path)
    list.appendChild(row)
  }
  if (items.length > LIST_CAP) {
    const more = document.createElement('div')
    more.className = 'hyg-row hyg-path'
    more.textContent = t('hygMore', items.length - LIST_CAP)
    list.appendChild(more)
  }
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'opt-btn danger'
  btn.textContent = actionLabel
  btn.addEventListener('click', onAction)
  wrap.append(head, list, btn)
  return wrap
}

function render(report: HygieneReport): void {
  dlg.className = 'wide'
  dlg.replaceChildren()
  const h = document.createElement('h3')
  h.textContent = t('dlgHygiene')
  dlg.appendChild(h)

  const removals = duplicateRemovals(report)
  const sections: HTMLDivElement[] = []
  if (removals.length) {
    sections.push(
      buildSection(
        t('hygDuplicates', report.duplicates.length),
        removals,
        t('hygRemoveDuplicates', removals.length),
        () => removeItems(removals, false)
      )
    )
  }
  if (report.emptyFolders.length) {
    sections.push(
      buildSection(
        t('hygEmptyFolders', report.emptyFolders.length),
        report.emptyFolders,
        t('hygRemoveEmpty', report.emptyFolders.length),
        () => removeItems(report.emptyFolders, true)
      )
    )
  }
  if (report.invisible.length) {
    sections.push(
      buildSection(
        t('hygInvisible', report.invisible.length),
        report.invisible,
        t('hygRemoveInvisible', report.invisible.length),
        () => removeItems(report.invisible, false)
      )
    )
  }

  if (!sections.length) {
    const p = document.createElement('p')
    p.className = 'note'
    p.textContent = t('hygClean')
    dlg.appendChild(p)
  } else {
    for (const s of sections) dlg.appendChild(s)
  }

  const row = document.createElement('div')
  row.className = 'actions'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'primary'
  close.textContent = t('dlgClose')
  close.addEventListener('click', () => dlg.close())
  row.appendChild(close)
  dlg.appendChild(row)
  if (!dlg.open) dlg.showModal()
}

export function openHygieneDialog(): void {
  void (async () => {
    render(analyzeHygiene(await loadTree()))
  })()
}
