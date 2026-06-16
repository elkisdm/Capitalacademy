# ⚠️ PENDIENTE DE SEGURIDAD — Los videos de Mux NO están protegidos por pago

> Hallazgo del 2026-06-10 (mientras se diseñaba la plataforma de "Tu Primera App", que reutiliza este flujo Mux). **Acción: resolver cuando vuelvas a este proyecto.** No es urgente-incendio, pero sí es real: hoy cualquiera con el `playback_id` puede ver los videos del curso sin haber pagado ni iniciado sesión.

## El problema en una frase

El reproductor pide los videos a Mux con **URLs directas y SIN token de firma**, y los assets se crean con política `public` cuando no hay clave de firma configurada. Resultado: **el `playback_id` ES la llave**. El gate de acceso vive solo en la página del classroom (auth + enrollment), pero el stream de Mux se sirve por fuera de ese gate.

## La evidencia (en este repo)

- **Reproductor** `components/classroom/video-player.tsx` (~1350 líneas, usa `<video>` + hls.js) construye URLs así:
  - `https://stream.mux.com/{playbackId}.m3u8`
  - fallback `https://stream.mux.com/{playbackId}/high.mp4`
  - poster `https://image.mux.com/{playbackId}/thumbnail.webp`
  
  Ninguna lleva `?token=...`. Si alguien abre devtools, copia el `playbackId` (o la URL `.m3u8`) y la pega en otra pestaña / VLC / la comparte → ve el video. Sin login. Sin enrollment. Sin pagar.

- **Upload** `app/api/admin/mux/upload/route.ts` crea el asset con `playback_policy: [signed]` **solo si existe `MUX_SIGNING_KEY_ID`**; si esa env no está, cae a `public`. Conviene verificar en producción qué política tienen realmente los assets ya subidos (probablemente `public`).

- Existe un camino gateado correcto pero **el player principal NO lo usa**: `app/api/video-proxy/route.ts` autentica + verifica enrollment y proxea el mp4. Es la pista de que la intención era proteger, pero quedó a medias.

- El webhook (`app/api/webhooks/mux/route.ts`) sí valida firma HMAC correctamente — el problema no es el webhook, es el **playback**.

## Por qué importa aquí

266 compradores pagaron por el classroom. Si el contenido es de acceso efectivo público, el valor del producto se erosiona y un competidor o un no-pagador puede republicarlo. Para "Tu Primera App" (donde el video ES el producto de $49) esto se resuelve desde el día 1; en Capital conviene cerrarlo también.

## La solución (qué hacer cuando lo retomes)

1. **Cambiar la política de playback a `signed`** para los assets (los nuevos en el upload; los existentes hay que recrear el playback_id como `signed` vía API de Mux o re-subir).
2. **Configurar las claves de firma** de Mux: `MUX_SIGNING_KEY_ID` + `MUX_SIGNING_PRIVATE_KEY` (base64). El cliente singleton `lib/mux/client.ts` ya acepta `jwtSigningKey`/`jwtPrivateKey`.
3. **Firmar un JWT por reproducción, server-side**, con expiración corta (p. ej. 6 h) y audiencia `v` (video). Mux SDK: `mux.jwt.signPlaybackId(playbackId, { type: 'video', expiration: '6h' })`. Hacerlo en un Server Component / route handler que **primero verifique enrollment** (reusar `lib/classroom/verify-enrollment.ts`), nunca en el cliente.
4. **Pasar el token al player**. La vía más simple y robusta: migrar el player custom a **`@mux/mux-player-react`** (`<MuxPlayer playbackId={id} tokens={{ playback, thumbnail, storyboard }} />`), que maneja HLS, CC, calidad y tokens firmados sin las 1350 líneas propias. Si se quiere conservar el player custom, añadir `?token={jwt}` a las URLs `.m3u8`/thumbnail.
5. **Firmar también thumbnails y storyboards** (image.mux.com / GIF) — con assets `signed` también requieren token, o se rompen las miniaturas.
6. **Repetir para `image.mux.com`** (posters) y para el `video-proxy` (o eliminarlo si ya no hace falta con el player firmado).

## Riesgo de la migración (no romper lo que funciona)

Cambiar a `signed` **rompe** cualquier URL token-less que siga viva (player custom actual, posters, el proxy). Hay que cambiar **las dos puntas a la vez** (política del asset + emisión/uso de tokens), idealmente en una rama, con un asset de prueba primero. Por eso conviene hacerlo con calma, no en caliente.

---

*Nota dejada por el trabajo en `~/Documents/tuprimerapp` (la plataforma nueva nace con playback firmado desde F2). Detalle técnico completo del flujo Mux de este repo en ese proyecto: `tuprimerapp/docs/_fuentes/capitalacademy_mux.md`.*
