import { type JSX, Show } from 'solid-js'
import { historyRangeLabel, historyRangeMenu, setHistoryRange, setHistoryUnsavedOnly } from '../history-view'
import { t } from '../i18n'
import { graphVersion, S } from '../state'
import { showMenu } from './menu'

/**
 * Chips de leyenda de la vista historial. Este módulo se carga con `lazy()`
 * desde `view-strategy` a propósito: importarlo estáticamente cerraría el
 * ciclo view-strategy → history-view → state → view-strategy.
 */
export default function HistoryLegend(): JSX.Element {
  // dependencia explícita del grafo: los contadores salen de S, que no es reactivo
  const unsavedCount = (): number => {
    graphVersion()
    return S.allBms.filter(n => n.unsaved).length
  }
  const rangeLabel = (): string => {
    graphVersion()
    return `◷ ${historyRangeLabel()} · ${S.allBms.length} ▾`
  }
  // historyRange e historyUnsavedOnly son reactivos: sin graphVersion
  const isCustom = (): boolean => S.historyRange.preset === 'custom'
  const unsavedOnly = (): boolean => S.historyUnsavedOnly

  const openRangeMenu = (ev: MouseEvent): void => {
    ev.stopPropagation()
    const target = ev.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    showMenu(rect.left, rect.bottom + 6, historyRangeMenu(), target)
  }

  return (
    <>
      <button type="button" class="chip active" title={t('historyRangeTitle')} onClick={openRangeMenu}>
        {rangeLabel()}
      </button>

      <Show when={isCustom()}>
        <button
          type="button"
          class="chip"
          title={t('historyClearFilter')}
          onClick={() => void setHistoryRange({ preset: '24h' })}
        >
          ✕
        </button>
      </Show>

      <Show when={unsavedCount() || unsavedOnly()}>
        <button
          type="button"
          class={unsavedOnly() ? 'chip active' : 'chip'}
          title={t('historyUnsavedTitle')}
          onClick={() => void setHistoryUnsavedOnly(!S.historyUnsavedOnly)}
        >
          ☆ {t('historyUnsavedChip')} · {unsavedCount()}
        </button>
      </Show>
    </>
  )
}
