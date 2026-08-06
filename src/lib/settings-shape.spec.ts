import { describe, expect, it } from 'vitest'
import { normalizeSettings, resolveActionMode, SETTINGS_DEFAULTS, shouldReleaseNewTab } from './settings-shape'

describe('normalizeSettings', () => {
  it('devuelve los defectos ante datos ausentes o corruptos', () => {
    expect(normalizeSettings(undefined)).toEqual(SETTINGS_DEFAULTS)
    expect(normalizeSettings(null)).toEqual(SETTINGS_DEFAULTS)
    expect(normalizeSettings('basura')).toEqual(SETTINGS_DEFAULTS)
    expect(normalizeSettings(42)).toEqual(SETTINGS_DEFAULTS)
  })

  it('conserva un openMode válido', () => {
    expect(normalizeSettings({ openMode: 'action' })).toEqual({ ...SETTINGS_DEFAULTS, openMode: 'action' })
    expect(normalizeSettings({ openMode: 'newtab' })).toEqual({ ...SETTINGS_DEFAULTS, openMode: 'newtab' })
  })

  it('conserva un actionMode válido y descarta el desconocido', () => {
    expect(normalizeSettings({ actionMode: 'graph' }).actionMode).toBe('graph')
    expect(normalizeSettings({ actionMode: 'capture' }).actionMode).toBe('capture')
    expect(normalizeSettings({ actionMode: 'popup' }).actionMode).toBe('auto')
  })

  it('descarta un openMode desconocido', () => {
    expect(normalizeSettings({ openMode: 'popup' })).toEqual(SETTINGS_DEFAULTS)
    expect(normalizeSettings({ openMode: 7 })).toEqual(SETTINGS_DEFAULTS)
  })

  it('syncEnabled solo se apaga con false explícito', () => {
    expect(normalizeSettings({ syncEnabled: false }).syncEnabled).toBe(false)
    expect(normalizeSettings({ syncEnabled: 'no' }).syncEnabled).toBe(true)
    expect(normalizeSettings({}).syncEnabled).toBe(true)
  })

  it('ignora claves ajenas sin arrastrarlas', () => {
    expect(normalizeSettings({ openMode: 'action', extra: true })).toEqual({
      ...SETTINGS_DEFAULTS,
      openMode: 'action'
    })
  })
})

describe('resolveActionMode', () => {
  it('en auto, el botón captura cuando el grafo ya vive en la pestaña nueva', () => {
    expect(resolveActionMode({ ...SETTINGS_DEFAULTS, openMode: 'newtab' })).toBe('capture')
  })

  it('en auto, el botón abre el grafo cuando el usuario conserva su pestaña nueva', () => {
    expect(resolveActionMode({ ...SETTINGS_DEFAULTS, openMode: 'action' })).toBe('graph')
  })

  it('una elección explícita manda sobre la deducción', () => {
    expect(resolveActionMode({ ...SETTINGS_DEFAULTS, openMode: 'newtab', actionMode: 'graph' })).toBe('graph')
    expect(resolveActionMode({ ...SETTINGS_DEFAULTS, openMode: 'action', actionMode: 'capture' })).toBe('capture')
  })
})

describe('shouldReleaseNewTab', () => {
  const newtab = { ...SETTINGS_DEFAULTS, openMode: 'newtab' as const }
  const action = { ...SETTINGS_DEFAULTS, openMode: 'action' as const }

  it('nunca libera en modo newtab (comportamiento por defecto)', () => {
    expect(shouldReleaseNewTab(newtab, null)).toBe(false)
    expect(shouldReleaseNewTab(newtab, 'action')).toBe(false)
  })

  it('en modo botón libera las aperturas que no vienen del botón', () => {
    expect(shouldReleaseNewTab(action, null)).toBe(true)
    expect(shouldReleaseNewTab(action, 'otra-cosa')).toBe(true)
  })

  it('en modo botón respeta la apertura explícita desde la barra', () => {
    expect(shouldReleaseNewTab(action, 'action')).toBe(false)
  })
})
