# Graphacker Cloud Sync — informe de decisión técnica

**Estado:** decisión vigente para el MVP. No implica que la implementación esté iniciada.

**Fecha:** 8 de agosto de 2026.

Este informe reemplaza las decisiones técnicas basadas en Supabase de
[`compartir-colecciones.md`](./compartir-colecciones.md) y las partes de infraestructura de
[`modos-free-pro.md`](./modos-free-pro.md) y [`cobros-shared.md`](./cobros-shared.md). Las decisiones de producto y
precio que no dependan de Supabase siguen siendo válidas.

## Decisión resumida

La primera sincronización cloud de Graphacker utilizará:

```text
Extensión
  └─ RxDB sobre almacenamiento local
        ↕ push / pull / stream
Graphacker Server
  ├─ TypeScript
  ├─ Hono
  ├─ Bun
  └─ validación OIDC contra Zetesis-Auth
        ↕ SQL
PostgreSQL
```

- **RxDB** será la base local-first de las colecciones cloud y gestionará persistencia local, reactividad, reintentos,
  checkpoints y reconciliación.
- **Graphacker Server** expondrá la API de control y los tres elementos de replicación: push, pull y avisos de cambio.
- **PostgreSQL** será la fuente autoritativa del backend y conservará los elementos como filas relacionales.
- **Zetesis-Auth**, el Keycloak existente, será el único proveedor de identidad.
- **Yjs + Hocuspocus** se aplaza. Podrá añadirse en el futuro para contenido que necesite CRDT colaborativo, pero no se
  considera una migración automática desde RxDB.

## Límites de producto

### Graphacker gratuito

- No requiere cuenta.
- Continúa trabajando con los marcadores nativos del navegador.
- Conserva la sincronización que ya ofrece el navegador y `chrome.storage.sync`.
- No envía el árbol privado de marcadores a Graphacker Server.

### Cuenta autenticada

No existirá una cuenta cloud gratuita. La cuenta sirve para:

- gestionar la suscripción;
- crear y sincronizar colecciones cloud entre navegadores;
- gestionar miembros, invitaciones y permisos;
- habilitar posteriormente funciones colaborativas.

Los marcadores nativos y las colecciones cloud son dominios distintos. Importar o exportar entre ambos será una acción
explícita del usuario, no una reconciliación automática de árboles.

### Safari de pago

- Graphacker tendrá una edición para Safari exclusivamente de pago.
- Requerirá cuenta autenticada y suscripción activa.
- Su fuente de datos principal serán las colecciones cloud sincronizadas mediante RxDB y Graphacker Server.
- No se promete paridad con Chrome en APIs de marcadores, historial, nueva pestaña, favicons o grupos hasta validar las
  capacidades actuales de Safari Web Extensions.
- Cuando una API nativa no exista, la colección cloud actuará como almacén propio y la entrada o salida de datos será una
  importación o exportación explícita.
- El empaquetado, autenticación OIDC, almacenamiento RxDB y ciclo de vida en Safari requieren un spike específico antes
  de fijar el alcance de la primera versión.

## Identidad y autorización

- Flujo OIDC Authorization Code con PKCE.
- Emisor: Zetesis-Auth.
- La extensión guarda su sesión en `chrome.storage.local`, nunca en `chrome.storage.sync`.
- Graphacker Server valida `issuer`, firma, audiencia, expiración y `subject` del access token.
- La identidad interna se vincula mediante la pareja `(issuer, subject)`; no se utiliza el email como clave estable.
- Los permisos efectivos (`owner`, `editor`, `viewer`) se resuelven en Graphacker Server contra PostgreSQL.
- PostgreSQL nunca se expone directamente a la extensión.

## Backend

### Tecnología

- TypeScript para compartir lenguaje, contratos y herramientas con la extensión.
- Hono para la API HTTP.
- Bun como runtime.
- Contenedor Docker desplegado inicialmente cerca de PostgreSQL.
- API HTTP JSON tipada; no GraphQL.

No se utilizarán inicialmente Go, Supabase, funciones Lambda, Redis, S3 ni un servicio de tiempo real adicional.

### Dos superficies de API

#### API de control

Gestiona datos que no necesitan replicación local-first completa:

```text
/me
/subscription
/collections
/collections/:id/members
/collections/:id/invitations
```

