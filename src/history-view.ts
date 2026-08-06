import { activePort, type PortHistoryPage, type PortVisit } from './browser-port'
import { app } from './bus'
import { MAX_SLOTS } from './constants'
import { loadFavicon } from './graph/build'
import { type ResolvedHistoryRange, resolveHistoryRange } from './history-range'
import { sessionLabel, splitSessions, type VisitEvent } from './history-sessions'
import { t } from './i18n'
import { bookmarkUrlKeys } from './lib/graph-shape'
import { saveStore } from './lib/storage'
import { canonicalUrl, domainKey, normPath } from './lib/utils'
import { S } from './state'
import { tagsOf } from './tags'
import type { Cluster, GraphNode, HistoryGrouping, HistoryRange, HistoryRangePreset, MenuItem } from './types'
import { openDialog } from './ui/dialog'
import { toast } from './ui/toast'

interface PageVisits {
  page: PortHistoryPage
  visits: PortVisit[]
}

interface HistoryNodeRecord {
  record: PageVisits
  node: GraphNode
}

/* chrome.history.search devuelve 100 resultados si no se pide otra cosa; el
   máximo que acepta es el int de 32 bits del lado nativo. El corte real lo
   pone la retención de Chrome (90 días de historial). */
const SEARCH_MAX_RESULTS = 2_147_483_647
const VISIT_CONCURRENCY = 12
const CACHE_MS = 60_000

let cache: { key: string; ts: number; pages: PageVisits[] } | null = null
let buildGeneration = 0

export function invalidateHistoryGraph(): void {
  cache = null
}

function rangeCacheKey(range: HistoryRange): string {
  return range.preset === 'custom' ? `custom:${range.start ?? 0}:${range.end ?? 0}` : range.preset
}

async function concurrentMap<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length)
  let next = 0
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      const item = items[i]
      if (item !== undefined) result[i] = await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(VISIT_CONCURRENCY, items.length) }, run))
  return result
}

async function queryHistory(range: ResolvedHistoryRange): Promise<PageVisits[]> {
  const port = activePort()
  const pages = await port.historySearch(range.start, range.end, SEARCH_MAX_RESULTS)
  const valid = pages.filter(page => /^https?:/.test(page.url ?? ''))
  return concurrentMap(valid, async page => {
    const visits = await port.historyVisits(page.url ?? '', range.start, range.end)
    return {
      page,
      visits: visits.filter(v => (v.visitTime ?? 0) >= range.start && (v.visitTime ?? 0) <= range.end)
    }
  })
}

/** Funde variantes de la misma página (trackers, orden de parámetros, fragmento). */
function dedupePages(pages: PageVisits[]): PageVisits[] {
  const byKey = new Map<string, PageVisits>()
  for (const rec of pages) {
    const key = canonicalUrl(rec.page.url ?? '')
    const prev = byKey.get(key)
    if (!prev) byKey.set(key, { page: rec.page, visits: [...rec.visits] })
    else {
      prev.visits.push(...rec.visits)
      if ((rec.page.lastVisitTime ?? 0) > (prev.page.lastVisitTime ?? 0)) prev.page = rec.page
    }
  }
  return [...byKey.values()]
}

async function historyPages(range: ResolvedHistoryRange): Promise<PageVisits[]> {
  const key = rangeCacheKey(S.historyRange)
  if (cache && cache.key === key && Date.now() - cache.ts < CACHE_MS) return cache.pages
  const pages = await queryHistory(range)
  cache = { key, ts: Date.now(), pages }
  return pages
}

function historyNode(record: PageVisits, maxVisits: number): GraphNode | null {
  const url = record.page.url ?? ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const visits = Math.max(1, record.visits.length)
  const host = parsed.host.toLowerCase()
  return {
    id: `hist:${record.page.id}`,
    type: 'bm',
    title: record.page.title || parsed.hostname || url,
    url,
    host: parsed.host,
    mHost: host,
    mPath: normPath(parsed.pathname),
    tags: tagsOf(url),
    history: true,
    historyVisits: visits,
    lastVisitTime: Math.max(...record.visits.map(v => v.visitTime ?? 0), record.page.lastVisitTime ?? 0),
    heat: Math.max(0.15, Math.log1p(visits) / Math.log1p(Math.max(2, maxVisits)))
  }
}

function rebuildHistoryNeighbors(): void {
  S.neighbors = new Map(S.nodes.map(n => [n.id, new Set<string>()]))
  for (const l of S.links) {
    const source = typeof l.source === 'object' ? l.source.id : l.source
    const target = typeof l.target === 'object' ? l.target.id : l.target
    S.neighbors.get(source)?.add(target)
    S.neighbors.get(target)?.add(source)
  }
}

function resetHistoryState(): void {
  S.nodes = []
  S.links = []
  S.byId = new Map()
  S.clusterOf = new Map()
  S.clusters = []
}

