/* Bundle ESM aparte (dist/surreal.js): el bundle principal es IIFE y este
   módulo depende de import.meta/Worker de tipo módulo. Se carga perezosamente
   vía import() dinámico solo dentro de la extensión. Autocontenido a
   propósito: recibe los datos como entrada y no toca estado ni DOM. */
import { createWasmWorkerEngines } from '@surrealdb/wasm'
import { Surreal } from 'surrealdb'

export interface SpikeBookmark {
  url: string
  title: string
  folder: string | null
  chromeId: string
}

export interface SpikeTagEntry {
  url: string
  tag: string
}

export interface SpikeInput {
  workerUrl: string
  bookmarks: SpikeBookmark[]
  tags: SpikeTagEntry[]
  searchTerm: string
}

export interface SpikeStep {
  ms: number
  error?: string
}

export interface SpikeReport {
  steps: Record<string, SpikeStep>
  totalMs: number
  counts: { bookmarks: number; tagEntries: number }
  samples: Record<string, unknown>
}

/* Esquema completo desde el día 1, aunque la UI aún no use notas: bookmark y
   tag son proyecciones reconstruibles (chrome.bookmarks / storage.sync);
   note y sus aristas serán el único dato con origen aquí. La clave canónica
   es la URL (los ids de chrome.bookmarks no son estables entre dispositivos),
   por eso los record ids son type::thing(tabla, url). */
const SCHEMA = `
DEFINE TABLE IF NOT EXISTS bookmark SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS url ON bookmark TYPE string;
DEFINE FIELD IF NOT EXISTS title ON bookmark TYPE string;
DEFINE FIELD IF NOT EXISTS folder ON bookmark TYPE option<string>;
DEFINE FIELD IF NOT EXISTS chrome_id ON bookmark TYPE option<string>;

DEFINE TABLE IF NOT EXISTS tag SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON tag TYPE string;

DEFINE TABLE IF NOT EXISTS note SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON note TYPE string;
DEFINE FIELD IF NOT EXISTS content ON note TYPE string;
DEFINE FIELD IF NOT EXISTS created ON note TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD IF NOT EXISTS updated ON note TYPE datetime DEFAULT time::now();

DEFINE TABLE IF NOT EXISTS tagged TYPE RELATION IN bookmark|note OUT tag;
DEFINE TABLE IF NOT EXISTS about TYPE RELATION IN note OUT bookmark;
DEFINE TABLE IF NOT EXISTS links_to TYPE RELATION IN note OUT note;

DEFINE ANALYZER IF NOT EXISTS simple TOKENIZERS class FILTERS lowercase, ascii;
DEFINE INDEX IF NOT EXISTS bm_title_fts ON bookmark FIELDS title SEARCH ANALYZER simple BM25;
DEFINE INDEX IF NOT EXISTS note_content_fts ON note FIELDS content SEARCH ANALYZER simple BM25;
`

let db: Surreal | undefined

export function getDb(): Surreal | undefined {
  return db
}

async function step(report: SpikeReport, name: string, fn: () => Promise<unknown>): Promise<unknown> {
  const t0 = performance.now()
  try {
    const out = await fn()
    report.steps[name] = { ms: Math.round((performance.now() - t0) * 10) / 10 }
    return out
  } catch (e) {
    report.steps[name] = { ms: Math.round((performance.now() - t0) * 10) / 10, error: (e as Error).message }
    return undefined
  }
}

export async function runSpike(input: SpikeInput): Promise<SpikeReport> {
  const report: SpikeReport = {
    steps: {},
    totalMs: 0,
    counts: { bookmarks: input.bookmarks.length, tagEntries: input.tags.length },
    samples: {}
  }
  const t0 = performance.now()

  await step(report, 'connect (worker + wasm + indxdb)', async () => {
    db ??= new Surreal({
      engines: createWasmWorkerEngines({
        createWorker: () => new Worker(input.workerUrl, { type: 'module' })
      })
    })
    await db.connect('indxdb://graphmarks')
    await db.use({ namespace: 'gm', database: 'gm' })
  })

  const d = db
  if (!d) {
    report.totalMs = Math.round(performance.now() - t0)
    return report
  }

  await step(report, 'esquema (idempotente)', () => d.query(SCHEMA))

  await step(report, `proyectar ${input.bookmarks.length} marcadores (upsert bulk)`, () =>
    d.query(
      `FOR $b IN $bookmarks {
        UPSERT type::thing('bookmark', $b.url) SET
          url = $b.url, title = $b.title, folder = $b.folder, chrome_id = $b.chromeId;
      };`,
      { bookmarks: input.bookmarks }
    )
  )

  // RELATE duplica aristas si se repite: la proyección de tags borra y recrea
  const tagNames = [...new Set(input.tags.map(e => e.tag))]
  await step(report, `proyectar ${input.tags.length} tags (relate)`, () =>
    d.query(
      `DELETE tagged;
      FOR $t IN $tagNames {
        UPSERT type::thing('tag', $t) SET name = $t;
      };
      FOR $e IN $tags {
        RELATE (type::thing('bookmark', $e.url))->tagged->(type::thing('tag', $e.tag));
      };`,
      { tags: input.tags, tagNames }
    )
  )

  report.samples.count = await step(report, 'query: count marcadores', () =>
    d.query('SELECT count() FROM bookmark GROUP ALL;')
  )

  report.samples.fts = await step(report, `query: full-text BM25 "${input.searchTerm}"`, () =>
    d.query('SELECT title, search::score(0) AS score FROM bookmark WHERE title @0@ $q ORDER BY score DESC LIMIT 5;', {
      q: input.searchTerm
    })
  )

  const first = input.tags[0]
  if (first) {
    report.samples.tagsOf = await step(report, 'query: traversal tags de un marcador', () =>
      d.query('SELECT title, ->tagged->tag.name AS tags FROM type::thing("bookmark", $url);', { url: first.url })
    )
    report.samples.topTags = await step(report, 'query: top tags (traversal inverso)', () =>
      d.query('SELECT name, array::len(<-tagged<-bookmark) AS n FROM tag ORDER BY n DESC LIMIT 3;')
    )
  }

  const noteTarget = input.bookmarks[0]
  if (noteTarget) {
    report.samples.note = await step(report, 'nota demo + arista about + lectura', () =>
      d.query(
        `UPSERT note:spike SET title = 'Nota de prueba', content = $content, updated = time::now();
        DELETE note:spike->about;
        RELATE note:spike->about->(type::thing('bookmark', $url));
        SELECT title, content, ->about->bookmark.title AS anota FROM note:spike;`,
        { url: noteTarget.url, content: `Zettel del spike sobre ${noteTarget.title}` }
      )
    )
  }

  report.totalMs = Math.round(performance.now() - t0)
  return report
}

/** Borra la base local para volver a medir un arranque en frío. */
export async function wipe(): Promise<string[]> {
  await db?.close()
  db = undefined
  const found = await indexedDB.databases()
  const names = found.map(x => x.name).filter((n): n is string => !!n)
  await Promise.all(
    names.map(
      name =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
          req.onblocked = () => resolve()
        })
    )
  )
  return names
}
