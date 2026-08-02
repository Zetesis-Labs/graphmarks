/* Build de la extensión: dos bundles IIFE autocontenidos (los módulos ES no
   cargan bajo file://, y la preview standalone debe seguir funcionando) más
   los catálogos _locales/ que Chrome necesita para traducir el manifest.
   SurrealDB va aparte en dos bundles ESM (solo cargan dentro de la extensión,
   vía import() dinámico y Worker de tipo módulo). */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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
  { ...common, format: 'esm', entryPoints: ['src/surreal/worker.ts'], outfile: 'dist/surreal-worker.js' }
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
}
