import { createResource, For, type JSX, Show } from 'solid-js'
import { api, loadTree, safeOp } from './bookmarks'
import type { MessageKey } from './i18n'
import { t } from './i18n'
import { analyzeHygiene, duplicateRemovals, type HygieneItem, type HygieneReport } from './lib/hygiene'
import { short } from './lib/utils'
import { closeModal, renderModal } from './ui/modal'
import { toast } from './ui/toast'

/** Filas visibles por sección; el resto se resume para no inflar el DOM. */
const LIST_CAP = 40

interface Section {
  headKey: MessageKey
  headCount: number
  items: HygieneItem[]
  actionKey: MessageKey
  asTree: boolean
}

function sectionsOf(report: HygieneReport): Section[] {
  const removals = duplicateRemovals(report)
  const all: Section[] = [
    {
      headKey: 'hygDuplicates',
      headCount: report.duplicates.length,
      items: removals,
      actionKey: 'hygRemoveDuplicates',
      asTree: false
    },
    {
      headKey: 'hygEmptyFolders',
      headCount: report.emptyFolders.length,
      items: report.emptyFolders,
      actionKey: 'hygRemoveEmpty',
      asTree: true
    },
    {
      headKey: 'hygInvisible',
      headCount: report.invisible.length,
      items: report.invisible,
      actionKey: 'hygRemoveInvisible',
      asTree: false
    }
  ]
  return all.filter(s => s.items.length > 0)
}

function HygieneSection(props: { section: Section; onDone: () => void }): JSX.Element {
  const remove = (): void => {
    const { items, asTree } = props.section
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
      props.onDone()
    })
  }

  return (
    <div class="opt-group">
      <div class="opt-head">{t(props.section.headKey, props.section.headCount)}</div>
      <div class="hyg-list">
        <For each={props.section.items.slice(0, LIST_CAP)}>
          {it => (
            <div class="hyg-row">
              <span>{short(it.title)}</span>
              <span class="hyg-path">{it.path}</span>
            </div>
          )}
        </For>
        <Show when={props.section.items.length > LIST_CAP}>
          <div class="hyg-row hyg-path">{t('hygMore', props.section.items.length - LIST_CAP)}</div>
        </Show>
      </div>
      <button type="button" class="opt-btn danger" onClick={remove}>
        {t(props.section.actionKey, props.section.items.length)}
      </button>
    </div>
  )
}

function HygienePanel(): JSX.Element {
  const [report, { refetch }] = createResource(async () => analyzeHygiene(await loadTree()))
  const sections = (): Section[] => {
    const r = report()
    return r ? sectionsOf(r) : []
  }

  return (
    <>
      <h3>{t('dlgHygiene')}</h3>
      <Show when={report() && !sections().length}>
        <p class="note">{t('hygClean')}</p>
      </Show>
      <For each={sections()}>{section => <HygieneSection section={section} onDone={() => void refetch()} />}</For>
      <div class="actions">
        <button type="button" class="primary" onClick={closeModal}>
          {t('dlgClose')}
        </button>
      </div>
    </>
  )
}

export function openHygieneDialog(): void {
  renderModal(() => <HygienePanel />, 'wide')
}
