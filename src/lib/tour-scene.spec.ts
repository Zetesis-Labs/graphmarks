import { describe, expect, it } from 'vitest'
import { changedKeys, NEUTRAL_SCENE, resolveScene, type TourScene } from './tour-scene'

describe('resolveScene', () => {
  it('lo no declarado vuelve a reposo', () => {
    expect(resolveScene({ view: 'tags' })).toEqual({ ...NEUTRAL_SCENE, view: 'tags' })
    expect(resolveScene()).toEqual(NEUTRAL_SCENE)
  })

  it('una escena resuelta no depende de la anterior: retroceder da lo mismo que avanzar', () => {
    // el paso «búsqueda» tras haber pasado por tags y por el filtro de abiertas
    const desdeAtras = resolveScene({ search: 'docs' })
    const desdeDelante = resolveScene({ search: 'docs' })
    expect(desdeAtras).toEqual(desdeDelante)
    expect(desdeAtras.view).toBe('folders')
    expect(desdeAtras.onlyOpen).toBe(false)
    expect(desdeAtras.menuOnHub).toBe(false)
    expect(desdeAtras.listOpen).toBe(false)
  })
})

describe('changedKeys', () => {
  it('solo devuelve lo que difiere', () => {
    const from: TourScene = resolveScene({ view: 'tags', onlyOpen: true })
    const to: TourScene = resolveScene({ view: 'tags', search: 'docs' })
    expect(changedKeys(from, to)).toEqual(new Set(['onlyOpen', 'search']))
  })

  it('objetos iguales no cambian nada', () => {
    expect(changedKeys(NEUTRAL_SCENE, resolveScene())).toEqual(new Set())
  })

  it('es genérico sobre cualquier objeto plano', () => {
    expect(changedKeys({ a: 1, b: 'x' }, { a: 2, b: 'x' })).toEqual(new Set(['a']))
  })
})
