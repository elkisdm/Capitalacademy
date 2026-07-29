# Consolidar el acceso: auto-servicio + trazabilidad de los correos de acceso

**Clasificación**: `feat` · medium · **riesgo alto** (auth + migración) · known · toca `app/(auth)/`, `app/onboarding/`, `app/api/auth/`, `app/api/webhooks/`, `lib/email/`, `db/migrations/`
**Tier**: 3 — Full (el riesgo alto lo fuerza; la exploración ya está hecha, ver *Hallazgos*)
**Fecha**: 2026-07-29

---

## Goal

Que toda persona ya ingresada en la plataforma pueda entrar por sí sola —tenga o no
contraseña, y aunque su invitación haya vencido— sin escribirle a nadie. Y que el equipo
pueda responder con evidencia "¿le llegó el correo?" en vez de adivinar.

Hoy hay **312 personas** que nunca activaron su cuenta (150 en el *I Ciclo — 2026*, que
corre hasta el 18-ago; 200 en el *Workshop Inmobiliario — Mayo*): sin `email_confirmed_at`,
sin contraseña y sin un solo inicio de sesión. El login les pide una contraseña que nunca
existió.

## Hallazgos de la exploración

Verificado end-to-end contra producción (`capitalacademy.cl`, deploy publicado `cc1dc4f`):

1. **La mecánica funciona.** `generate_link recovery` → `/auth/confirm` → cookie de sesión
   → `/onboarding/set-password` → contraseña → login. Probado con el caso más adverso
   (usuario invitado, sin confirmar, sin contraseña): pasa entero. Resend entregó el 100%
   de los 24 correos de "Restablecer contraseña" de los últimos 8 días, y 21 de 23 personas
   completaron el reset. **El problema es de encuadre y de caminos, no de mecánica.**
2. **El bug de la captura ya está corregido.** El doble mensaje ("Ocurrió un error" sobre
   "Email o contraseña incorrectos") solo existía antes de `4987dc9`, en producción desde
   el 24-jul. La captura reenviada es del 22-jul 18:52 hora de Chile.
3. **Hay un camino zombie en `set-password`.** El formulario busca `?code=` y llama
   `exchangeCodeForSession`, pero ni `send-invitation` ni `forgot-password` mandan `code`:
   ambos pasan por `/auth/confirm?token_hash=…`, que consume el token antes de redirigir.
   Cuando la cookie no llega, el usuario lee *"Enlace de invitación inválido o expirado —
   contacta al administrador"*, que ni describe lo que pasó ni le da salida.
4. **El fallo de envío es mudo.** `app/api/auth/forgot-password/route.ts` responde
   `ok: true` tanto si Resend falla (`catch { console.error }`) como si `generateLink`
   falla. La UI siempre dice "Enlace enviado". No queda registro de nada.

## Assumptions made (corrígeme si alguna está mal)

- El enlace único de acceso se sigue emitiendo con `type: 'recovery'`, también para quien
  nunca tuvo contraseña — está verificado que GoTrue lo acepta y que confirma el email al
  fijar la clave. No hace falta distinguir invitación de recuperación de cara al alumno.
- **La respuesta al usuario sigue siendo genérica** ("si existe una cuenta…") aunque el
  envío falle. Devolver un 502 delataría qué correos existen; la verdad va al ledger y al
  aviso interno, no a la pantalla.
- El ledger registra también los intentos con correo inexistente (`status: 'no_account'`),
  porque el caso de soporte más común es que la persona escriba mal su correo. Queda
  cerrado por RLS a staff, igual que `session_reminder_recipients` (0075).
- El camino `?code=` **se conserva** como fallback aunque hoy esté muerto: quitarlo no
  aporta y rompería cualquier correo antiguo con `action_link` nativo de Supabase.
- La cuenta de Resend es compartida entre proyectos de Capital Inteligente, así que el
  webhook filtra por dominio remitente antes de escribir en el ledger.

## Acceptance criteria

- [ ] Desde el login, quien nunca tuvo contraseña encuentra su camino sin interpretar la
      palabra "olvidaste": un solo enlace cubre activar cuenta y recuperar acceso.
- [ ] La pantalla de contraseña, cuando el enlace ya se usó o venció, **pide uno nuevo ahí
      mismo** en vez de mandar a contactar al administrador.
- [ ] Un usuario invitado sin confirmar y sin contraseña completa el circuito entero y
      queda dentro del classroom.
