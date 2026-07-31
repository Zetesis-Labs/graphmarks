# GraphMarks — Marcadores en grafo

Extensión de Chrome que reemplaza la página de nueva pestaña por un grafo
interactivo de tus marcadores, al estilo del *graph view* de Quartz
(Obsidian). Sin build, sin dependencias en ejecución (D3 va incluido), sin
telemetría: todos los datos viven en tu navegador.

![Vista de carpetas](docs/screenshot-folders.png)

![Vista de tags](docs/screenshot-tags.png)

- **Nodos grandes** = carpetas (el tamaño refleja cuántos marcadores contienen).
- **Nodos pequeños** = marcadores (con su favicon al acercar el zoom).
- **Aristas** = estructura de carpetas, más enlaces débiles entre marcadores
  del mismo dominio (conectan clústeres relacionados).
- El color agrupa por carpeta temática; las 8 carpetas más grandes tienen hue
  propio y el resto comparten el gris neutro (la identidad la dan siempre la
  etiqueta y la posición, nunca solo el color).

## Instalación

1. Abre `chrome://extensions`
2. Activa **Modo de desarrollador** (esquina superior derecha)
3. **Cargar descomprimida** → selecciona esta carpeta (`graphmarks`)
4. Abre una pestaña nueva. Chrome preguntará si quieres conservar la nueva
   página de pestaña — acepta.

## Uso

| Acción | Resultado |
|---|---|
| Clic en un marcador | Lo abre (⌘/Ctrl+clic en pestaña nueva) |
| Clic en una carpeta | Encuadra su clúster |
| Arrastrar un nodo | Lo mueve (la física lo reacomoda) |
| Rueda / arrastrar el fondo | Zoom / paneo |
| Escribir (en cualquier momento) | Activa el buscador-paleta directamente |
| `º` | Filtro «solo abiertas» on/off |
| `gm` + espacio en el omnibox | Buscar marcadores desde la barra de direcciones |
| Chips de la cabecera | Resaltan y encuadran cada carpeta |
| Botón «Lista» | Vista de lista accesible (los mismos datos, sin canvas) |

## Buscador-paleta

Empieza a escribir en cualquier momento y el buscador se activa solo, con un
desplegable de resultados (marcadores, pestañas abiertas, sueltas, tags,
carpetas) que se filtra en vivo. Con `↑`/`↓` navegas la lista y ves el nodo
correspondiente resaltado en el grafo — al entrar en modo búsqueda el grafo
se encuadra completo, sin zoom, para que veas dónde cae cada resultado; si te
quedas **3 segundos** sobre un resultado, el grafo lo focaliza. `Enter` abre
(o salta a la pestaña si ya está abierta), `Esc` restaura la vista anterior.
`#tag` filtra por etiqueta.

## Edición (escribe en tus marcadores reales)

El grafo es editable y los cambios se guardan vía `chrome.bookmarks`, así que
se reflejan en Chrome (y en la sincronización) al instante:

- **Soltar un nodo sobre una carpeta** lo mueve a esa carpeta. Mientras
  arrastras, la carpeta de destino se marca con un anillo; al soltar aparece
  un aviso con **Deshacer**.
- **Clic derecho sobre un marcador**: abrir, renombrar, editar URL, mover a
  otra carpeta o eliminar.
- **Clic derecho sobre una carpeta**: renombrar, crear subcarpeta, crear
  marcador dentro, mover o eliminar (pide confirmación e indica cuántos
  marcadores arrastra).
- **Clic derecho en el fondo**: nueva carpeta o nuevo marcador donde elijas.

En la vista previa (`newtab.html` abierto como archivo) la edición funciona
igual pero solo en memoria: no toca nada y se pierde al recargar.

## Pestañas abiertas

El grafo sabe qué pestañas tienes abiertas (`chrome.tabs`) y las proyecta
sobre los marcadores:

- Un marcador con pestaña abierta se dibuja con un **anillo** de su color, y
  una **bolita** por cada pestaña (varias pestañas = varias bolitas; la
  activa lleva un punto blanco). Las pestañas en subrutas también cuentan:
  `github.com/org/repo/pull/812` se asigna al marcador de `repo`, siempre al
  marcador **más específico** que la contenga.
- **Clic** en un marcador abierto va a su pestaña más reciente (y cierra este
  new tab, como el «Cambiar a esta pestaña» del omnibox). Clic en una bolita
  va a esa pestaña concreta.