function makeHistoryRecords(pages: PageVisits[]): HistoryNodeRecord[] {
  const maxVisits = Math.max(1, ...pages.map(record => record.visits.length))
  const records: HistoryNodeRecord[] = []
  for (const record of pages) {
    const node = historyNode(record, maxVisits)
    if (node) records.push({ record, node })
  }
  return records
}

function addHistoryPages(records: HistoryNodeRecord[]): Map<string, GraphNode[]> {
  const byDomain = new Map<string, GraphNode[]>()
  for (const { node } of records) {
    const domain = domainKey(node.mHost ?? '')
    const clusterId = `hist-domain:${domain}`
    node.cluster = clusterId
    node.parentId = clusterId
    node.hubs = [clusterId]
    S.nodes.push(node)
    S.byId.set(node.id, node)
    if (!byDomain.has(domain)) byDomain.set(domain, [])
    byDomain.get(domain)?.push(node)
    loadFavicon(node.url ?? '')
  }
  return byDomain
}

function addHistoryDomains(byDomain: Map<string, GraphNode[]>): void {
  const sortedDomains = [...byDomain].sort((a, b) => b[1].length - a[1].length)
  for (const [index, [domain, nodes]] of sortedDomains.entries()) {
    const id = `hist-domain:${domain}`
    const hub: GraphNode = {
      id,
      type: 'folder',
      subtype: 'domain',
      title: domain,
      count: nodes.length,
      cluster: id,
      parentId: null
    }
    S.nodes.push(hub)
    S.byId.set(id, hub)
    const cluster: Cluster = { id, title: domain, count: nodes.length, slot: index < MAX_SLOTS ? index : -1 }
    S.clusters.push(cluster)
    S.clusterOf.set(id, cluster)
    for (const node of nodes) S.links.push({ source: id, target: node.id, type: 'tree' })
  }
}

function addHistoryTransitions(records: HistoryNodeRecord[]): void {
  const nodeByHistoryId = new Map(records.map(({ record, node }) => [record.page.id, node.id]))
  const nodeByVisitId = new Map<string, string>()
  for (const { record, node } of records) {
    for (const visit of record.visits) nodeByVisitId.set(visit.visitId, node.id)
  }
  const transitions = new Set<string>()
  for (const { record, node } of records) {
    for (const visit of record.visits) {
      const source = nodeByVisitId.get(visit.referringVisitId)
      if (!source || source === node.id) continue
      const key = `${source}\u0000${node.id}`
      if (transitions.has(key)) continue
      transitions.add(key)
      S.links.push({ source, target: nodeByHistoryId.get(record.page.id) ?? node.id, type: 'history' })
    }
  }
}

/** Agrupación alternativa: cada sesión de navegación (huecos > 30 min) es un hub. */
function addHistorySessions(records: HistoryNodeRecord[]): void {
  const events: VisitEvent[] = []
  for (const { record, node } of records) {
    const times = record.visits.map(v => v.visitTime ?? 0).filter(time => time > 0)
    if (!times.length && node.lastVisitTime) times.push(node.lastVisitTime)
    for (const time of times) events.push({ id: node.id, time })
  }
  const sessions = splitSessions(events)
  const primary = new Map<string, string>()
  const membership = new Map<string, string[]>()
  sessions.forEach((s, i) => {
    const hid = `hist-session:${i}`
    for (const id of s.ids) {
      primary.set(id, hid)
      const hubs = membership.get(id)
      if (hubs) hubs.push(hid)
      else membership.set(id, [hid])
    }
  })
  for (const { node } of records) {
    node.hubs = membership.get(node.id) ?? []
    node.cluster = primary.get(node.id)
    node.parentId = primary.get(node.id) ?? null
    S.nodes.push(node)
    S.byId.set(node.id, node)
    loadFavicon(node.url ?? '')
  }
  sessions.forEach((s, i) => {
    const hid = `hist-session:${i}`
    const hub: GraphNode = {
      id: hid,
      type: 'folder',
      subtype: 'domain',
      title: sessionLabel(s.start, s.end),
      count: s.ids.length,
      cluster: hid,
      parentId: null
    }
    S.nodes.push(hub)
    S.byId.set(hid, hub)
    // los slots de color van a las sesiones más recientes
    const slot = sessions.length - 1 - i
    const cluster: Cluster = { id: hid, title: hub.title, count: s.ids.length, slot: slot < MAX_SLOTS ? slot : -1 }
    S.clusters.push(cluster)
    S.clusterOf.set(hid, cluster)
    for (const id of s.ids) S.links.push({ source: hid, target: id, type: 'tree' })
  })
  S.clusters.reverse()
}