- [ ] Cada solicitud de enlace de acceso queda registrada con su desenlace: enviado,
      falló el envío, o no había cuenta.
- [ ] Cuando Resend confirma entrega o rebote, el registro se actualiza — el equipo puede
      ver "entregado 18:47" sin adivinar.
- [ ] Si el envío falla, el equipo recibe aviso; el alumno sigue viendo el mensaje genérico.
- [ ] Un admin consulta el historial de acceso de un alumno desde su ficha, sin SQL.

## Files & routes to touch

*(verificado contra el código: sí — todas las rutas existen y hacen lo que dice el codemap)*

**Frente 1 — Acceso auto-servicio**

- `app/(auth)/login/login-form.tsx` — modificar — el enlace deja de llamarse solo
  "¿Olvidaste tu contraseña?"; cubre también "nunca he entrado".
- `app/(auth)/forgot-password/page.tsx` — modificar — título y bajada que cubren activar
  cuenta y recuperar acceso.
- `app/(auth)/forgot-password/forgot-password-form.tsx` — modificar — copy del estado
  "enviado" acorde, y acepta `email` inicial por query.
- `app/onboarding/set-password/set-password-form.tsx` — modificar — el estado `error` deja
  de decir "contacta al administrador" y ofrece pedir un enlace nuevo en la misma pantalla
  (reusa `POST /api/auth/forgot-password`).
- `app/onboarding/[programa]/set-password/page.tsx` — sin cambios de lógica (hereda el
  formulario); verificar que el copy branded siga calzando.

**Frente 2 — Trazabilidad**

- `db/migrations/0082_access_email_log.sql` — nuevo — tabla `access_email_log`
  (`email`, `user_id` nullable, `kind`, `status`, `provider_message_id`, `error`,
  `delivered_at`, `created_at`), RLS staff-only. Espeja 0075/0077.
- `app/api/auth/forgot-password/route.ts` — modificar — escribe en el ledger en los tres
  desenlaces, guarda el `id` que devuelve Resend, y avisa al equipo si el envío falla.
  La respuesta al cliente no cambia.
- route `POST /api/webhooks/resend` — **nueva** — `app/api/webhooks/resend/route.ts`:
  recibe `email.delivered` / `email.bounced` / `email.complained`, verifica firma Svix,
  y actualiza el ledger por `provider_message_id`.
- `app/(admin)/admin/users/[userId]/` — modificar — tarjeta "Historial de acceso" con las
  últimas solicitudes y su estado.
- `lib/email/access-link.ts` — nuevo — helper de envío + registro, para que la ruta no
  cargue con las dos responsabilidades.

## Tests

- `app/api/auth/forgot-password/__tests__/route.test.ts` — extender — registra `sent` en
  el camino feliz; registra `failed` y avisa al equipo cuando Resend lanza; registra
  `no_account` cuando `generateLink` falla; **la respuesta sigue siendo `ok:true` en los
  tres casos** (anti-enumeración).
- `app/api/webhooks/resend/__tests__/route.test.ts` — nuevo — firma inválida → 401;
  `email.delivered` marca `delivered_at`; `email.bounced` marca `bounced`; evento de otro
  dominio se ignora.
- `lib/email/__tests__/access-link.test.ts` — nuevo — el helper devuelve el
  `provider_message_id` y no lanza cuando Resend falla.
- ~~`app/onboarding/set-password/__tests__/set-password-form.test.tsx`~~ — **no escrito**.
  El proyecto corre Vitest en entorno `node`, sin testing-library ni jsdom: no hay
  infraestructura para testear componentes. Montarla por un botón era desproporcionado,
  así que ese cambio se verificó en el navegador contra el server local (pantalla de
  enlace vencido → formulario de reenvío → estado "Enlace enviado" → fila `no_account` en
  la bitácora). La llamada que dispara ya está cubierta por los 21 tests del endpoint.
- Cobertura: `test:coverage` no baja; `/api/auth/forgot-password` es ruta de auth, así que
  cumple el umbral fijo de ADR-0012.

## Out of scope

- El bug de doble mensaje del login (ya corregido y desplegado, `4987dc9`).
- La campaña masiva de activación a los 312 (frente aparte; el usuario la descartó por
  ahora).
- Firmar el playback de Mux, el flag `Secure` de la cookie de sesión y demás hallazgos
  laterales: se anotan, no se tocan acá.
- Migrar la autenticación a magic-link puro (sin contraseña). Se evaluó; cambia el modelo
  mental de toda la plataforma y no hace falta para cerrar el problema.