#### API de sincronización RxDB

Proporciona:

```text
push        lotes de escrituras locales
pull        cambios posteriores a un checkpoint
pullStream  aviso de cambios o señal RESYNC mediante SSE
```

La UI escribe primero en RxDB. La replicación llama a la API en segundo plano; los componentes no realizan peticiones de
red para cada edición.

## Persistencia local

RxDB se utilizará únicamente donde el modo offline aporta valor:

- colecciones cloud;
- carpetas internas de esas colecciones;
- marcadores o items;
- tags y ordenación;
- tombstones necesarios para replicación.

La cuenta, el estado de Stripe y la administración de invitaciones se consultan mediante la API de control. No se pretende
convertir todo el estado de la extensión en RxDB.

El adaptador concreto de RxDB sobre IndexedDB se decidirá mediante una prueba pequeña; la preferencia inicial es el
adaptador Dexie. El acceso a RxDB quedará detrás de un puerto de dominio para que la UI no dependa de su API.

## Modelo de datos del backend

Modelo inicial orientativo:

```text
users
  id, issuer, subject, created_at

subscriptions
  user_id, provider_customer_id, provider_subscription_id,
  status, current_period_end, updated_at

collections
  id, owner_id, name, description, version,
  created_at, updated_at, deleted_at

collection_members
  collection_id, user_id, role, created_at

collection_invitations
  id, collection_id, token_hash, role,
  expires_at, revoked_at, created_at

collection_folders
  id, collection_id, parent_id, name, position,
  version, updated_at, updated_by, deleted_at

collection_items
  id, collection_id, folder_id, url, title, note,
  position, version, updated_at, updated_by, deleted_at

collection_item_tags
  collection_id, item_id, tag,
  version, updated_at, updated_by, deleted_at
```

El esquema definitivo se fijará con las consultas y operaciones reales; esta lista establece la propiedad relacional, no
obliga a implementar cada tabla antes de necesitarla.

## Identificadores, checkpoints y borrados

- Colecciones, carpetas e items usan UUID generados en el cliente.
- `chrome.bookmarks.id` nunca es la identidad cloud: es local a cada navegador.
- Cada navegador podrá conservar un mapeo entre UUID cloud e ID local cuando el usuario importe un elemento.
- El checkpoint de pull será una pareja estable como `(updated_at, id)` o un cursor monotónico equivalente.
- Los borrados se replican como tombstones (`deleted_at`) y se purgan después de una ventana de seguridad.
- Push debe ser idempotente: reenviar un lote no puede duplicar ni corromper datos.
- El servidor detecta escrituras basadas en una versión obsoleta y devuelve el estado autoritativo esperado por RxDB.

## Conflictos del MVP

- Altas de items distintos se combinan naturalmente mediante UUID.
- Cambios sobre items distintos no interfieren.
- Para el mismo documento se empezará con la política autoritativa de RxDB: gana el estado maestro y el cliente se
  reconcilia.
- Los borrados no son físicos durante la ventana de replicación.
- La ordenación se tratará como una operación de dominio y se normalizará cuando existan posiciones equivalentes.

Antes de introducir reglas por campo se medirá si los conflictos reales lo justifican. El plugin CRDT de RxDB es una
posible evolución para operaciones estructuradas, pero no forma parte del MVP.

## Tiempo real y Manifest V3

- SSE no es la fuente de verdad: solo avisa a RxDB de que debe ejecutar pull.
- Perder la conexión no pierde datos; el siguiente pull usa el checkpoint local.
- La extensión no dependerá de mantener permanentemente vivo el service worker.
- La replicación se activa al abrir Graphacker, al realizar cambios y cuando el runtime de la extensión vuelva a estar
  disponible.
- Se probarán Chrome y Firefox porque sus ciclos de vida de extensiones no son idénticos.
- Safari tendrá una matriz de compatibilidad y pruebas propias; no se asumirá que comparte el runtime de Chrome o
  Firefox.

## Evolución hacia Yjs y Hocuspocus

Yjs y Hocuspocus no se añaden a la primera versión. Hay dos evoluciones válidas:

1. **Agregado:** RxDB continúa gestionando colecciones y marcadores; Yjs se usa solo para notas ricas, comentarios,
   documentos u otras superficies realmente colaborativas.
