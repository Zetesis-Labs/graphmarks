# Ficha de la Chrome Web Store

Textos listos para copiar y pegar en el Developer Dashboard. Lo que Google
pregunta viene en este orden: **Store listing → Privacy → Payments → Submit**.

## Store listing

**Nombre** (máx. 75)

```
GraphMarks — Marcadores en grafo
```

**Descripción breve / summary** (máx. 132)

```
Tu nueva pestaña como un grafo interactivo de marcadores: carpetas, etiquetas y las pestañas que tienes abiertas.
```

**Categoría**: Productividad · **Idioma**: Español

**Descripción detallada**

```
GraphMarks convierte la página de nueva pestaña en un mapa vivo de tus marcadores.

En vez de una lista, ves un grafo: las carpetas son centros cuyo tamaño refleja cuántos marcadores contienen, los marcadores orbitan a su alrededor con su favicon, y los enlaces débiles entre sitios del mismo dominio tienden puentes entre áreas relacionadas.

TRES TOPOLOGÍAS
• Carpetas — tu jerarquía real de marcadores.
• Etiquetas — GraphMarks añade etiquetas (Chrome no las tiene); un marcador con varias cuelga de varios centros a la vez, algo que las carpetas no pueden expresar.
• Dominios — agrupación automática por sitio.

TUS PESTAÑAS, SOBRE EL MAPA
Los marcadores que ya tienes abiertos se marcan con un anillo y una bolita por pestaña; al hacer clic saltas a la pestaña en vez de duplicarla. Las pestañas que no están en ningún marcador aparecen como nodos punteados: arrástralas a una carpeta y quedan guardadas. Con la tecla º dejas a la vista solo lo que tienes abierto.

SESIONES DE VENTANAS
Guarda un conjunto de ventanas con su distribución exacta —pestañas y su orden, fijadas, grupos de pestañas con título y color, posición y tamaño de cada ventana— y restáuralo cuando vuelvas a ese proyecto.

EDICIÓN DIRECTA
Arrastra para mover marcadores entre carpetas, renombra, crea o elimina desde el propio grafo. Todo se guarda en los marcadores de Chrome al instante.

BUSCADOR
Empieza a escribir y aparece la paleta de búsqueda: navega los resultados con las flechas viendo dónde cae cada uno en el grafo. También desde la barra de direcciones escribiendo "gm" y un espacio.

PRIVACIDAD
Todo ocurre en tu navegador. GraphMarks no tiene servidores, no envía datos a ninguna parte y no hace ninguna petición de red. Tus etiquetas y sesiones viajan entre tus equipos usando la sincronización de Chrome de tu propia cuenta de Google.

Código abierto (MIT): https://github.com/Zetesis-Labs/graphmarks
```

**Capturas**: `store/screenshots/*.png` (1280×800, el tamaño que pide la Store).
Sube al menos `folders.png` y `tags.png`; las cuatro cuentan mejor la historia.

**URL del sitio / soporte**: `https://github.com/Zetesis-Labs/graphmarks`

## Privacy practices

**Propósito único** (single purpose)

```
Reemplazar la página de nueva pestaña por una visualización en grafo de los marcadores del usuario, con navegación, búsqueda y edición de esos marcadores.
```

**Justificación de cada permiso** (una casilla por permiso):

| Permiso | Justificación para pegar |
|---|---|
| `bookmarks` | Es la función principal de la extensión: leer los marcadores para dibujarlos como grafo y escribirlos cuando el usuario los renombra, mueve, crea o elimina desde la propia visualización. |
| `tabs` | Para señalar en el grafo qué marcadores están ya abiertos y poder saltar a esa pestaña en vez de duplicarla, y para mostrar como nodos las pestañas abiertas que aún no son marcador. |
| `tabGroups` | Opcional. Solo al guardar o restaurar una sesión de ventanas, para conservar el título, el color y el estado plegado de los grupos de pestañas del usuario. |
| `storage` | Guardar en el navegador las etiquetas que crea el usuario, sus sesiones de ventanas y sus preferencias de vista. No se envía nada fuera del navegador. |
| `history` | Calcular localmente con qué frecuencia usa el usuario cada marcador para dibujar los más usados con mayor tamaño. El historial se procesa en el equipo y nunca sale de él. |
| `favicon` | Mostrar el icono de cada sitio en su nodo del grafo, usando la caché local de Chrome (sin descargas externas). |

**Uso de datos**: marcar que **no se recopila ni se transmite ningún dato de
usuario**. La extensión no tiene servidores ni hace peticiones de red, así que
no aplica ninguna de las categorías de recopilación.

**Código remoto**: **No**. Todo el JavaScript va dentro del paquete
(incluida la librería D3, empaquetada por esbuild); no se carga código externo.

**Política de privacidad**: al no recopilar datos no suele exigirse. Si el
formulario la pide, vale la sección «Privacidad» del README del repositorio.

## Después de publicar

Anota el **ID de la extensión** que aparece en la URL del dashboard
(`/detail/<ID>`): es el `CWS_EXTENSION_ID` que necesita el workflow de release
para publicar las siguientes versiones automáticamente.
