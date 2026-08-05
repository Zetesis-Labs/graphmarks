# GraphMarks Sharing — informe de decisiones

**Estado:** exploración de producto y arquitectura. No implica trabajo iniciado.

## Decisión resumida

GraphMarks puede evolucionar de un mapa privado de marcadores a una herramienta para **publicar, seguir y editar colecciones de enlaces con otras personas**.

La primera implementación colaborativa debería usar **solo Supabase**:

- Supabase Auth con identidades anónimas para evitar pantallas de registro.
- Postgres y Row Level Security (RLS) para datos, roles y permisos.
- Supabase Realtime para propagar cambios de una colección al instante.
- Una función pequeña de Supabase para aceptar invitaciones de forma segura.
- `chrome.storage.local` o IndexedDB como caché local; `chrome.storage.sync` para las colecciones que un usuario sigue.

No se usarán inicialmente PGlite, Yjs ni Liveblocks. Son buenas herramientas para otros problemas, pero añadirían complejidad, otro servicio o sincronización que este primer caso no necesita.

## Problema y oportunidad

La propuesta inicial era permitir que alguien se suscribiera a los marcadores de otra persona. La formulación útil no es seguir todos los marcadores personales de alguien, sino seguir o colaborar sobre una **colección que esa persona publica explícitamente**.

Ejemplos de colecciones:

- Recursos de frontend e IA.
- Bibliografía de investigación.
- Herramientas para un cliente o proyecto.
- Referencias de diseño.
- Material de una asignatura.

Esto abre dos modos complementarios:

| Modo | Propósito | Permiso normal |
| --- | --- | --- |
| Seguir | Recibir novedades de una colección curada | Solo lectura |
| Colaborar | Mantener una colección entre varias personas | Edición |

El valor no está en cobrar por más colores, filtros o vistas del grafo. Está en que GraphMarks se convierta en un sitio donde descubrir, organizar y mantener recursos compartidos. Antes de diseñar un plan Pro, hay que validar que el círculo «crear → invitar/seguir → guardar o editar → volver» genera uso recurrente.

## Principios de producto

1. **Local y privado por defecto.** Los marcadores, historial y pestañas de cada persona siguen en su navegador.
2. **Compartir es explícito.** Solo se sube la carpeta, tag o colección que el usuario selecciona para compartir.
3. **Colección compartida y marcadores personales son cosas distintas.** Un usuario puede importar un enlace de una colección a sus marcadores, pero la app nunca copia o modifica automáticamente sus marcadores privados.
4. **Sin registro en el primer uso.** Al crear, seguir o aceptar una invitación se genera una identidad anónima técnica; no se pide email ni contraseña.
5. **Una sola dependencia de backend.** Supabase debe cubrir autenticación, base de datos, permisos y tiempo real en la primera versión.
6. **Empezar con datos estructurados.** Una colección es una lista de enlaces, tags y notas breves, no un editor de texto colaborativo.

## Funcionalidad gratuita pendiente: onboarding

GraphMarks necesita un onboarding breve en el primer uso. Es una mejora gratuita
prioritaria e independiente de GraphMarks Sharing: el producto ya tiene muchas
funciones, pero una persona nueva no descubre por sí sola el mapa, la búsqueda,
las vistas, las sesiones ni qué datos permanecen locales.

El onboarding debe ser opcional, saltable y progresivo, no un tutorial largo:

1. Explicar en una pantalla el valor principal: «tu nueva pestaña es un mapa
   editable de tus marcadores».
2. Señalar mediante tres o cuatro pistas interactivas el buscador, las vistas
   Carpetas/Tags/Dominios, el clic derecho para editar y las sesiones.
3. Explicar con claridad que los marcadores privados se mantienen locales y
   que Compartir será siempre una acción explícita.
4. Pedir permisos opcionales solo en el momento de usar la función que los
   requiere; por ejemplo, `tabGroups` al guardar o restaurar sesiones.
5. Poder abrir de nuevo la guía desde ayuda o ajustes.

No debe bloquear el uso: usuarios con muchos marcadores deberían poder cerrar la
guía y explorar su propio grafo inmediatamente. El objetivo es conseguir la
primera acción de valor —buscar, abrir, organizar o guardar una sesión—, no
explicar todas las funciones en una única visita.

## Alcance del MVP colaborativo

### Incluido

- Crear una colección a partir de una carpeta o tag, como snapshot inicial.
- Dar título, descripción e icono a la colección.
- Invitar mediante enlace con rol de lector o editor.
- Ver en vivo altas, cambios, borrados y reordenaciones de enlaces.
- Añadir, editar, etiquetar, mover y borrar enlaces de una colección compartida.
- Mostrar quién hizo el último cambio y cuándo.
- Seguir una colección de solo lectura.
- Guardar selectivamente enlaces compartidos en los marcadores propios.
- Caché local para que la vista abra rápido y funcione con conectividad intermitente.

