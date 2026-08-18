# Sala pública: invitados sin cuenta

**Classification**: `feat` · medium · **riesgo alto** · known · toca `lib/livekit/`, `app/sala/`, `app/api/classroom/clase/`, `db/migrations/`
**Tier**: 3 — Full (el riesgo alto manda: es una frontera de autenticación + migración)
**Fecha**: 2026-08-18

## Goal

Que una persona **sin cuenta** pueda entrar a una clase en vivo con solo el enlace
`/sala/<código>`, escribiendo su nombre y esperando que el docente la deje entrar.
Hoy es imposible: la página redirige a `/login` y no existe registro público, así que
un invitado externo llega a una puerta que nunca se le va a abrir.

Aplica **solo a las salas marcadas explícitamente** como abiertas a invitados. Las
clases reales no lo están, y por eso un enlace filtrado no le sirve a nadie.

## Decisiones tomadas (Elkis, 18-ago-2026)

1. **El invitado pasa por la sala de espera**, no entra directo. El docente lo aprueba.
   Un enlace filtrado, entonces, no mete a nadie: lo peor que produce es una solicitud
   molesta en el panel.
2. **Una vez aprobado participa como uno más**: micrófono, cámara y chat. Nunca
   `roomAdmin`.

## Assumptions made (corrígeme si alguna está mal)

- **Los invitados no cuentan para la asistencia.** No es una decisión nueva: la
  asistencia por LiveKit nunca se implementó — `participant_joined` llega al webhook y
  se responde 200 sin hacer nada (`app/api/webhooks/livekit/route.ts:27`). Hoy la
  asistencia sale del QR y de la marca manual.
- **El invitado sí tiene ventana horaria** (−30/+120 min), igual que un alumno. El staff
  sigue siendo el único sin ventana.
- **La identidad del invitado no sobrevive al cierre del navegador.** Si vuelve, pide
  entrar de nuevo. Persistir invitados anónimos entre sesiones no aporta a este caso.
- **El flag por sesión, no por cohorte ni por programa.** Una clase concreta se abre;
  el entorno entero jamás.
- **Sin correo ni notificación al docente.** El panel de moderación ya hace *polling*
  de pendientes y muestra el contador; el invitado aparece ahí como cualquier solicitud.

## Acceptance criteria

- [ ] Una sesión con invitados **apagado** (el default) se comporta exactamente como hoy:
      quien no tiene sesión iniciada va a `/login`.
- [ ] Una sesión con invitados **encendido** muestra, a quien no tiene sesión, una
      pantalla para escribir su nombre — no el login.
- [ ] Al enviar el nombre, el invitado queda "esperando" y **no recibe token**: no toca
      la sala de LiveKit hasta que lo aprueben.
- [ ] El docente ve la solicitud en su panel, distinguida como invitado, y puede
      aceptarla o rechazarla.
- [ ] Aprobado, el invitado entra con micrófono, cámara y chat, y **sin** moderación.
- [ ] Rechazado, ve que lo rechazaron y no puede reintentar cambiando el nombre.
- [ ] El nombre visible en la sala lleva el sufijo `(invitado)`, para que nadie pueda
      hacerse pasar por la docente escribiendo su nombre.
- [ ] Fuera de la ventana horaria, el invitado no puede ni pedir entrar.
- [ ] Un invitado aprobado en la clase A **no** puede entrar a la clase B con esa
      credencial.

## Files & routes to touch

*(verificado contra el código: sí — todas estas rutas y símbolos existen hoy)*

**Datos**
- `db/migrations/0099_salas_publicas_invitados.sql` — **nuevo**
  - `class_sessions.guest_access boolean not null default false` — el flag por sala.
  - tabla `room_guests` (`id`, `session_id`, `display_name`, `status`, `created_at`,
    `decided_at`, `decided_by`) + índice parcial de pendientes.
  - RLS activa y **sin policies**: el invitado no tiene `auth.uid()`, así que todo pasa
    por la API con `service_role`. Mismo criterio que `room_join_requests` (0091), pero
    más estricto porque acá no hay identidad de Supabase que aplique.

