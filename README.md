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
| `/` | Enfoca el buscador; Enter abre el primer resultado |
| Chips de la cabecera | Resaltan y encuadran cada carpeta |
| Botón «Lista» | Vista de lista accesible (los mismos datos, sin canvas) |

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
- **Filtro «solo abiertas»**: la tecla `A` (o clic en el badge ⧉ de la
  cabecera) poda el grafo a los marcadores con pestaña abierta y sus
  carpetas/hubs — tu sesión de navegación proyectada sobre la topología.
  El estado del filtro se recuerda entre pestañas y sesiones, funciona en
  las tres vistas, y el grafo se replantea solo al abrir o cerrar pestañas
  mientras está activo.

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
se guardan en `chrome.storage.local` con la URL como clave — sobreviven a
renombrados y movimientos de carpeta — y en `localStorage` en la vista previa.
La primera vez se siembran etiquetas transversales derivadas del análisis del
historial (`seed-tags.js`): argocd, payload, tailscale, ia, etc. En el
buscador, `#tag` filtra por etiqueta.

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

Todo es local: los marcadores se leen y escriben con `chrome.bookmarks`, las
etiquetas y preferencias viven en `chrome.storage.local`, los favicons salen
de la caché local de Chrome (`_favicon`) y no se hace ninguna petición de red.

## Licencia

MIT — ver [LICENSE](LICENSE).
