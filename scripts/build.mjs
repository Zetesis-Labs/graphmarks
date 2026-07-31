/* Build de la extensión: dos bundles IIFE autocontenidos (los módulos ES no
   cargan bajo file://, y la preview standalone debe seguir funcionando). */
import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

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
  { ...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js' }
]

if (watch) {
  for (const job of jobs) {
    const ctx = await context(job)
    await ctx.watch()
  }
  console.log('esbuild en modo watch…')
} else {
  await Promise.all(jobs.map(job => build(job)))
}