**Lógica pura (donde vive la decisión de acceso)**
- `lib/livekit/guest-access.ts` — **nuevo** — `sanitizeGuestName()` y
  `decideGuestAccess()`. Se separa de `decideRoomAccess` a propósito: ese gate está
  probado y cubre a los usuarios con cuenta; meterle un cuarto camino lo vuelve más
  difícil de razonar. Reusa `isWithinRoomWindow` y `tokenExpiryFor` de `access.ts`.
- `lib/livekit/access.ts` — **modificar** — solo exportar lo que `guest-access.ts`
  reusa. Sin tocar `decideRoomAccess`.

**Rutas**
- `app/api/sala/[code]/invitado/route.ts` — **nueva** — `POST` pide entrar (valida flag,
  ventana y nombre; crea la fila; deja la cookie), `GET` devuelve su estado. Rate limit
  por IP, no por usuario: acá no hay usuario.
- `app/api/classroom/clase/[sessionId]/token/route.ts` — **modificar** — si no hay
  sesión iniciada, intenta la rama invitado leyendo la cookie. Todo lo demás, intacto.
- `app/api/classroom/clase/[sessionId]/acceso/route.ts` — **modificar** — el `GET` de
  staff suma `invitadosPendientes`; el `POST` acepta `approve`/`deny` sobre un invitado.

**Pantallas**
- `app/sala/[code]/page.tsx` — **modificar** — la rama "sin usuario" deja de redirigir
  siempre: si la sala admite invitados, pinta la pantalla de nombre.
- `components/classroom/live/guest-join.tsx` — **nuevo** — nombre → esperando → adentro.
- `components/classroom/live/moderation-panel.tsx` — **modificar** — pinta invitados
  junto a las solicitudes con cuenta, marcados como tales.

**Administración**
- `app/api/admin/sessions/route.ts` — **modificar** — `guest_access` en el schema de
  crear y editar (`z.boolean().default(false)`).
- `app/(admin)/admin/cohorts/[cohortId]/sesiones/sessions-manager-client.tsx` —
  **modificar** — el interruptor "Permitir invitados sin cuenta", apagado por defecto y
  con la advertencia de qué implica.

**La credencial del invitado**: cookie `httpOnly` + `secure` + `sameSite=lax` que guarda
el `room_guests.id` (un UUID no adivinable), acotada a esa sesión y vencida cuando cierra
la sala. No se firma nada aparte: el UUID *es* el secreto, igual que el `id` de una fila
de sesión, y vive en una tabla que solo `service_role` lee.

## Tests

- `lib/livekit/__tests__/guest-access.test.ts` — **nuevo** — un caso por escenario de
  abajo: flag apagado, fuera de ventana, pendiente, aprobado, rechazado, nombre inválido,
  sufijo `(invitado)`, y que el grant nunca traiga `roomAdmin`.
- `app/api/sala/[code]/invitado/__tests__/route.test.ts` — **nuevo** — pedir entrar con
  el flag apagado da 404; con el flag encendido crea una sola fila aunque se pulse dos
  veces; el rate limit corta.
- `app/api/classroom/clase/[sessionId]/token/__tests__/route.test.ts` — **actualizar** —
  invitado aprobado recibe token; pendiente y rechazado no; la cookie de la clase A no
  sirve para la clase B.
- `app/api/classroom/clase/[sessionId]/acceso/__tests__/route.test.ts` — **actualizar** —
  solo staff de esa cohorte aprueba invitados.

Cobertura: no baja. Esto es una ruta de autenticación, así que entra en el umbral fijo
de rutas críticas.

## Spec (Given/When/Then)

