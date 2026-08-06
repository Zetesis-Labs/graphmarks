import { describe, expect, it } from 'vitest'
import { pickTargetTab } from './target-tab'

const OWN = 'chrome-extension://abc/'

describe('pickTargetTab', () => {
  it('popup anclado: vale la activa de la ventana actual', () => {
    const current = { url: 'https://ejemplo.com' }
    expect(pickTargetTab(current, [], OWN)).toBe(current)
  })

  it('popup como ventana propia: mira las activas de las demás ventanas', () => {
    const own = { url: `${OWN}popup.html` }
    const other = { url: 'https://ejemplo.com' }
    expect(pickTargetTab(own, [own, other], OWN)).toBe(other)
  })

  it('sin candidata ajena no hay nada que capturar', () => {
    const own = { url: `${OWN}popup.html` }
    expect(pickTargetTab(own, [own], OWN)).toBeUndefined()
    expect(pickTargetTab(undefined, [], OWN)).toBeUndefined()
  })
})
