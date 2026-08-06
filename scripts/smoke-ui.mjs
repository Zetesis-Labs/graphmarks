/* Smoke de la UI sobre la preview real (file://): arranca Chrome headless,
   conduce la página por CDP y comprueba lo que los tests unitarios no cubren
   a propósito (política «test the seams»): que los modales montan, la paleta
   filtra, los chips reactivos se actualizan y la consola queda limpia.

   Requiere WebSocket global (Node ≥ 22, o Node 20 con --experimental-websocket).
   CHROME_PATH apunta al binario; sin él se prueban las rutas habituales. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)
const chromeBin = CANDIDATES.find(p => existsSync(p))
if (!chromeBin) {
  console.error('smoke-ui: no se encontró Chrome (define CHROME_PATH)')
  process.exit(1)
}
if (typeof WebSocket === 'undefined') {
  console.error('smoke-ui: falta WebSocket global — usa Node ≥ 22 o --experimental-websocket')
  process.exit(1)
}

const PORT = 9222 + Math.floor(Math.random() * 500)
const pageUrl = `file://${process.cwd()}/newtab.html`
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1600,1000',
    pageUrl
  ],
  { stdio: 'ignore' }
)

const wait = ms => new Promise(r => setTimeout(r, ms))
const consoleErrors = []
let failures = 0

function check(name, ok, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function connect() {
  for (let i = 0; i < 20; i++) {
    await wait(500)
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json())
      const tab = targets.find(t => t.type === 'page' && t.url.includes('newtab.html'))
      if (tab) return tab
    } catch {
      /* Chrome aún arrancando */
    }
  }
  throw new Error('no apareció la pestaña de la preview')
}

try {
  const tab = await connect()
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let msgId = 0
  ws.send(JSON.stringify({ id: ++msgId, method: 'Runtime.enable' }))
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(`EXC ${m.params.exceptionDetails.text}`)
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      consoleErrors.push(
        m.params.args
          .map(a => a.value ?? a.description)
          .join(' ')
          .slice(0, 160)
      )
    }
  })
  const evaluate = expr =>
    new Promise(resolve => {
      const id = ++msgId
      const on = e => {
        const m = JSON.parse(e.data)
        if (m.id !== id) return
        ws.removeEventListener('message', on)
        if (m.result?.exceptionDetails) {
          resolve(`EXCEPCIÓN: ${(m.result.exceptionDetails.exception?.description ?? '').split('\n')[0]}`)
        } else resolve(m.result?.result?.value)
      }
      ws.addEventListener('message', on)
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true }
        })
      )
    })
  const typeSearch = value =>
    evaluate(`(() => { const s = document.getElementById('search'); s.focus(); s.value = ${JSON.stringify(value)};
      s.dispatchEvent(new Event('input', { bubbles: true })) })()`)

  await wait(2500) // que la simulación y las vistas asienten

  console.log('— arranque —')
  check('4 botones de vista', (await evaluate(`document.querySelectorAll('#views button').length`)) === 4)
  check('leyenda con chip base', (await evaluate(`document.querySelectorAll('#legend .chip').length`)) >= 1)
  check('lista con clusters', (await evaluate(`document.querySelectorAll('#list-panel details').length`)) > 0)
  check('badge visible', (await evaluate(`!document.getElementById('tabcount').hidden`)) === true)

  console.log('— reactividad: filtro solo abiertas —')
  const badgeBefore = await evaluate(`document.getElementById('tabcount').textContent`)
  await evaluate(`document.getElementById('tabcount').click()`)
  await wait(1500)
  check(
    'el badge cambia al activar',
    (await evaluate(`document.getElementById('tabcount').classList.contains('active')`)) === true
  )
  await evaluate(`document.getElementById('tabcount').click()`)
  await wait(1500)
  check('y vuelve al desactivar', (await evaluate(`document.getElementById('tabcount').textContent`)) === badgeBefore)

  console.log('— cambio de vista e historial (leyenda diferida) —')
  await evaluate(`[...document.querySelectorAll('#views button')].find(b => /histor/i.test(b.textContent)).click()`)
  await wait(2500)
  check(
    'botón activo actualizado',
    /histor/i.test(String(await evaluate(`document.querySelector('#views button.active')?.textContent`)))
  )
  check('chips del historial montados', (await evaluate(`document.querySelectorAll('#legend button').length`)) >= 2)

  console.log('— menú contextual —')
  await evaluate(
    `document.getElementById('graph').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 70, clientY: 420 }))`
  )
  await wait(300)
  check('menú con items', (await evaluate(`document.querySelectorAll('#ctxmenu button').length`)) > 3)
  await evaluate(`document.body.click()`)
  await wait(200)
  check('se cierra al clicar fuera', (await evaluate(`document.getElementById('ctxmenu').hidden`)) === true)

  console.log('— buscador y paleta —')
  await typeSearch('a')
  await wait(500)
  check('resultados de búsqueda', (await evaluate(`document.querySelectorAll('#results li').length`)) > 0)
  check('uno seleccionado', (await evaluate(`document.querySelectorAll('#results li.sel').length`)) === 1)
  await typeSearch('>')
  await wait(400)
  const allCommands = await evaluate(`document.querySelectorAll('#results li').length`)
  check('paleta lista comandos', allCommands >= 10)
  await typeSearch('>higiene')
  await wait(400)
  check('la paleta filtra', (await evaluate(`document.querySelectorAll('#results li').length`)) === 1)
  await evaluate(
    `document.querySelector('#results li').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))`
  )
  await wait(1000)
  check('el comando abre su diálogo', (await evaluate(`document.getElementById('dlg').open`)) === true)
  await evaluate(`document.getElementById('dlg').close()`)

  console.log('— panel de ajustes —')
  await evaluate(`document.getElementById('settings-btn').click()`)
  await wait(700)
  check('modal de ajustes abierto', (await evaluate(`document.getElementById('dlg').open`)) === true)
  check('4 secciones en el índice', (await evaluate(`document.querySelectorAll('#dlg .md-tab').length`)) === 4)
  check('radios presentes', (await evaluate(`document.querySelectorAll('#dlg input[type=radio]').length`)) >= 5)
  await evaluate(`document.getElementById('dlg').close()`)

  console.log('— consola —')
  check('sin errores ni avisos', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '))

  ws.close()
} catch (err) {
  failures += 1
  console.error(`smoke-ui: ${err.message ?? err}`)
} finally {
  chrome.kill()
}

if (failures) {
  console.error(`\nsmoke-ui: ${failures} comprobaciones fallidas`)
  process.exit(1)
}
console.log('\nsmoke-ui: todo en orden')
