# CLAUDE.md

## Proyecto

Extensión de Chrome (Manifest V3) en TypeScript que reemplaza la nueva pestaña
por un grafo interactivo de marcadores. Sin framework: canvas 2D + módulos de
`d3-*` (force/zoom/drag/selection), empaquetado con esbuild a dos bundles IIFE.

## Arquitectura

```
src/
  main.ts          orquestador: rebuild(), boot(), listeners de chrome.*
  state.ts         store mutable único (S) + COLORS + pins
  bus.ts           inversión de dependencias (rebuild/requestDraw/zoomToNodes)
  types.ts         tipos del dominio; declaraciones globales de window
  constants.ts     slots de color, hubs sintéticos, radios, límites
  env.ts           IS_EXT / HAS_STORAGE / HAS_SYNC + pestañas mock
  render.ts        pintado del canvas (sin lógica de dominio)
  graph/           build (topologías) · style (color/radio) · simulation · hit
  ui/              dom (refs tipadas) · dialog · menu · toast
  lib/             utilidades puras y testeables (utils, tag-utils, storage)
  tabs · sessions · tags · bookmarks · history · search · panels · dialogs · transfer
```

**Reglas de dependencia:**

- `lib/**` es puro: sin DOM, sin `chrome.*`. Es lo único con tests unitarios.
- `ui/**` no importa módulos de dominio (evita ciclos); si necesita lógica,
  la toma de `lib/`.
- Los módulos de dominio **no importan `main.ts`**: piden trabajo al orquestador
  a través de `bus.ts` (`app.rebuild`, `app.requestDraw`, `app.zoomToNodes`…),
  que `main.ts` cablea en el arranque.
- El estado vive en `state.ts` (`S`), no en singletons repartidos por archivo.

## Convenciones

- **TypeScript estricto** — `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `isolatedModules`. Sin `as any`.

## Metodología

Base de desarrollo del proyecto, en orden de autoridad:

1. **Functional core, imperative shell.** Toda decisión no trivial vive en una
   función pura con test (en `lib/` o en un módulo puro tipo `history-range`);
   la cáscara (DOM, canvas, `chrome.*`) solo cablea datos hacia dentro y
   efectos hacia fuera. Al tocar un módulo de cáscara, extrae sus decisiones
   antes de ampliarlo. Ejemplos del patrón: `lib/fit.ts` (encuadre de zoom),
   `lib/drop-rules.ts` (semántica de soltado), `lib/search-score.ts`
   (puntuación del buscador), `lib/session-shape.ts` (captura/restauración),
   `lib/tab-match.ts` (matching de pestañas), `lib/graph-shape.ts` (topología).
2. **Puertos sobre las APIs del navegador.** `chrome.*` se toca solo desde los
   adaptadores (`env.ts`, `lib/storage.ts`, `lib/sync-store.ts`) o desde la
   cáscara del módulo dueño del recurso; la forma de las APIs de Chrome no se
   filtra al modelo interno (los tipos crudos se traducen en la frontera).
3. **El aviso de complejidad de Biome es una alarma, no un ruido.** Si una
   función lo dispara, se descompone o se extrae su decisión — nunca se amplía.
4. **Strategy por vista** (dirección estructural): lo que hoy son condicionales
   de `viewMode` repartidos debe converger en un objeto por vista
   (build/menú/drop/estilo), para que añadir una vista no toque 15 archivos.
- **ESM** (`"type": "module"`), **pnpm**, **Biome** para lint y formato
  (no ESLint/Prettier): 2 espacios, 120 columnas, comillas simples, sin
  punto y coma innecesario, sin comas finales.
- **Conventional commits** en español, y **nunca git sin petición explícita**.
- **Comentarios solo para lo que el código no puede decir**: límites de las
  APIs de Chrome, decisiones de diseño y trampas conocidas. Nada de narrar
  el código línea a línea.
- **Sin silenciar errores**: los `catch` vacíos solo se permiten en degradación
  deliberada y llevan comentario; los fallos que el usuario debe conocer van a
  `toast()`.
- **Degradación en cadena** ante APIs ausentes: `chrome.storage.sync` →
  `chrome.storage.local` → `localStorage`; sin permiso `tabGroups` se agrupa
  igual pero sin metadatos; sin `chrome.*` la preview usa datos mock.

## Internacionalización

Los textos viven en `src/locales/{es,en}.json` (planos, con sustituciones
`$1`). `src/i18n.ts` expone `t(key, ...subs)` y `localizeDom()`, que rellena
los `data-i18n` / `data-i18n-attr` del HTML estático. El build genera además
`_locales/{es,en}/messages.json` en formato Chrome para que el manifest
(`__MSG_extName__`, `__MSG_extDescription__`) y la ficha de la Store se
traduzcan solas. Dentro de la extensión el idioma lo resuelve
`chrome.i18n.getUILanguage()`; en la preview, `navigator.language`.

**Nunca escribas texto visible en el código**: añade la clave a los dos
catálogos y usa `t()`.

## Persistencia

`chrome.storage.sync` (100 KB total, 8 KB/item, 512 items, 1.800 escrituras/h)
sincroniza con la cuenta de Google sin servidores propios. Dos estrategias
según el patrón de escritura:

- **Etiquetas** → buckets por hash (`lib/tag-utils.ts`): se reescribe solo el
  bucket que cambia, que es lo que ahorra cuota de escrituras cuando se
  etiqueta a menudo.
- **Sesiones** → troceado del JSON completo (`lib/sync-store.ts`): se escriben
  raras veces y pueden ser grandes, así que prima la simplicidad.

Ambas escriben siempre el espejo local antes de intentar sync; si la cuota
falla, el dato sobrevive en local y se avisa por `toast`. **Los pins de layout
no se sincronizan a propósito**: dependen del tamaño de pantalla del equipo.

## Comandos

```bash
pnpm install
pnpm build        # esbuild → dist/newtab.js y dist/background.js
pnpm dev          # esbuild --watch
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check
pnpm lint:fix
pnpm test         # vitest (solo lib/ puro)
pnpm verify       # lint + typecheck + test + build (lo mismo que CI)
```

## Self-correction workflow

Después de cada cambio significativo (módulo nuevo, refactor, cambio de tipos):

```bash
pnpm lint && pnpm typecheck
```

Corrige en contexto antes de seguir; no acumules errores hasta el final.

## Testing

Política pragmática (test the seams): se testea **lógica pura y no trivial**
—matching de URLs por prefijo, normalización de rutas, agrupación por dominio,
buckets de sync— no el pintado del canvas ni las APIs de Chrome, que ya están
testeadas por sus autores. El smoke test headless de CI cubre el arranque real
de las cuatro vistas.

## Límites conocidos de Chrome

- **Vistas divididas**: `splitViewId` es de solo lectura; no existe API para
  recrear una división (w3c/webextensions#967). Se captura el dato y, al
  restaurar, el par queda seleccionado. Si algún día aparece `chrome.tabs.split`,
  `sessions.ts` ya lo detecta y lo usa.
- **Permisos en extensiones descomprimidas**: Chrome puede no aplicar permisos
  nuevos del manifest hasta desactivar/reactivar. Por eso `tabGroups` es
  `optional_permissions` y se pide en runtime con gesto de usuario.
- **Módulos ES bajo `file://`**: la preview standalone no puede cargar
  `type="module"`; de ahí el formato IIFE del bundle.
