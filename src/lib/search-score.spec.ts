import { describe, expect, it } from 'vitest'
import { matchesQuery, type SearchCandidate, scoreCandidate } from './search-score'

const bm = (over: Partial<SearchCandidate> = {}): SearchCandidate => ({
  title: 'Grafana Dashboards',
  url: 'https://grafana.example.dev/dashboards',
  tags: ['ops'],
  tagHub: null,
  kind: 'bm',
  isOpen: false,
  heat: 0.5,
  ...over
})

describe('scoreCandidate', () => {
  it('sin texto: sesión abierta primero, luego calor', () => {
    expect(scoreCandidate(bm({ isOpen: true }), '')).toBe(90)
    expect(scoreCandidate(bm({ kind: 'ghost' }), '')).toBe(80)
    expect(scoreCandidate(bm(), '')).toBe(25)
    expect(scoreCandidate(bm({ kind: 'folder' }), '')).toBe(-1)
  })

  it('prefijo > substring en título > URL > tags', () => {
    expect(scoreCandidate(bm(), 'grafana')).toBe(100)
    expect(scoreCandidate(bm(), 'dashboards')).toBe(70)
    expect(scoreCandidate(bm(), 'example.dev')).toBe(50)
    expect(scoreCandidate(bm(), 'ops')).toBe(40)
    expect(scoreCandidate(bm(), 'zzz')).toBe(-1)
  })

  it('la sesión abierta sube y las carpetas bajan', () => {
    expect(scoreCandidate(bm({ isOpen: true }), 'grafana')).toBe(115)
    expect(scoreCandidate(bm({ kind: 'folder' }), 'grafana')).toBe(90)
  })

  it('#tag puntúa el hub por encima de los etiquetados', () => {
    expect(scoreCandidate(bm({ tagHub: 'ops', kind: 'folder' }), '#op')).toBe(100)
    expect(scoreCandidate(bm(), '#op')).toBe(60)
    expect(scoreCandidate(bm({ tags: [] }), '#op')).toBe(-1)
  })
})

describe('matchesQuery', () => {
  it('#tag busca solo en etiquetas', () => {
    expect(matchesQuery(bm(), '#ops')).toBe(true)
    expect(matchesQuery(bm({ tags: [] }), '#ops')).toBe(false)
    expect(matchesQuery(bm(), '#grafana')).toBe(false)
  })

  it('texto libre busca en título, URL y etiquetas', () => {
    expect(matchesQuery(bm(), 'dashboards')).toBe(true)
    expect(matchesQuery(bm(), 'example.dev')).toBe(true)
    expect(matchesQuery(bm(), 'zzz')).toBe(false)
  })
})