2. **Migración deliberada:** una colección relacional se exporta a un `Y.Doc`, se bloquean clientes antiguos y se cambia
   la fuente de verdad. Es viable por los UUID y el puerto de dominio, pero requiere despliegue y migración específicos.

No se diseñará el MVP suponiendo que la segunda opción será automática. Si la colaboración sobre toda la colección se
convierte en el núcleo del producto, deberá reevaluarse antes de ampliar el protocolo RxDB.

## Cobros

Se mantiene la decisión de Stripe directo con checkout alojado y portal del cliente. La diferencia respecto al informe
anterior es operativa:

- Graphacker Server crea las sesiones de Checkout y portal.
- El webhook de Stripe llega a Graphacker Server.
- PostgreSQL almacena el entitlement.
- Las claves secretas de Stripe solo existen en el servidor.

La elección final de precio, fiscalidad y momento de activación continúa siendo una decisión de producto.

## Privacidad y Stores

Antes de publicar cuentas o sincronización cloud hay que actualizar:

- política de privacidad;
- README y páginas de soporte;
- fichas de Chrome Web Store y Firefox Add-ons;
- explicación dentro de la extensión de qué datos se envían.

La promesa será:

> Los marcadores, pestañas e historial personales permanecen en el navegador. Graphacker solo envía las colecciones cloud
> que el usuario crea o a las que se une.

## Alternativas descartadas para el MVP

- **Supabase Auth:** sustituido por Zetesis-Auth.
- **Supabase como plataforma:** no está desplegado y ya no aporta una simplificación suficiente.
- **Go:** no ofrece una ventaja que compense separar el stack y la experiencia de desarrollo.
- **Electric + PGlite:** resuelve principalmente el camino PostgreSQL → cliente; mantiene un write-path propio y añade
  peso e infraestructura.
- **Zero:** no encaja con el requisito offline tal como se ha evaluado.
- **Yjs + Hocuspocus ahora:** aporta colaboración CRDT, pero cambia el contenido a documentos binarios y se aplaza hasta
  validar la necesidad.
- **API CRUD directa desde la UI:** es más pequeña, pero obliga a reconstruir persistencia offline, cola, reintentos,
  checkpoints y reconciliación que RxDB ya proporciona.

## Orden de implementación

1. Crear Graphacker Server con Hono, Bun, configuración y healthcheck.
2. Integrar Zetesis-Auth y validar tokens desde la extensión.
3. Crear PostgreSQL, migraciones y tablas de identidad, colecciones y membresías.
4. Implementar la API de control con contratos compartidos.
5. Introducir RxDB detrás del puerto de colecciones cloud.
6. Implementar push y pull con checkpoints, tombstones e idempotencia.
7. Añadir SSE como invalidación y reconexión segura.
8. Probar sincronización offline entre Chrome y Firefox.
9. Implementar invitaciones, revocación y roles.
10. Integrar Stripe cuando el flujo cloud esté validado.
11. Crear el spike de Safari Web Extensions sobre las colecciones cloud y definir su empaquetado de pago.

## Criterios de validación

- Dos navegadores convergen después de crear y editar items distintos.
- Un navegador puede trabajar offline y sincronizar al volver.
- Reenviar un push no duplica operaciones.
- Un pull paginado no pierde cambios con la misma marca temporal.
- Editar y borrar concurrentemente produce un resultado determinista.
- Una extensión reiniciada continúa desde su checkpoint.
- Un token expirado se renueva o produce una salida controlada.
- Revocar una membresía bloquea nuevos pulls y pushes.
- Un viewer nunca puede escribir aunque manipule el cliente.
- El producto gratuito continúa funcionando sin servidor ni cuenta.
- Safari rechaza el acceso cloud sin una suscripción válida y conserva datos locales ante cortes de red.

## Decisiones todavía abiertas

- Proveedor o instalación concreta de PostgreSQL y estrategia de backups.
- Adaptador definitivo de almacenamiento RxDB en la extensión.
- Política de conflictos por campo si el comportamiento maestro gana resulta insuficiente.
- Límites de tamaño, miembros y retención de tombstones por colección.
- Alcance inicial de colecciones públicas frente a privadas.
- Métricas que justificarían introducir CRDT, Yjs o Hocuspocus.
- Capacidades nativas, distribución, requisitos de App Store y alcance exacto de la edición Safari.
