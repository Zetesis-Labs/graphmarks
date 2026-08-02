/* Build de la extensión: dos bundles IIFE autocontenidos (los módulos ES no
   cargan bajo file://, y la preview standalone debe seguir funcionando) más
   los catálogos _locales/ que Chrome necesita para traducir el manifest.
   SurrealDB va aparte en dos bundles ESM (solo cargan dentro de la extensión,
   vía import() dinámico y Worker de tipo módulo).

   El build produce además `firefox/`: la misma extensión con el manifest
   parcheado para Firefox (event page en vez de service worker, gecko.id,
   sin el permiso `favicon`, que es exclusivo de Chrome). Los bundles son
   idénticos; solo cambia el manifest. Cargar con `pnpm dev:firefox`. */
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')
const LOCALES = ['es', 'en']

/** `src/locales/xx.json` (plano) → `_locales/xx/messages.json` (formato Chrome). */
async function emitLocales() {
  for (const locale of LOCALES) {
    const flat = JSON.parse(await readFile(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'))
    const messages = Object.fromEntries(Object.entries(flat).map(([key, message]) => [key, { message }]))
    await mkdir(new URL(`../_locales/${locale}/`, import.meta.url), { recursive: true })
    await writeFile(
      new URL(`../_locales/${locale}/messages.json`, import.meta.url),
      `${JSON.stringify(messages, null, 2)}\n`
    )
  }
  console.log(`_locales generados: ${LOCALES.join(', ')}`)
}

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info'
}

const jobs = [
  { ...common, entryPoints: ['src/main.ts'], outfile: 'dist/newtab.js' },
  { ...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js' },
  { ...common, format: 'esm', entryPoints: ['src/surreal/client.ts'], outfile: 'dist/surreal.js' },
  /* El agente worker se bundlea desde el paquete (importa `surrealdb` a pelo y
     el navegador no resuelve bare specifiers). El nombre de salida no es libre:
     createWasmWorkerEngines hace new Worker('./worker-agent.mjs') relativo a
     dist/surreal.js. */
  {
    ...common,
    format: 'esm',
    entryPoints: ['node_modules/@surrealdb/wasm/dist/worker-agent.mjs'],
    outfile: 'dist/worker-agent.mjs'
  }
]

/* El agente worker de @surrealdb/wasm resuelve el binario como
   `../wasm/surrealdb_bg.wasm` relativo al bundle, así que desde
   dist/surreal-worker.js debe existir wasm/ en la raíz de la extensión. */
async function copyWasm() {
  await mkdir(new URL('../wasm/', import.meta.url), { recursive: true })
  await copyFile(
    new URL('../node_modules/@surrealdb/wasm/wasm/surrealdb_bg.wasm', import.meta.url),
    new URL('../wasm/surrealdb_bg.wasm', import.meta.url)
  )
  console.log('wasm/surrealdb_bg.wasm copiado')
}

function firefoxManifest(m) {
  const f = structuredClone(m)
  f.background = { scripts: ['dist/background.js'] }
  f.permissions = (f.permissions ?? []).filter(p => p !== 'favicon')
  f.browser_specific_settings = {
    gecko: {
      id: 'graphmarks@zetesis.xyz',
      strict_min_version: '121.0',
      // obligatorio en AMO desde 2025: graphmarks no recoge ni transmite nada
      data_collection_permissions: { required: ['none'] }
    }
  }
  return f
}

const FIREFOX_FILES = [
  'newtab.html',
  'newtab.css',
  'mock-data.js',
  'seed-tags.js',
  'LICENSE',
  'icons',
  '_locales',
  'dist/newtab.js',
  'dist/background.js'
]

async function stageFirefox() {
  const root = new URL('../', import.meta.url)
  const out = new URL('../firefox/', import.meta.url)
  await rm(out, { recursive: true, force: true })
  await mkdir(new URL('dist/', out), { recursive: true })
  for (const f of FIREFOX_FILES) await cp(new URL(f, root), new URL(f, out), { recursive: true })
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
  await writeFile(new URL('manifest.json', out), `${JSON.stringify(firefoxManifest(manifest), null, 2)}\n`)
  console.log('firefox/ preparado (manifest parcheado)')
}

await emitLocales()
await copyWasm()

if (watch) {
  for (const job of jobs) {
    const ctx = await context(job)
    await ctx.watch()
  }
  console.log('esbuild en modo watch…')
} else {
  await Promise.all(jobs.map(job => build(job)))
  await stageFirefox()
}
