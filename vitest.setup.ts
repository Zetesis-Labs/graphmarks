/* Esqueleto mínimo de newtab.html: ui/dom resuelve sus referencias al
   importarse y aquí no hay página real. Los ids deben existir, nada más. */
const IDS = [
  'tooltip',
  'search',
  'results',
  'legend',
  'list-panel',
  'list-toggle',
  'empty',
  'ctxmenu',
  'dlg',
  'toast',
  'views',
  'tabcount',
  'winchip',
  'sessions',
  'settings-btn'
]

document.body.append(
  ...IDS.map(id => {
    const el = document.createElement(id === 'dlg' ? 'dialog' : 'div')
    el.id = id
    return el
  })
)

const canvas = document.createElement('canvas')
canvas.id = 'graph'
document.body.appendChild(canvas)

// happy-dom no implementa canvas 2D; a los specs les basta con que exista
HTMLCanvasElement.prototype.getContext = (() =>
  new Proxy({}, { get: () => () => undefined })) as unknown as HTMLCanvasElement['getContext']