### Fuera del MVP

- Red social genérica, perfiles, likes o comentarios.
- Algoritmos de recomendación y búsqueda global.
- Marketplace o pagos a creadores.
- Notificaciones push, emails y digests.
- Sincronización automática de todos los marcadores de Chrome.
- Edición de texto rica, presencia de cursores o CRDT.
- Prometer enlaces «no listados» como si fueran privados.

Una colección pública no indexada puede tener un enlace difícil de adivinar, pero no debe venderse como privada. Las colecciones privadas necesitan membresías y permisos reales.

## Arquitectura recomendada

```text
Marcadores privados de Chrome
             │
             │ snapshot inicial / importación explícita
             ▼
     Colección colaborativa en GraphMarks
             │
             ├── Supabase Auth: identidad anónima
             ├── Postgres + RLS: datos, roles, invitaciones
             ├── Realtime: cambios de otros editores
             └── Caché: IndexedDB o chrome.storage.local
```

### Datos

Un modelo inicial pequeño basta:

```text
collections
  id, owner_id, title, description, icon, visibility, created_at, updated_at

collection_members
  collection_id, user_id, role (owner | editor | viewer), joined_at

collection_items
  id, collection_id, url, title, tags, note, position,
  updated_at, updated_by, deleted_at

collection_invites
  id, collection_id, token_hash, role, expires_at, max_uses, revoked_at
```

Los items son filas independientes, no un JSON completo. Así dos personas pueden añadir o editar enlaces diferentes sin pisarse.

### Tiempo real

La extensión se suscribe únicamente a los cambios de `collection_items` de la colección abierta. Recibe eventos `INSERT`, `UPDATE` y `DELETE` de Supabase Realtime y actualiza el estado y el grafo local.

Para una primera comunidad, se puede empezar con **Postgres Changes**, que es el camino más simple. Si en el futuro una colección reúne miles de conexiones simultáneas, Supabase recomienda migrar el fan-out a **Broadcast**.

### Conflictos

No hace falta un sistema de conflictos general en el MVP:

- Añadir items distintos no entra en conflicto porque cada item tiene UUID.
- Editar items distintos tampoco.
- Si dos personas editan el mismo campo de un item, se acepta el último cambio y se muestra que otro miembro lo modificó.
- Borrar será un borrado lógico (`deleted_at`) para poder recuperar o resolver una edición que llegue tarde.
- El reordenamiento usa una columna `position`; las colisiones raras se resuelven con último cambio y una normalización posterior de posiciones.

Si más adelante hay notas largas que varias personas editan al mismo tiempo, se puede añadir Yjs solo para ese campo o tipo de documento.

### Identidad e invitaciones

En la primera interacción relacionada con compartir, GraphMarks llama a `signInAnonymously()` y persiste la sesión dentro del almacenamiento de la extensión. El usuario no ve una cuenta.

El enlace de invitación incluye un token aleatorio. Al abrirlo, la extensión llama a una Edge Function o RPC de Supabase que:

1. Valida el token, su expiración y número de usos.
2. Crea el registro de membresía para el UID anónimo.
3. Devuelve el rol concedido.

Después, RLS permite leer o editar solo las filas de las colecciones de las que esa identidad es miembro. No debe incluirse ninguna clave `service_role` ni secreto administrativo en el bundle de la extensión.

Una identidad anónima se pierde si el usuario borra los datos del navegador o quiere editar desde otro dispositivo. La solución posterior, voluntaria, será vincular email, Google o una clave de recuperación; no forma parte del primer uso.

## Alternativas evaluadas

### Snapshot JSON versionado

Primera opción considerada para una relación de un autor y muchos seguidores: publicar un JSON completo, incrementar una versión y descargarlo cuando cambie.

Es la opción más sencilla para colecciones de solo lectura. Sigue siendo útil para publicación pública, pero no cubre la preferencia actual de edición colaborativa en tiempo real.

### PGlite en el navegador sincronizado con Supabase

PGlite puede persistir Postgres dentro del navegador y servir para consultas locales complejas. No es la herramienta adecuada para el MVP de sincronización.

El plugin de sincronización oficial de PGlite con Electric está en alpha y, actualmente, replica datos hacia PGlite pero no sincroniza las escrituras locales de vuelta ni resuelve conflictos. Añadirlo exigiría crear una cola de cambios, una estrategia de reconciliación y servicios adicionales.

**Decisión:** no usar PGlite inicialmente. Usar IndexedDB o `chrome.storage.local` como caché. Reconsiderarlo solo ante una base local muy grande, búsquedas SQL complejas u offline serio.

### Yjs

