/* Build de la extensión: dos bundles IIFE autocontenidos (los módulos ES no
   cargan bajo file://, y la preview standalone debe seguir funcionando) más
   los catálogos _locales/ que Chrome necesita para traducir el manifest.

   El build produce además `firefox/`: la misma extensión con el manifest
   parcheado para Firefox (event page en vez de service worker, gecko.id,
   sin el permiso `favicon`, que es exclusivo de Chrome). Los bundles son
   idénticos; solo cambia el manifest. Cargar con `pnpm dev:firefox`. */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

/* selection.html() de d3-selection nunca se usa, pero vive en el prototype y
   no se tree-shakea; su innerHTML hace saltar al validador de AMO. Stub. */
const stubD3Html = {
  name: 'stub-d3-html',
  setup(b) {
    b.onLoad({ filter: /d3-selection\/src\/selection\/html\.js$/ }, () => ({
      contents: 'export default function html() { return this }',
      loader: 'js'
    }))
  }
}

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
  plugins: [stubD3Html]
}

const jobs = [
  { ...common, entryPoints: ['src/main.ts'], outfile: 'dist/newtab.js' },
  { ...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js' },
  { ...common, entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js' }
]

function firefoxManifest(m) {
  const f = structuredClone(m)
  f.background = { scripts: ['dist/background.js'] }
  f.permissions = (f.permissions ?? []).filter(p => p !== 'favicon')
  f.browser_specific_settings = {
    gecko: {
      // ojo: AMO quema las ids de complementos borrados para siempre;
      // graphmarks@zetesis.xyz quedó inutilizada al borrar el alta inicial
      id: 'graphmarks-newtab@zetesis.xyz',
      // 140 = ESR 2025: data_collection_permissions (140) y tabGroups (139) quedan cubiertos
      strict_min_version: '140.0',
      // obligatorio en AMO desde 2025: graphmarks no recoge ni transmite nada
      data_collection_permissions: { required: ['none'] }
    }
  }
  return f
}

const FIREFOX_FILES = [
  'newtab.html',
  'newtab.css',
  'popup.html',
  'popup.css',
  'mock-data.js',
  'seed-tags.js',
  'LICENSE',
  'icons',
  '_locales',
  'dist/newtab.js',
  'dist/background.js',
  'dist/popup.js'
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
