import type { findHit } from '../graph/hit'
import { t } from '../i18n'
import { S } from '../state'
import type { GraphNode } from '../types'
import { tooltip } from '../ui/dom'

interface TooltipContent {
  title: string
  sub: string
  tagLine: string
}

function bmTooltipContent(n: GraphNode): TooltipContent {
  let sub = n.url ?? ''
  if (n.history) {
    const visits = n.historyVisits ?? 1
    sub += `  ·  ${visits === 1 ? t('historyVisitOne') : t('historyVisits', visits)}`
    if (n.unsaved) sub += `  ·  ${t('historyUnsavedBadge')}`
  }
  const open = S.openTabs.get(n.id)
  if (open?.length) sub += `  ·  ${open.length === 1 ? t('tooltipOpenCountOne') : t('tooltipOpenCount', open.length)}`
  return { title: n.title, sub, tagLine: n.tags?.length ? n.tags.map(tag => `#${tag}`).join('  ') : '' }
}

function folderTooltipSub(n: GraphNode): string {
  const pref = n.raw ? S.folderPrefs[n.raw] : undefined
  if (pref?.subgraph && S.activeSubgraph !== n.raw) return t('tooltipOpenSubgraph', n.count ?? 0)
  if (n.collapsed) return t('tooltipExpandFolder', n.count ?? 0)
  return t('tooltipBookmarks', n.count ?? 0)
}

function tooltipContent(n: GraphNode, aux: ReturnType<typeof findHit>['aux']): TooltipContent {
  if (aux?.type === 'sat') return { title: aux.tab.title, sub: t('tooltipGoToTab'), tagLine: '' }
  if (aux?.type === 'back') return { title: t('menuBackToGraph'), sub: t('tooltipBackToGraph'), tagLine: '' }
  if (aux?.type === 'plus') return { title: t('tooltipOpenNewTab'), sub: n.url ?? '', tagLine: '' }
  if (n.type === 'bm') return bmTooltipContent(n)
  if (n.type === 'ghost') return { title: n.title, sub: n.url ?? '', tagLine: '' }
  return { title: n.title, sub: folderTooltipSub(n), tagLine: '' }
}

function placeTooltip(ev: MouseEvent): void {
  const pad = 14
  let x = ev.clientX + pad
  let y = ev.clientY + pad
  const r = tooltip.getBoundingClientRect()
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad
  tooltip.style.left = `${x}px`
  tooltip.style.top = `${y}px`
}

export function updateTooltip(ev: MouseEvent, n: GraphNode, aux: ReturnType<typeof findHit>['aux']): void {
  tooltip.hidden = false
  const { title, sub, tagLine } = tooltipContent(n, aux)
  const span = (cls: string, text: string): HTMLSpanElement => {
    const el = document.createElement('span')
    el.className = cls
    el.textContent = text
    return el
  }
  const tagsEl = span('tags', tagLine)
  tagsEl.style.display = tagLine ? '' : 'none'
  tooltip.replaceChildren(span('t', title), span('u', sub), tagsEl)
  placeTooltip(ev)
}