- Al hacer **hover** aparece una bolita **«+»** para abrir una pestaña nueva
  del marcador aunque ya esté abierto. ⌘/Ctrl+clic también fuerza pestaña nueva.
- Todo se actualiza en vivo al abrir/cerrar/navegar pestañas.
- **Filtro «solo abiertas»**: la tecla `º` (o clic en el badge ⧉ de la
  cabecera) poda el grafo a los marcadores con pestaña abierta y sus
  carpetas/hubs — tu sesión de navegación proyectada sobre la topología.
  El estado del filtro se recuerda entre pestañas y sesiones, funciona en
  las tres vistas, y el grafo se replantea solo al abrir o cerrar pestañas
  mientras está activo.
- **Pestañas sueltas (fantasmas)**: las pestañas que no casan con ningún
  marcador aparecen como nodos grises punteados, agrupadas por dominio.
  Arrastra una sobre una carpeta (o un tag) y se convierte en marcador;
  clic derecho permite guardarla, ir a ella o cerrarla. Se ocultan desde el
  menú del fondo.

## Historial como capa viva

Con el permiso `history`, el grafo respira con tu uso real:

- **Calor**: el tamaño de cada marcador (y un halo sutil en los muy usados)
  refleja cuánto lo has visitado últimamente — ves enfriarse lo que ya no usas.
- **Sugerencias** (chip «✦» en la cabecera): sitios con mucho uso reciente que
  aún no tienen marcador, pintados como nodos ámbar punteados. Se adoptan
  igual que los fantasmas (arrastrar sobre una carpeta) o se descartan para
  siempre desde su menú. El análisis se cachea 30 minutos.

## Layout manual

Arrastrar un nodo lo **fija** donde lo sueltes (queda marcado con un punto) y
la posición se recuerda por vista entre sesiones. Doble clic en una carpeta la
suelta; el menú contextual permite soltar cualquier nodo o todos a la vez.

## Vistas y etiquetas

El conmutador de la cabecera cambia la topología del grafo:

- **Carpetas** — la jerarquía real de `chrome.bookmarks` (editable, drag = mover).
- **Tags** — hubs por etiqueta, dibujados huecos. Un marcador con varias
  etiquetas cuelga de varios hubs a la vez, la topología que las carpetas no
  pueden expresar. Soltar un marcador sobre un tag se lo añade; clic derecho
  en un hub permite renombrar o eliminar la etiqueta; clic derecho en un
  marcador → «Etiquetas…»; en una carpeta → «Etiquetar contenido…» (bulk).
- **Dominios** — agrupación automática por dominio (github.com, example.dev…),
  sin edición: es una vista derivada.

Las etiquetas son una capa propia de GraphMarks (Chrome no las soporta):
se guardan con la URL como clave — sobreviven a renombrados y movimientos de
carpeta — en `chrome.storage.sync`, troceadas en buckets para respetar el
límite de 8 KB por item, así que **viajan entre tus máquinas** con la sesión
de Chrome (con fallback automático a local, y `localStorage` en la vista
previa). La primera vez se siembran etiquetas de ejemplo (`seed-tags.js`).
En el buscador, `#tag` filtra por etiqueta.

Desde el menú contextual del fondo puedes **exportar/importar un JSON** con
etiquetas, layout fijado y sugerencias descartadas — tu seguro de vida.

## Vista previa sin instalar

Abre `newtab.html` directamente en el navegador: sin la API de Chrome usa
datos de ejemplo (`mock-data.js`, `seed-tags.js` y pestañas simuladas), con
la edición funcionando en memoria. Dentro de la extensión lee tus marcadores
reales vía `chrome.bookmarks` y se actualiza solo cuando añades, mueves o
borras marcadores. Parámetros útiles para desarrollo: `?view=tags|domains|folders`
y `?filter=open`.

Tema claro y oscuro automáticos según el sistema. Sin dependencias externas en
ejecución: D3 v7 va incluido en `vendor/`.

## Privacidad

Todo es local: los marcadores se leen y escriben con `chrome.bookmarks`, el
historial se analiza en tu máquina con `chrome.history` (nunca sale de ella),
las etiquetas y preferencias viven en `chrome.storage` (sync/local), los
favicons salen de la caché local de Chrome (`_favicon`) y la extensión no
hace ninguna petición de red.

## Licencia

MIT — ver [LICENSE](LICENSE).
