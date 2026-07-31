import { describe, expect, it } from 'vitest'
import { TAG_BUCKETS } from '../constants'
import { normTags, tagBucket } from './tag-utils'

describe('normTags', () => {
  it('separa por comas y espacios, quita # y pasa a minúsculas', () => {
    expect(normTags('IA, #Argocd  payload')).toEqual(['ia', 'argocd', 'payload'])
  })
  it('elimina duplicados y vacíos', () => {
    expect(normTags('a, a, #a,, ')).toEqual(['a'])
    expect(normTags('')).toEqual([])
  })
})

describe('tagBucket', () => {
  it('es estable para la misma URL', () => {
    expect(tagBucket('https://example.com/x')).toBe(tagBucket('https://example.com/x'))
  })
  it('produce buckets dentro del rango configurado', () => {
    const urls = Array.from({ length: 200 }, (_, i) => `https://site-${i}.example.dev/path/${i}`)
    const seen = new Set<string>(urls.map(tagBucket))
    for (const b of seen) {
      const idx = Number(b.replace('tags_', ''))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(TAG_BUCKETS)
    }
    // con 200 URLs deberían tocarse casi todos los buckets (reparto razonable)
    expect(seen.size).toBeGreaterThan(TAG_BUCKETS / 2)
  })
})
