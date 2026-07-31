# Publicar las siguientes versiones sin tocar el dashboard

La primera subida es manual. A partir de ahí, el workflow `release.yml` puede
subir y publicar solo cuando haces `git tag vX.Y.Z && git push --tags`, pero
necesita cuatro secretos. Esto se hace **una vez**.

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

Abre esta URL en el navegador (sustituye `TU_CLIENT_ID`) y acepta:

```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=TU_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

Google te muestra un **código**. Cámbialo por el refresh token:

```bash
curl -s https://oauth2.googleapis.com/token \
  -d client_id=TU_CLIENT_ID \
  -d client_secret=TU_CLIENT_SECRET \
  -d code=EL_CODIGO \
  -d grant_type=authorization_code \
  -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
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

```bash
# sube la versión en package.json y manifest.json, commitea, y luego:
git tag v0.4.0 && git push --tags
```

El workflow construye, empaqueta, crea la release de GitHub con el zip y
—si los secretos están puestos— sube el paquete a la Web Store y lo publica.
Cada versión pasa por la revisión de Google (de unas horas a unos días).

> Si los secretos no existen, el paso se omite sin fallar: solo se crea la
> release de GitHub.
