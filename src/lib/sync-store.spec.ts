import { describe, expect, it } from 'vitest'

/**
 * El troceado debe respetar el límite de 8.192 B por item de storage.sync.
 * Se testea la propiedad, no la API de Chrome (que ya testea Google).
 */
const CHUNK_BYTES = 7000

function chunkString(s: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size))
  return out
}

describe('troceado para storage.sync', () => {
  it('cada trozo cabe en el límite de item de Chrome', () => {
    const big = JSON.stringify(
      Array.from({ length: 300 }, (_, i) => ({
        url: `https://example.dev/ruta/muy/larga/para/ocupar/espacio/${i}`,
        title: `Pestaña número ${i} con un título razonablemente largo`
      }))
    )
    const chunks = chunkString(big, CHUNK_BYTES)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(new TextEncoder().encode(c).length).toBeLessThan(8192)
  })

  it('reconstruye el valor original al concatenar', () => {
    const value = { sessions: [{ name: 'Trabajo', tabs: ['a', 'b', 'c'] }], n: 42 }
    const raw = JSON.stringify(value)
    const rebuilt = chunkString(raw, 16).join('')
    expect(JSON.parse(rebuilt)).toEqual(value)
  })
})
