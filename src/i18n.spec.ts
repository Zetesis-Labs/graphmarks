import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import es from './locales/es.json'

/** Huecos $1..$n de un mensaje, normalizados para comparar entre idiomas. */
const holes = (msg: string): string =>
  [...msg.matchAll(/\$\d+/g)]
    .map(m => m[0])
    .sort()
    .join(',')

describe('catálogos i18n', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  it('cada clave usa los mismos huecos $n en ambos idiomas', () => {
    const enMap = en as Record<string, string>
    for (const [key, msg] of Object.entries(es)) {
      expect(holes(enMap[key] ?? ''), `clave «${key}»`).toBe(holes(msg))
    }
  })
})