Yjs es un CRDT excelente para edición concurrente de documentos complejos y puede sincronizar cambios sin conflictos. Para funcionar entre usuarios necesita un proveedor de red y persistencia: WebSocket, WebRTC o un servicio gestionado.

Para una lista estructurada de enlaces, introducir Yjs antes de necesitar edición rica añade más modelo de datos, bundle y operaciones de sincronización de los necesarios.

**Decisión:** no usar Yjs en el MVP. Evaluarlo para notas colaborativas largas, edición offline multiautor o una experiencia tipo documento.

### Liveblocks

Liveblocks ofrece Yjs gestionado: elimina la operación de WebSockets, persistencia y presencia. Sin embargo, es un segundo proveedor, una segunda cuota potencial y necesita un endpoint de autorización para salas privadas.

Usar una clave pública evita ese endpoint solo para prototipos o salas completamente públicas; Liveblocks advierte que permite a usuarios finales acceder a los datos de cualquier sala. Por tanto no es adecuado para colecciones privadas.

**Decisión:** no usar Liveblocks mientras Supabase Realtime resuelva el caso.

### WebRTC o relays descentralizados

Se consideraron implícitamente como forma de eliminar backend. No son una buena base para una función de equipo: WebRTC necesita señalización y no aporta persistencia fiable; relays descentralizados incorporan problemas de moderación, disponibilidad, descubrimiento y spam.

**Decisión:** no usar en el MVP.

## Coste y operación

Supabase Free permite validar esta funcionalidad sin pagar como desarrollador. En el momento de redactar este informe incluye dos proyectos activos, 500 MB de base de datos por proyecto, 5 GB de egress mensual, 50.000 MAU y 500.000 invocaciones de Edge Functions.

Es suficiente para una beta de colecciones de enlaces. Hay dos advertencias:

- Un proyecto Free con actividad insuficiente puede pausarse tras siete días; Supabase avisa y permite reanudarlo desde el panel.
- No se debe crear tráfico artificial solo para impedir la pausa. Si el producto necesita disponibilidad permanente, ese será el momento de pasar a un plan de pago.

No se requiere una segunda plataforma de tiempo real ni un servidor propio. Una web pública estática para las páginas de colección puede desplegarse separadamente, pero tampoco necesita servidor de aplicación.

## Impacto en privacidad y comunicación

GraphMarks declara actualmente que no hace peticiones de red y que todos los datos viven en el navegador. La función de compartir cambia esa afirmación.

Antes de publicarla hay que actualizar:

- README y ficha de tiendas.
- Política de privacidad y divulgación de permisos/datos.
- Interfaz de publicación, explicando exactamente qué se enviará.

La promesa nueva debe ser precisa:

> Los marcadores, pestañas e historial siguen siendo locales. Solo se envía a GraphMarks Sharing el contenido de las colecciones que decides publicar o a las que te unes.

## Orden de implementación recomendado

1. Crear proyecto Supabase, tablas, índices y políticas RLS.
2. Añadir cliente Supabase y sesión anónima aislados en un módulo propio.
3. Implementar crear colección, listar las propias y añadir items.
4. Dibujar la colección compartida en GraphMarks sin tocar marcadores privados.
5. Activar Realtime para altas, cambios y borrados de items.
6. Implementar invitaciones con una Edge Function o RPC segura.
7. Añadir roles viewer/editor/owner y revocación de accesos.
8. Añadir seguimiento de colecciones públicas y guardado selectivo en los marcadores propios.
9. Actualizar textos de privacidad, soporte e incorporación de usuario.
10. Medir uso antes de construir descubrimiento, pagos, comentarios o IA.

## Decisiones abiertas

- ¿El primer lanzamiento prioriza colecciones privadas colaborativas, públicas de solo lectura, o ambas?
- ¿Cuándo se pedirá vincular una identidad permanente para evitar perder el control de una colección al borrar datos locales?
- ¿Las colecciones públicas aparecen en un directorio o solo se accede a ellas mediante enlace?
- ¿Cuál será el límite de tamaño razonable de una colección y cómo se presentará su historial?
- ¿Qué acciones sobre una colección colaborativa deben reflejarse en los marcadores locales: ninguna automática, importación manual o una regla configurable?
- ¿Qué modelo comercial se probará después de validar uso: equipos privados, colecciones de pago o comisión para curadores?

## Fuentes técnicas

- [Supabase Auth: usuarios anónimos](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Realtime: Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Realtime: Broadcast y cambios de base de datos](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Free: cuotas y facturación](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Free: pausa por inactividad](https://supabase.com/docs/guides/platform/free-project-pausing)
- [PGlite: sincronización con Electric](https://pglite.dev/docs/sync)
- [Yjs: introducción y proveedores](https://docs.yjs.dev/)
- [Liveblocks: autenticación cliente](https://liveblocks.io/docs/api-reference/liveblocks-client)