**Escenario: la sala no admite invitados (el default)**
- GIVEN una sesión con `guest_access = false`
- WHEN alguien sin sesión iniciada abre `/sala/<código>`
- THEN se le redirige a `/login?next=/sala/<código>`, igual que hoy

**Escenario: pedir entrar como invitado**
- GIVEN una sesión con `guest_access = true`, dentro de la ventana
- WHEN alguien sin cuenta escribe "Diego" y envía
- THEN se crea una fila `room_guests` en `pending`, se deja la cookie, y **no** se emite
  ningún token

**Escenario: el docente aprueba**
- GIVEN un invitado en `pending`
- WHEN el docente pulsa aceptar en su panel
- THEN la fila pasa a `approved` y el invitado recibe un token con `canPublish: true`,
  `canPublishData: true` y **sin** `roomAdmin`, con el nombre "Diego (invitado)"

**Escenario: el docente rechaza**
- GIVEN un invitado en `pending`
- WHEN el docente lo rechaza
- THEN la fila pasa a `denied`, se le informa, y volver a enviar el formulario reutiliza
  la misma fila rechazada en vez de crear una nueva

**Escenario: credencial acotada a su clase**
- GIVEN un invitado aprobado en la clase A
- WHEN pide token para la clase B con esa misma cookie
- THEN se le niega: la cookie nombra una fila cuyo `session_id` es el de A

**Escenario: fuera de horario**
- GIVEN una sesión que terminó hace más de 2 horas
- WHEN alguien sin cuenta intenta pedir entrar
- THEN se le informa el horario y no se crea ninguna fila

## Design

**Por qué una tabla nueva y no extender `room_join_requests`.** Esa tabla tiene
`user_id uuid not null references profiles(id)` y una RLS que se apoya en `auth.uid()`.
Un invitado no tiene ninguna de las dos cosas. Volver `user_id` nullable con un CHECK de
exclusión mutua debilitaría una tabla que hoy tiene una invariante simple y verificable,
y dejaría la policy existente mintiendo a medias. Separar mantiene 0091 exactamente como
está y contiene el riesgo nuevo en una superficie nueva.

**Por qué el invitado no entra sin aprobación.** Es la misma decisión que ya tomó 0091 y
por el mismo motivo: quien espera no toca la sala. Un invitado con presencia oculta y
canal de datos abierto ya está dentro para cualquier efecto práctico.

**Lo que este diseño NO resuelve.** A un invitado expulsado no se le puede negar el
regreso: pide entrar otra vez con otro nombre. La defensa real no es técnica sino de
alcance — el flag es por sala y las clases reales no lo llevan. Si algún día se abre una
clase real a invitados, hará falta algo más (bloqueo por IP o una clave de sala).

**Rollback.** La migración se revierte con `drop table room_guests` y
`alter table class_sessions drop column guest_access`. Como el default es `false`, dejar
el código desplegado sin usar el flag no cambia el comportamiento de ninguna sala
existente: el camino viejo queda intacto y es el que corre por defecto.

## Tasks

1. Migración 0099 (flag + tabla + índice + RLS) y aplicarla.
2. `lib/livekit/guest-access.ts` con sus tests. Nada de red: decisión pura.
3. Ruta `/api/sala/[code]/invitado` (pedir y consultar) con tests.
4. Rama invitado en la ruta del token, con tests.
5. Aprobación de invitados en `/acceso` y en el panel de moderación.
6. Pantalla `guest-join.tsx` y la rama sin usuario de `/sala/[code]`.
7. Interruptor en el admin (API + UI).
8. ADR-0035 con la decisión y el límite conocido; actualizar el codemap.

## Out of scope

- Que el invitado cuente para la asistencia.
- Clave de sala / PIN (fue una opción descartada en la decisión 1).
- Bloquear a un invitado expulsado para que no vuelva.
- Registro público de cuentas: sigue sin existir, y esta feature no lo introduce.
- Invitados en las clases del Diplomado o de cualquier entorno real: nadie enciende el
  flag ahí como parte de este cambio.