/** Triaje: fuera dominios silenciados, marca lo no guardado y aplica el filtro. */
function triageRecords(records: HistoryNodeRecord[]): HistoryNodeRecord[] {
  const saved = bookmarkUrlKeys(S.lastTree)
  const kept = records.filter(r => !S.historyMuted.has(domainKey(r.node.mHost ?? '')))
  for (const { node } of kept) node.unsaved = !saved.has(canonicalUrl(node.url ?? ''))
  return S.historyUnsavedOnly ? kept.filter(r => r.node.unsaved) : kept
}

/** Construye nodos URL, hubs (dominio o sesión) y aristas de navegación reales. */
export async function buildHistoryGraph(): Promise<boolean> {
  const generation = ++buildGeneration
  const pages = await historyPages(resolveHistoryRange(S.historyRange))
  if (generation !== buildGeneration || S.viewMode !== 'history') return false
  const records = triageRecords(makeHistoryRecords(dedupePages(pages)))
  resetHistoryState()
  if (S.historyGrouping === 'session') addHistorySessions(records)
  else addHistoryDomains(addHistoryPages(records))
  addHistoryTransitions(records)
  rebuildHistoryNeighbors()
  return true
}

function presetLabel(preset: HistoryRangePreset): string {
  if (preset === '1h') return t('historyRange1h')
  if (preset === 'today') return t('historyRangeToday')
  if (preset === '7d') return t('historyRange7d')
  if (preset === '30d') return t('historyRange30d')
  return t('historyRange24h')
}

export function historyRangeLabel(): string {
  if (S.historyRange.preset !== 'custom') return presetLabel(S.historyRange.preset)
  const { start, end } = resolveHistoryRange(S.historyRange)
  const fmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

export async function setHistoryRange(range: HistoryRange): Promise<void> {
  S.historyRange = range
  invalidateHistoryGraph()
  await saveStore('historyRange', range)
  await app.rebuild(false)
  app.zoomToNodes(S.nodes, 80)
}

function localDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function promptCustomRange(): void {
  const current = resolveHistoryRange(S.historyRange)
  openDialog(
    {
      title: t('dlgHistoryRange'),
      fields: [
        {
          name: 'start',
          label: t('fieldHistoryStart'),
          type: 'datetime-local',
          value: localDateTime(current.start),
          required: true
        },
        {
          name: 'end',
          label: t('fieldHistoryEnd'),
          type: 'datetime-local',
          value: localDateTime(current.end),
          required: true
        }
      ],
      submitLabel: t('dlgApply')
    },
    values => {
      const start = new Date(values.start ?? '').getTime()
      const end = new Date(values.end ?? '').getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        toast(t('toastInvalidHistoryRange'))
        return
      }
      void setHistoryRange({ preset: 'custom', start, end })
    }
  )
}

export async function setHistoryUnsavedOnly(on: boolean): Promise<void> {
  if (S.historyUnsavedOnly === on) return
  S.historyUnsavedOnly = on
  await app.rebuild(false)
  app.zoomToNodes(S.nodes, 80)
}

export async function muteHistoryDomain(domain: string): Promise<void> {
  S.historyMuted = new Set([...S.historyMuted, domain])
  await saveStore('historyMuted', [...S.historyMuted])
  toast(t('toastDomainMuted', domain))
  await app.rebuild(false)
}

async function unmuteHistoryDomain(domain: string): Promise<void> {
  S.historyMuted = new Set([...S.historyMuted].filter(d => d !== domain))
  await saveStore('historyMuted', [...S.historyMuted])
  await app.rebuild(false)
}

async function setHistoryGrouping(grouping: HistoryGrouping): Promise<void> {
  if (S.historyGrouping === grouping) return
  S.historyGrouping = grouping
  await saveStore('historyGrouping', grouping)
  await app.rebuild(false)
  app.zoomToNodes(S.nodes, 80)
}

export function historyRangeMenu(): MenuItem[] {
  const presets: HistoryRangePreset[] = ['1h', 'today', '24h', '7d', '30d']
  const groupings: Array<[HistoryGrouping, string]> = [
    ['domain', t('historyGroupDomain')],
    ['session', t('historyGroupSession')]
  ]
  return [
    ...presets.map(preset => ({
      label: `${S.historyRange.preset === preset ? '✓ ' : ''}${presetLabel(preset)}`,
      action: () => void setHistoryRange({ preset })
    })),
    { sep: true },
    { label: `${S.historyRange.preset === 'custom' ? '✓ ' : ''}${t('historyRangeCustom')}`, action: promptCustomRange },
    { sep: true },
    ...groupings.map(([grouping, label]) => ({
      label: `${S.historyGrouping === grouping ? '✓ ' : ''}${label}`,
      action: () => void setHistoryGrouping(grouping)
    })),
    ...(S.historyMuted.size
      ? [
          { sep: true } as MenuItem,
          ...[...S.historyMuted].sort().map(domain => ({
            label: t('menuUnmuteDomain', domain),
            action: () => void unmuteHistoryDomain(domain)
          }))
        ]
      : [])
  ]
}
