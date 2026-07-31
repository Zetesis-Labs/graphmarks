import { describe, expect, it } from 'vitest'
import { bestBookmarkMatch, domainKey, normPath, short, strHash } from './utils'

describe('normPath', () => {
  it('quita barras finales y nunca devuelve vacío', () => {
    expect(normPath('/a/b/')).toBe('/a/b')
    expect(normPath('/a//')).toBe('/a')
    expect(normPath('/')).toBe('/')
    expect(normPath('')).toBe('/')
    expect(normPath(undefined)).toBe('/')
  })
})

describe('domainKey', () => {
  it('agrupa por dominio registrable aproximado', () => {
    expect(domainKey('www.github.com')).toBe('github.com')
    expect(domainKey('argocd.example.dev')).toBe('example.dev')
    expect(domainKey('a.b.example.co')).toBe('example.co')
  })
  it('deja IPs y localhost tal cual', () => {
    expect(domainKey('localhost:3000')).toBe('localhost:3000')
    expect(domainKey('10.0.0.1')).toBe('10.0.0.1')
    expect(domainKey('nixon.localhost')).toBe('nixon.localhost')
  })
})

describe('bestBookmarkMatch', () => {
  const bms = [
    { id: 'root', mHost: 'github.com', mPath: '/' },
    { id: 'repo', mHost: 'github.com', mPath: '/acme/webapp' },
    { id: 'pulls', mHost: 'github.com', mPath: '/acme/webapp/pulls' },
    { id: 'nexus', mHost: 'example.dev', mPath: '/nexus' }
  ]

  it('gana el prefijo más largo (marcador más específico)', () => {
    expect(bestBookmarkMatch(bms, 'github.com', '/acme/webapp/pull/42')?.id).toBe('repo')
    expect(bestBookmarkMatch(bms, 'github.com', '/acme/webapp/pulls')?.id).toBe('pulls')
    expect(bestBookmarkMatch(bms, 'github.com', '/otro/repo')?.id).toBe('root')
  })

  it('corta en / para no capturar rutas hermanas', () => {
    expect(bestBookmarkMatch(bms, 'example.dev', '/nexus-ci')).toBeNull()
    expect(bestBookmarkMatch(bms, 'example.dev', '/nexus/settings')?.id).toBe('nexus')
  })

  it('exige el mismo host', () => {
    expect(bestBookmarkMatch(bms, 'gitlab.com', '/acme/webapp')).toBeNull()
  })
})

describe('short', () => {
  it('trunca con elipsis solo cuando hace falta', () => {
    expect(short('hola', 10)).toBe('hola')
    expect(short('0123456789x', 10)).toBe('012345678…')
  })
})

describe('strHash', () => {
  it('es estable y no negativo', () => {
    expect(strHash('https://example.com')).toBe(strHash('https://example.com'))
    expect(strHash('a')).toBeGreaterThanOrEqual(0)
  })
})
