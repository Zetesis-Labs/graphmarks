# Graphacker multinavegador — informe de decisiones

**Estado:** capa de datos implementada (`src/browser-port.ts`); eventos,
permisos y runtime siguen en la cáscara de cada módulo. La decisión de producto
se amplía con una edición Safari de pago basada en colecciones cloud.

## Decisión resumida

- **Chrome** es y sigue siendo la plataforma nativa completa.
- **Firefox** ya funciona vía `firefox/` con degradación en cadena; no
  necesita más abstracción para existir.
- **Safari será una edición de pago y un producto distinto**, apoyado en un
  almacén de marcadores propio: las colecciones cloud. No se promete una
  extensión equivalente a Chrome donde las APIs nativas no lo permitan.
- La capa de puertos `BrowserPorts` se hará igualmente como inversión de
  calidad — demo por sustitución de adaptador, tests sin navegador,
  diferencias de Firefox en un solo sitio — pero **no se vende como camino a
  Safari**.

## Estado actual de la abstracción

Lo que ya es puertos y adaptadores:

- `lib/storage.ts` — cadena `chrome.storage.sync` → `local` → `localStorage`
  detrás de `loadStore`/`saveStore`.
- `bookmarks.ts` — interfaz `BookmarksApi` con implementación real y mock en
  memoria.
- `env.ts` — detección de capacidades (`IS_EXT`, `HAS_SYNC`,
  `HAS_FAVICON_API`).
- Tras el refactor *functional core, imperative shell*, la lógica de `lib/`
  es pura y no conoce `chrome.*`.

Con `browser-port.ts` en su sitio, las **fuentes de datos** (árbol de
marcadores, pestañas, ventanas, grupos, historial) pasan por la interfaz
`BrowserPort` con dos adaptadores — chrome y mock — y el modo demo de la guía
es «cambiar el adaptador» en un único punto (`activePort()`).

Queda en cáscara, a conciencia: los listeners de eventos (`main.ts`), los
permisos (`ensureTabGroups`), `runtime.getURL` (favicons, URL propia), la
edición de marcadores (`BookmarksApi`, que ya era un puerto propio) y el
pseudo-calor de la preview (`computeHistory`), que es una elección de
algoritmo, no de fuente de datos.

## Soporte real por navegador

| Capacidad | Chrome | Firefox | Safari |
| --- | :-: | :-: | :-: |
| `chrome_url_overrides.newtab` | ✓ | ✓ | ✗ |
| `bookmarks` | ✓ | ✓ | ✗ |
| `history` | ✓ | ✓ (sin corte de 90 días) | ✗ |
| `tabs` / `windows` / `storage` | ✓ | ✓ | ✓ |
| `tabGroups` | ✓ | ✗ (degradado: sin metadatos) | ✗ |
| Endpoint `/_favicon/` | ✓ | ✗ (degradado: iniciales) | ✗ |
| Vistas divididas (`splitViewId`) | solo lectura | ✗ | ✗ |

Las tres primeras filas son el producto: en Safari no se puede reemplazar la
nueva pestaña, ni leer los marcadores del usuario, ni consultar su historial.
Un puerto perfecto adaptaría a un agujero.

## La capa `BrowserPorts`, cuando toque

Un puerto único con la superficie que la app realmente usa — árbol de
marcadores, edición, pestañas/ventanas, historial, eventos, permisos, i18n,
favicon — y dos adaptadores:

```text
        dominio (puro, lib/)
              │
        BrowserPorts (interfaz)
        ├── adaptador chrome   (extensión real; absorbe las diferencias
        │                       de Firefox en un solo sitio)
        └── adaptador mock     (preview y modo demo; absorbe MOCK_TREE,
                                MOCK_TABS y elimina los checks S.demo
                                repartidos por la cáscara)
```

Beneficios que la pagan sola, sin hablar de Safari:

1. El **modo demo de la guía** pasa de cinco guardas dispersas a «cambia el
   adaptador» en un punto.
2. La franja media (tabs, sesiones, historial) se vuelve **testeable sin
   navegador**: se inyecta el adaptador mock.
3. Las diferencias de Firefox dejan de estar esparcidas.

Coste estimado: una sesión de trabajo — el refactor ya dejó la cáscara fina.

## Safari de pago: decisión de producto, no simple port

Graphacker para Safari será una página o popup con **almacén de marcadores
propio**, donde los del navegador serán una importación cuando las APIs
disponibles lo permitan. Ese almacén son las **colecciones cloud** descritas en
[arquitectura-cloud-sync.md](./arquitectura-cloud-sync.md).

El orden es: validar RxDB y la sincronización cloud → elevar el puerto al nivel
del dominio (los marcadores del navegador como *una fuente más* junto a las
colecciones) → validar OIDC, IndexedDB y ciclo de vida en Safari → empaquetar y
distribuir la edición de pago. Nada de eso empieza por fingir que `chrome.*`
está disponible.

## Orden recomendado

1. `BrowserPorts` como siguiente tanda de calidad, sin urgencia — no bloquea
   ninguna feature.
2. Spike de Safari después de validar las colecciones cloud; no antes.

## Fuentes

- [Safari Web Extensions (Apple)](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Compatibilidad de APIs WebExtensions por navegador (MDN)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)

## Informes relacionados

- [Compartir colecciones: producto y arquitectura](./compartir-colecciones.md)
- [Definición de Free y Pro](./modos-free-pro.md)