---

## Technical

### Decisión de diseño: un solo enlace, dos nombres

Activar cuenta y recuperar contraseña son **el mismo mecanismo** (`generateLink recovery`
→ `verifyOtp` → `updateUser`). La plataforma hoy los presenta como cosas distintas y eso
deja fuera a quien nunca tuvo contraseña. La consolidación es de producto, no de
infraestructura: un endpoint, una pantalla, copy que cubre ambos casos.

Alternativa descartada: detectar en el servidor si el usuario tiene contraseña y ramificar
el copy. Filtra estado de cuenta a un endpoint sin autenticar — el mismo motivo por el que
la respuesta es genérica.

### Ledger: por qué una tabla nueva y no reusar 0077

`0077_recipient_ledgers_deliverable_recording.sql` resuelve **idempotencia de fan-out**
(¿a quién le falta este correo?), con claves `deliverable_id` / `session_id`. El acceso es
1-a-1 y a demanda, sin objeto padre, y necesita el ciclo de vida del envío
(enviado → entregado / rebotado). Comparte el patrón —RLS staff-only, escritura por
`service_role`— pero no la forma. Tabla nueva, mismo criterio.

### Riesgo y rollback

- La migración solo agrega una tabla: reversible con `drop table`, sin backfill, sin tocar
  datos existentes.
- Los cambios de copy y de caminos no alteran el mecanismo verificado de recuperación; si
  algo sale mal, revertir el commit restaura el flujo actual, que **funciona**.
- El webhook de Resend ya está creado (id `25e7743a-1391-4bb4-a4f6-c6a0a5cfa014`, eventos
  `email.delivered` / `bounced` / `complained`) y `RESEND_WEBHOOK_SECRET` está guardado como
  secreto en Netlify (production, deploy-preview y branch-deploy).

  **Queda en `disabled` a propósito**: el endpoint solo existe en la rama, así que en
  producción responde 404. La cuenta de Resend es compartida y envía cientos de correos al
  día; dejarlo activo acumularía fallos de entrega y Resend puede desactivar un endpoint que
  falla de forma sostenida. **Al mergear a `main`, habilitarlo** con
  `PATCH https://api.resend.com/webhooks/<id>` y `{"status":"enabled"}`.

  Mientras siga deshabilitado, el ledger registra `sent`/`failed`/`no_account` pero no
  `delivered`: degrada, no rompe.

## Spec (Given/When/Then)

**Escenario: alumno que nunca activó su cuenta**
- GIVEN una persona matriculada, sin `email_confirmed_at` y sin contraseña
- WHEN abre el login y usa el enlace de acceso con su correo
- THEN recibe un enlace, fija su contraseña y entra al classroom sin hablar con nadie

**Escenario: enlace ya usado o vencido**
- GIVEN una persona que abre un enlace de acceso caducado
- WHEN aterriza en la pantalla de contraseña sin sesión
- THEN ve una explicación de lo que pasó y un botón que le manda uno nuevo ahí mismo

**Escenario: falla el envío**
- GIVEN una cuenta que sí existe
- WHEN Resend rechaza el envío
- THEN el alumno ve el mismo mensaje genérico de siempre, el intento queda registrado como
  `failed` y el equipo recibe aviso

**Escenario: correo mal escrito**
- GIVEN alguien que teclea un correo sin cuenta
- WHEN pide el enlace
- THEN ve el mismo mensaje genérico, y queda registrado como `no_account` para soporte

**Escenario: confirmación de entrega**
- GIVEN un correo de acceso enviado con su `provider_message_id`
- WHEN Resend notifica `email.delivered`
- THEN el registro queda con la hora de entrega, visible en la ficha del alumno

## Tasks

1. Migración `0082_access_email_log.sql` (tabla + índices + RLS staff-only).
2. `lib/email/access-link.ts`: envío + registro, con el `provider_message_id` de Resend.
3. Cablear `app/api/auth/forgot-password/route.ts` al helper; aviso al equipo en `failed`;
   respuesta al cliente sin cambios. Extender sus tests.
4. Webhook `POST /api/webhooks/resend` con verificación de firma + tests.
5. Copy y caminos del frente 1 (login, forgot-password, set-password) + test del estado sin
   sesión de `set-password`.
6. Tarjeta "Historial de acceso" en la ficha del alumno del panel admin.
7. `test:coverage` verde, `next build`, actualizar codemap y CHANGELOG.
