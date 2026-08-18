# ADR-0035: Invitados sin cuenta en salas abiertas

- **Status:** accepted
- **Date:** 2026-08-18
- **Deciders:** Elkis Daza (dirección), equipo de desarrollo
- **Tags:** clases-en-vivo, acceso, seguridad

## Contexto

Entrar a una clase en vivo exigía una cuenta, siempre. `app/sala/[code]/page.tsx`
mandaba al login a quien no tuviera sesión, y `decideRoomAccess`
(`lib/livekit/access.ts`) solo reconoce tres caminos: matrícula activa, rol de
staff, o solicitud aprobada en la sala de espera (0091) — que también exige
cuenta, porque `room_join_requests.user_id` referencia `profiles`.

El problema es que **no existe registro público**: `app/(auth)/` solo tiene
`login` y `forgot-password`, y no hay ninguna llamada a `signUp` en el repo. Las
cuentas se crean desde el admin. La consecuencia práctica es que un externo que
recibía el enlace de una sala llegaba a una puerta que nunca se le iba a abrir:
no podía entrar y tampoco podía crearse una cuenta para intentarlo.

El pedido concreto (18-ago-2026) fue poder abrir una sala a gente de afuera —una
demo, una charla, un invitado a una clase— sin crearle cuenta a cada persona.

## Decisión

Habilitar invitados sin cuenta, **solo en las salas marcadas explícitamente**, con
dos reglas que definen todo lo demás:

1. **El invitado pasa por la sala de espera.** Escribe su nombre, queda pendiente
   y el docente lo acepta. No recibe token —ni presencia en la sala— hasta
   entonces. Es la misma decisión de 0091 y por el mismo motivo: quien espera no
   toca la sala.
2. **Aprobado, participa como uno más**: micrófono, cámara y chat. Nunca
   `roomAdmin`.

Piezas:

- `class_sessions.guest_access boolean not null default false` — el flag por sala.
  Nace apagado, así que ninguna clase existente cambia de comportamiento.
- Tabla `room_guests` (0099) con la solicitud del invitado. Su `id` viaja en una
  cookie `httpOnly` y **es** la credencial.
- `lib/livekit/guest-access.ts` — la decisión, pura y aparte de `decideRoomAccess`.
- `POST/GET /api/sala/[code]/invitado` — pedir entrar y consultar su estado.
- La ruta del token y el panel de moderación aprenden la rama de invitado.

## Por qué una tabla nueva y no extender `room_join_requests`

Esa tabla tiene `user_id uuid not null references profiles(id)` y una RLS que se
apoya en `auth.uid()`. Un invitado no tiene ninguna de las dos cosas. Volver
`user_id` nullable con un CHECK de exclusión mutua debilitaría una invariante hoy
simple y dejaría aquella policy mintiendo a medias. Separar mantiene 0091 intacta
y contiene el riesgo nuevo en una superficie nueva.

`room_guests` va con RLS activa y **sin policies**, más estricto que 0091: sin
`auth.uid()` no hay policy honesta que escribir, así que todo pasa por la API con
`service_role`, que es donde vive la autorización real.

## Defensas concretas

- **Enlace filtrado a una clase real**: no sirve. El flag es por sala y las clases
  del programa no lo llevan. Se verifica en la decisión pura antes que nada.
- **Sondeo de códigos válidos**: una sala sin `guest_access` responde 404, igual
  que una que no existe. Distinguirlas convertiría la ruta en un detector de
  códigos de reunión.
- **Suplantación**: el nombre visible lo construye el servidor con el sufijo
  `(invitado)`. Alguien que escriba el nombre de la docente aparece como
  "Paola Vicuña (invitado)". Además se limpian los caracteres invisibles con que
  se maquilla un nombre en la grilla.
- **Colisión de identidades**: la identidad va prefijada (`guest-<id>`) para que
  no pueda chocar con el UUID de perfil de un usuario real — una identidad
  repetida hace que LiveKit desconecte al participante anterior.
- **Credencial de otra clase**: la fila se lee filtrando por `session_id`, así que
  la cookie de la clase A no sirve en la B.
- **Ruido en el panel**: 5 solicitudes por minuto y por IP, y volver a enviar el
  formulario reutiliza la fila — a quien fue rechazado no le sirve cambiar de
  nombre.

## Lo que este diseño NO resuelve

**A un invitado expulsado no se le puede negar el regreso.** Vuelve a pedir entrar
con otro nombre, y no hay identidad estable con la cual bloquearlo. La defensa
real no es técnica sino de alcance: el flag es por sala, y las clases reales no lo
llevan. Si algún día se abre una clase real a invitados, hará falta algo más
—bloqueo por IP o una clave de sala, que fue una opción considerada y descartada
por fricción.

**Los invitados no cuentan para la asistencia.** No es una decisión nueva: la
asistencia por LiveKit nunca se implementó (`participant_joined` llega al webhook
y se responde 200 sin hacer nada). Hoy la asistencia sale del QR y de la marca
manual.

## Opciones consideradas

### Opción A — Sala de espera para invitados (elegida)

- **Pros:** un enlace filtrado no mete a nadie; reusa el panel que ya existe; el
  docente conserva el control de quién entra.
- **Contras:** alguien tiene que mirar el panel. En una sala con mucha gente
  llegando a la vez, es trabajo manual.

### Opción B — Entrar directo con el enlace

- **Pros:** sin fricción, la "sala abierta" literal.
- **Contras:** un enlace filtrado deja entrar a cualquiera, y a un anónimo
  expulsado no se le puede bloquear el regreso. Descartada por eso.

### Opción C — Clave de sala (PIN)

- **Pros:** sin panel que atender, y el enlace por sí solo no basta.
- **Contras:** una columna más, un dato más que repartir y explicar, y el PIN se
  filtra junto con el enlace. No compensaba.

## Consecuencias

### Positivas

- Se puede invitar a alguien de afuera a una clase sin crearle cuenta.
- El camino viejo queda igual: con el flag apagado —el default— la sala se
  comporta exactamente como antes.

### Negativas

- Una superficie nueva atendiendo a gente no autenticada, con su propia tabla y
  su propia credencial.
- El docente suma una tarea durante la clase: aceptar a quien espera.

## Reversa

`drop table room_guests` y `alter table class_sessions drop column guest_access`.
Como el default es `false`, dejar el código desplegado sin encender el flag no
cambia el comportamiento de ninguna sala.
