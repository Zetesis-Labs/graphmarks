# Publicar las siguientes versiones sin tocar el dashboard

La primera subida es manual. A partir de ahí el ciclo lo lleva **release-please**
(conventional commits → PR de versión → al mergearla: tag, release de GitHub
con el zip y, si los secretos existen, publicación en la Web Store). Los
secretos solo hacen falta para el último paso y se configuran **una vez**;
sin ellos, el zip queda en la release y se arrastra al dashboard a mano.

## 1. Habilitar la API

1. Entra en <https://console.cloud.google.com> y crea un proyecto (o usa uno).
2. **APIs y servicios → Biblioteca** → busca **Chrome Web Store API** → Habilitar.
3. **Pantalla de consentimiento OAuth** → tipo *Externo* → rellena nombre y
   correo → en «Usuarios de prueba» **añade tu propia cuenta de desarrollador**
   (si la app queda «en pruebas», el refresh token caduca a los 7 días: para
   evitarlo, publica la pantalla de consentimiento).
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** →
   tipo **Aplicación de escritorio**. Apunta el **Client ID** y el
   **Client secret**.

## 2. Conseguir el refresh token

> El flujo OOB (`urn:ietf:wg:oauth:2.0:oob`) que circula por muchas guías está
> **muerto desde 2023**; el vigente para clientes de escritorio es loopback.

**Camino fácil** — la herramienta de fregante hace el baile entero y te
imprime los tres valores:

```bash
npx chrome-webstore-upload-keys
```

**Camino manual (loopback)** — abre esta URL (sustituye `TU_CLIENT_ID`) y acepta:

```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=TU_CLIENT_ID&redirect_uri=http://localhost:8818
```

El navegador acabará en `http://localhost:8818/?code=…` (dará «conexión
rechazada»: da igual, el código va en la barra de direcciones). Cámbialo:

```bash
curl -s https://oauth2.googleapis.com/token \
  -d client_id=TU_CLIENT_ID \
  -d client_secret=TU_CLIENT_SECRET \
  -d code=EL_CODIGO \
  -d grant_type=authorization_code \
  -d redirect_uri=http://localhost:8818
```

De la respuesta guarda `refresh_token` (no caduca mientras la app OAuth siga
publicada y no revoques el acceso).

## 3. Guardar los secretos en GitHub

```bash
gh secret set CWS_CLIENT_ID     --repo Zetesis-Labs/graphmarks
gh secret set CWS_CLIENT_SECRET --repo Zetesis-Labs/graphmarks
gh secret set CWS_REFRESH_TOKEN --repo Zetesis-Labs/graphmarks
gh secret set CWS_EXTENSION_ID  --repo Zetesis-Labs/graphmarks   # el ID de la URL del dashboard
```

## 4. Publicar

Nada de tags ni bumps a mano: con cada merge a `main` de commits `feat:`/`fix:`,
release-please abre (o actualiza) una **PR de release** con la versión y el
CHANGELOG. Publicar es **mergear esa PR**: el workflow crea el tag y la release,
construye, adjunta el zip y —si los secretos están puestos— sube y publica en
la Web Store. Cada versión pasa por la revisión de Google (horas a días).

> Si los secretos no existen, el paso de la Store se omite sin fallar: el zip
> queda en la release de GitHub para arrastrarlo al dashboard a mano.
