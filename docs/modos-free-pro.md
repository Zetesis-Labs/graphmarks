# Graphacker — definición inicial de Free y Pro

**Estado:** decisión de producto. La arquitectura Supabase descrita aquí ha sido reemplazada por
[`arquitectura-cloud-sync.md`](./arquitectura-cloud-sync.md). Teams queda fuera de alcance.

## Principio de segmentación

Graphacker no limita la organización personal ni convierte las funciones ya
existentes en un peaje. La distinción es natural:

> Lo personal y lo público es Free; la privacidad y colaboración de un espacio
> compartido son Pro.

## Graphacker Free

Free incluye el producto personal completo:

- Grafo de marcadores y carpetas.
- Vistas de Carpetas, Tags y Dominios.
- Búsqueda, edición y organización de marcadores.
- Pestañas abiertas, sesiones, historial local, importación y exportación.
- Etiquetas, layout y sincronización de Chrome que ya ofrece la extensión.
- Onboarding breve, opcional, saltable y disponible de nuevo desde ayuda.

También incluye la capa pública de Sharing:

- Crear una colección pública a partir de una selección explícita de enlaces.
- Compartir el enlace de una colección pública.
- Seguir colecciones públicas de otras personas.
- Ver novedades de las colecciones seguidas.
- Guardar manualmente enlaces de una colección seguida en los propios
  marcadores.

Free no sincroniza automáticamente los marcadores privados con colecciones
compartidas. La privacidad se mantiene por defecto: solo se publica aquello que
el usuario selecciona conscientemente.

## Graphacker Pro / Shared

Pro habilita un workspace privado y colaborativo. La suscripción pertenece al
owner del workspace; sus invitados no necesitan pagar.

Incluye:

- Crear workspaces privados.
- Crear colecciones privadas dentro del workspace.
- Invitar personas con enlaces seguros.
- Roles `owner`, `editor` y `viewer`.
- Añadir, editar, etiquetar, mover y borrar enlaces de forma colaborativa.
- Actualización en tiempo real mientras la colección está abierta.
- Gestión de miembros y revocación de accesos.
- Historial básico de última modificación: quién hizo el cambio y cuándo.
- Importación manual y selectiva a los marcadores personales de cada miembro.

La colaboración se implementa con Supabase Postgres, RLS y Realtime. Cada
enlace es un item independiente; no habrá sincronización bidireccional con las
carpetas privadas de Chrome ni CRDT/Yjs en la primera versión.

## Cobro de Pro

- Stripe directo y checkout alojado.
- Cobro anual por workspace, no por miembro inicialmente.
- El owner gestiona la suscripción desde el portal de Stripe.
- Supabase guarda el entitlement y aplica el acceso al workspace.
- Una cancelación conserva acceso hasta el final del periodo pagado; después el
  workspace pasa a modo solo lectura o deja de admitir nuevas invitaciones.

El detalle técnico y fiscal está en
[cobros-shared.md](./cobros-shared.md).

## Límites explícitos de la primera versión

No pertenecen ni a Free ni a Pro por ahora:

- Teams, organizaciones, directorio corporativo o facturación centralizada.
- SSO, SCIM, compliance o auditoría avanzada.
- Marketplace, pagos a curadores, Stripe Connect o reparto de ingresos.
- Perfiles sociales, likes, comentarios, recomendación o búsqueda global.
- Edición offline multiautor, cursores, presencia o merge CRDT.
- Sincronización automática de todos los marcadores de Chrome.

## Posicionamiento resumido

```text
Graphacker Free
  Tu mapa privado y colecciones públicas para descubrir recursos.

Graphacker Pro / Shared
  Espacios privados donde un grupo mantiene recursos juntos.
```

## Informes relacionados

- [Compartir colecciones: producto y arquitectura](./compartir-colecciones.md)
- [Cobros de Graphacker Shared](./cobros-shared.md)
