# GraphMarks Shared — informe de cobros

**Estado:** decisión de enfoque. No implica integración iniciada.

## Decisión resumida

Para cobrar por GraphMarks Shared se usará, de momento, **Stripe directo** con
checkout alojado y suscripciones. No se construirá un marketplace, no habrá
pagos a curadores ni Stripe Connect.

El producto que se vende es una suscripción de GraphMarks al propietario de un
workspace colaborativo. Ese propietario puede invitar a lectores o editores sin
que los invitados tengan que pagar.

```text
Colecciones públicas y seguir colecciones       → gratis
Workspace privado y colaborativo                → lo paga el propietario
Miembros invitados                              → incluidos por workspace
```

## Por qué no usar Lemon Squeezy inicialmente

Lemon Squeezy simplifica impuestos internacionales al actuar como *merchant of
record*, pero su coste base de 5 % + 0,50 USD por transacción es demasiado alto
para un ticket mensual bajo.

Ejemplo orientativo para 6 €:

| Proveedor / modalidad | Comisión de cobro aproximada |
| --- | ---: |
| Lemon Squeezy: 5 % + 0,50 | 0,80 € |
| Stripe: tarjeta estándar EEE, 1,5 % + 0,25 € | 0,34 € |

Las cifras no incluyen posibles costes de impuestos, tarjetas internacionales,
divisa o herramientas adicionales. El objetivo de la comparación es mostrar
que el componente fijo de 0,50 penaliza especialmente una suscripción pequeña.

## Modelo de precio inicial

Se prefiere empezar con **cobro anual**, no mensual:

- Reduce el efecto de la comisión fija por transacción.
- Reduce impagos, cancelaciones y soporte.
- Es más simple de explicar: un workspace compartido anual.
- Da tiempo para validar si el uso colaborativo se mantiene durante meses.

Hipótesis iniciales a testar:

- Founder / beta: 29 € al año.
- Precio normal: 39–49 € al año por workspace.
- El número de editores incluidos se definirá después de observar el uso real.

El pago mensual puede añadirse más adelante si los usuarios lo solicitan. No es
necesario para validar el modelo.

## Arquitectura sin servidor propio

No se administrará una VM, Docker, procesos, WebSockets ni infraestructura de
pagos. Se usarán servicios gestionados:

```text
GraphMarks
   │
   ├── Supabase
   │    ├── Auth anónimo
   │    ├── Postgres, RLS y Realtime
   │    └── Edge Functions
   │
   └── Stripe
        ├── Checkout alojado
        ├── Facturación recurrente
        ├── Portal de cliente
        └── Eventos de pago (webhooks)
```

Supabase Edge Functions son endpoints serverless gestionados: hay que escribir
unas funciones pequeñas, pero no mantener un servidor.

## Flujo de cobro

```text
Owner pulsa «Hacer privado este workspace»
        ↓
Supabase Edge Function crea una Checkout Session de Stripe
        ↓
Stripe Checkout cobra y muestra recibo
        ↓
Stripe llama al webhook de Supabase
        ↓
Supabase marca el workspace como activo
        ↓
RLS permite la funcionalidad de pago
```

El flujo de cancelación es el inverso: Stripe avisa por webhook, Supabase
guarda el final del periodo ya pagado y, al vencer, el workspace pasa a modo
solo lectura o deja de permitir nuevas invitaciones.

## Funciones serverless mínimas

### `create-checkout-session`

- Requiere una sesión anónima válida de Supabase.
- Recibe el `workspace_id`.
- Comprueba que el usuario es owner.
- Crea una Stripe Checkout Session con ese `workspace_id` en metadata.
- Devuelve la URL de checkout alojado por Stripe.

### `stripe-webhook`

- Verifica la firma del webhook de Stripe.
- Procesa pago inicial, renovación, impago, cancelación y actualización.
- Guarda el estado efectivo del entitlement.
- Debe ser idempotente: el mismo evento puede llegar más de una vez.

### `create-customer-portal-session`

- Requiere ser owner del workspace.
- Crea una sesión del portal de cliente de Stripe.
- Permite cambiar tarjeta, cancelar o consultar facturas sin construir esa UI.

## Datos mínimos

```text
workspace_entitlements
  workspace_id
  stripe_customer_id
  stripe_subscription_id
  status
  current_period_end
  updated_at
```

La autorización de la aplicación no confía en que el cliente diga que pagó. Las
políticas RLS y/o las funciones consultan `workspace_entitlements` y permiten
acciones premium solo si `status = active` y el periodo no ha vencido.

Nunca se expone una clave secreta de Stripe en la extensión. Las claves secretas
y el secreto de firma del webhook viven únicamente en los secretos de Supabase
Edge Functions.

## Lo que explícitamente no se va a construir

- Marketplace de colecciones.
- Cobro y reparto de dinero a curadores.
- Stripe Connect.
- Onboarding KYC de vendedores.
- Payouts, saldos de terceros, comisiones de plataforma o gestión de disputas
  de vendedores.

Si algún día GraphMarks vende contenido de terceros, será una decisión de
producto y negocio separada. Stripe Connect está pensado para ese tipo de
marketplace, pero añade onboarding de vendedores, pagos a terceros, riesgos y
responsabilidades que no son necesarias ahora.

## Impuestos: límite de la simplificación

Con Stripe directo, GraphMarks es quien vende el servicio. Stripe procesa el
cobro, pero no sustituye la gestión fiscal propia.

- Stripe Tax puede calcular y recaudar impuestos.
- La modalidad Tax Basic añade actualmente un 0,5 % en integraciones no-code
  donde exista registro fiscal.
- La presentación y remesa fiscal completa tiene productos y costes adicionales.

Antes de vender internacionalmente hay que hablar con una gestoría sobre IVA y
OSS desde España. Durante una beta pequeña, esta carga puede compensar el ahorro
frente a un merchant of record; al escalar o vender globalmente conviene volver
a comparar Stripe directo con Paddle o Lemon Squeezy.

## Próximos pasos, cuando se implemente

1. Abrir cuenta Stripe y crear un producto anual de prueba.
2. Crear tablas de entitlement en Supabase.
3. Implementar las tres Edge Functions y sus secretos.
4. Probar Checkout y webhooks con el modo test de Stripe.
5. Comprobar que la cancelación conserva acceso hasta el final del periodo.
6. Preparar términos, reembolsos, facturación y revisión fiscal antes de
   activar cobros reales.

## Fuentes

- [Stripe: tarifas en España](https://stripe.com/es/pricing)
- [Stripe Tax: precios](https://stripe.com/en-es/tax/pricing)
- [Stripe Tax: explicación de tarifas](https://support.stripe.com/questions/understanding-stripe-tax-pricing?locale=es-ES)
- [Lemon Squeezy: tarifas](https://docs.lemonsqueezy.com/help/getting-started/fees)
- [Lemon Squeezy: merchant of record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record)
- [Stripe Connect: plataformas y marketplaces](https://docs.stripe.com/connect)
