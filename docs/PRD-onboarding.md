# PRD — Onboarding, Invitacion y Matricula

> Product Requirements Document para el modulo de onboarding de Capital Academy.

- **Autor:** Equipo Capital Academy
- **Fecha:** 2026-05-27
- **Estado:** Draft
- **Epicas relacionadas:** E1 (Auth), E2 (Onboarding), E14 (Pagos/Matricula automatica)
- **ADRs:** [0004](adr/0004-modelo-permisos-rbac-por-cohorte.md), [0006](adr/0006-flujo-onboarding-y-matricula.md)
- **Prerequisitos:** [PRD-roles-permisos](PRD-roles-permisos.md), [PRD-classroom](PRD-classroom.md)

---

## 1. Problema

Capital Academy matricula alumnos manualmente desde el panel admin. El flujo actual tiene cuatro brechas criticas:

1. **No hay email de invitacion.** El admin crea la cuenta, asigna una contrasena temporal, y la comunica por WhatsApp o de forma verbal. No hay un email automatizado con credenciales, enlace a la plataforma, ni instrucciones de primer acceso. Esto causa que el 30% de los alumnos no ingresan la primera semana porque "no encontraron el link" o "perdieron la contrasena".

2. **No hay completacion de perfil obligatoria.** La tabla `profiles` tiene `full_name`, `phone` y `avatar_url`, pero no captura datos esenciales para la operacion: RUT (requerido por SENCE y para certificados), empresa, cargo. Hoy estos datos se recopilan en una planilla de Google aparte, que nunca esta sincronizada con la plataforma.

3. **No hay importacion masiva.** Para la cohorte 2S-2026 (35 alumnos), el admin creo cada cuenta individualmente. Esto tomo ~3 horas y resulto en 4 errores de tipeo en emails que generaron tickets de soporte.

4. **El pago no crea la cuenta automaticamente.** Cuando alguien paga el diplomado via Flow/Fintoc, recibe un email de confirmacion de pago pero no obtiene acceso inmediato. El admin tiene que crear la cuenta manualmente 24-48 horas despues. Esto genera ansiedad en el alumno ("pague pero no puedo entrar") y carga operativa innecesaria.

### Metricas actuales (baseline)

| Metrica | Valor actual |
|---|---|
| Tiempo para dar de alta 1 alumno (crear + comunicar credenciales) | ~8 min |
| Tiempo para dar de alta 35 alumnos | ~3 horas |
| Alumnos que ingresan la primera semana post-matricula | ~70% |
| Tiempo entre pago y primer acceso | 24-48 horas |
| Perfiles con RUT completo | 0% (dato no existe en la plataforma) |

---

## 2. Objetivo

Automatizar el ciclo completo de onboarding para que:

1. Todo alumno reciba un **email de invitacion branded** con sus credenciales al ser creado.
2. Al hacer login por primera vez, el alumno **complete su perfil** (RUT, nombre, telefono) antes de acceder al classroom.
3. El admin pueda **importar 20-40 alumnos via CSV** en menos de 5 minutos.
4. Cuando un pago se confirma, la cuenta del alumno se cree **automaticamente** y reciba el email de invitacion sin intervencion manual.

---

## 3. No-scope (MVP)

- Cambio de contrasena obligatorio en primer login (backlog V1.5; en MVP la contrasena temporal funciona hasta que el alumno la cambie voluntariamente).
- Flujo de "olvide mi contrasena" con Resend (se usa el built-in de Supabase Auth).
- Email de recordatorio automatico para alumnos que no completan el onboarding (backlog — en MVP, ops los contacta manualmente basandose en un reporte).
- Integracion con Fintoc para auto-registro (MVP solo cubre Flow; Fintoc se agrega cuando se active ese provider).
- Foto de perfil obligatoria.
- Verificacion de RUT contra SII.

---

## 4. User Stories

### 4.1 Admin

**US-O01: Enviar email de invitacion al crear un usuario**
> Como admin, quiero que al crear un usuario desde el panel, se le envie automaticamente un email con sus credenciales y un enlace para ingresar a la plataforma.

Criterios de aceptacion:
- Al crear un usuario via `/admin/users`, el sistema genera una contrasena temporal de 12 caracteres alfanumericos.
- Se envia un email via Resend con: nombre del alumno, nombre de la cohorte/programa, email como usuario, contrasena temporal, boton CTA "Ingresar a Capital Academy" apuntando a `/login`.
- El email usa el branding de Capital Academy (misma estetica que el email de confirmacion de pago).
- Si el envio de email falla, el usuario se crea igualmente pero el admin ve un toast de advertencia: "Usuario creado, pero fallo el envio del email. Puedes reenviarlo desde el perfil del usuario."
- En el panel admin, el detalle del usuario muestra si se le envio la invitacion (fecha/hora) o si esta pendiente.

**US-O02: Reenviar email de invitacion**
> Como admin, quiero poder reenviar el email de invitacion a un usuario que no lo recibio o lo perdio.

Criterios de aceptacion:
- En la ficha del usuario (`/admin/users/[userId]`), hay un boton "Reenviar email de acceso" en el menu de acciones (ya existe el boton en la UI, pero no tiene logica).
- Al hacer click, se genera una nueva contrasena temporal, se actualiza en Supabase Auth, y se envia el email.
- Se registra en `invitation_log` con el motivo "reenvio".
- El admin ve confirmacion: "Email reenviado a maria@mail.cl".
- Limite: maximo 5 reenvios por usuario en 24 horas (previene spam accidental).

**US-O03: Importar alumnos via CSV**
> Como admin, quiero subir un archivo CSV con los datos de 20-40 alumnos y que el sistema cree las cuentas, los asigne a una cohorte, y les envie el email de invitacion.

Criterios de aceptacion:
- En `/admin/users`, hay un boton "Importar CSV" junto al boton "Nuevo usuario".
- Al hacer click, se abre un modal con:
  - Zona de upload (drag & drop o click para seleccionar archivo).
  - Formato esperado: CSV con columnas `email`, `nombre_completo`. Opcionales: `telefono`, `rut`.
  - Dropdown para seleccionar la cohorte destino.
- Despues del upload, se muestra una tabla de preview con semaforo por fila:
  - Verde: usuario nuevo, se creara.
  - Azul: usuario existente, solo se asignara a la cohorte.
  - Rojo: error (email invalido, duplicado en CSV, ya inscrito en esa cohorte).
- El admin puede corregir errores editando las filas en la tabla de preview antes de confirmar.
- Al confirmar, se procesan las filas validas. Se muestra una barra de progreso durante el procesamiento.
- Al finalizar, se muestra un resumen: X usuarios creados, Y usuarios asignados a cohorte, Z errores.
- Los errores se pueden descargar como CSV para revision.
- Cada usuario creado recibe el email de invitacion.

**US-O04: Ver estado de onboarding de los alumnos**
> Como admin, quiero ver cuales alumnos completaron su perfil y cuales tienen el onboarding pendiente.

Criterios de aceptacion:
- En la lista de usuarios (`/admin/users`), hay una columna o badge de "Onboarding" con dos estados: "Completado" (verde) y "Pendiente" (amarillo).
- En la ficha del usuario, la seccion de datos muestra `onboarding_completed_at` con la fecha y hora, o "Pendiente" si es null.
- Filtro en la lista de usuarios: "Solo pendientes de onboarding".
- En la vista de cohorte (`/admin/cohorts/[cohortId]`), se muestra un indicador: "X de Y alumnos completaron el onboarding".

### 4.2 Ops

**US-O05: Matricular un alumno individualmente con envio de invitacion**
> Como ops, quiero matricular un alumno en una cohorte y que reciba automaticamente su email de acceso.

Criterios de aceptacion:
- Desde la vista de cohorte (`/admin/cohorts/[cohortId]`), hay un boton "Matricular alumno".
- Formulario: email, nombre completo, telefono (opcional).
- Si el email ya existe como usuario, se le asigna directamente a la cohorte (enrollment + cohort_role). Se le envia un email notificandole que fue inscrito en un nuevo programa.
- Si el email no existe, se crea la cuenta + se envia email de invitacion con credenciales.
- El enrollment y el cohort_role de `student` se crean automaticamente (via trigger de ADR-0004).

### 4.3 Student

**US-O06: Completar mi perfil en el primer login**
> Como alumno, quiero completar mis datos personales al ingresar por primera vez para poder acceder al aula virtual.

Criterios de aceptacion:
- Al hacer login con la contrasena temporal, el sistema me redirige a `/onboarding/complete-profile` si mi campo `onboarding_completed_at` es null.
- La pagina muestra un formulario con:
  - **Requeridos:** nombre completo (prellenado si ya existe), telefono (prellenado si ya existe), RUT (con validacion de formato y digito verificador).
  - **Opcionales:** empresa, cargo, LinkedIn URL.
- Los campos prellenados son editables.
- El boton "Completar perfil y continuar" se habilita solo cuando los 3 campos requeridos estan llenos y validos.
- Al enviar, el sistema guarda los datos y setea `onboarding_completed_at = now()`.
- Despues del guardado exitoso, redirige a `/classroom` (que a su vez redirige a la cohorte activa del alumno).
- Si cierro la sesion sin completar y vuelvo a ingresar, me muestra el formulario de nuevo.
- No puedo navegar a ninguna otra ruta del classroom mientras el onboarding este pendiente.

**US-O07: Editar mi perfil despues del onboarding**
> Como alumno, quiero poder actualizar mis datos opcionales (empresa, cargo, LinkedIn, bio, foto de perfil) desde el classroom.

Criterios de aceptacion:
- En el sidebar del classroom, hay un enlace "Mi perfil" que lleva a `/classroom/profile`.
- La pagina muestra todos los campos del perfil: los requeridos (nombre, telefono, RUT) y los opcionales (avatar, empresa, cargo, LinkedIn, bio, direccion, contacto de emergencia).
- Los campos requeridos (nombre, telefono, RUT) son editables pero no pueden quedar vacios.
- Al guardar cambios, se actualiza `profiles` y se muestra confirmacion.
- El avatar se sube a Supabase Storage (`avatars/[userId]`) y la URL se guarda en `profiles.avatar_url`.

**US-O08: Recibir email de bienvenida cuando me matriculan**
> Como alumno, quiero recibir un email claro con mis credenciales y un enlace directo para que pueda ingresar sin tener que buscar la URL.

Criterios de aceptacion:
- El email llega desde el remitente configurado en Resend (`FROM_EMAIL`).
- Incluye: saludo con mi nombre, nombre del programa/cohorte, mi email como usuario, contrasena temporal, boton CTA "Ingresar a Capital Academy", instrucciones de que al entrar tendre que completar mi perfil.
- El email se ve correctamente en Gmail, Outlook y Apple Mail (responsive).
- Si mi cuenta fue creada por pago automatico, recibo este email ademas del email de confirmacion de pago (son dos emails distintos).

### 4.4 Sistema

**US-O09: Crear cuenta automaticamente cuando un pago es aprobado**
> Como sistema, quiero crear la cuenta del alumno automaticamente cuando Flow confirma un pago exitoso, para que el alumno pueda acceder de inmediato.

Criterios de aceptacion:
- Cuando el webhook de Flow recibe `status === "succeeded"` y no hay `paid_at` previo:
  - Se busca si existe un usuario en `auth.users` con el email del pago.
  - Si NO existe: se crea el auth user + profile + enrollment en la cohorte activa + cohort_role de student + se envia email de invitacion.
  - Si SI existe: solo se crea el enrollment + cohort_role si no existe ya.
- La cohorte destino se determina buscando la cohorte activa del programa del diplomado.
- Si no hay cohorte activa, el usuario se crea pero sin enrollment. Se registra un log de advertencia para que ops lo asigne manualmente.
- El proceso es idempotente: si el webhook se recibe multiples veces (retry de Flow), no se crean usuarios ni enrollments duplicados.
- Los datos del perfil se pre-llenan con los datos del formulario de pago: `full_name`, `phone`, `rut`.

**US-O10: Prevenir acceso al classroom hasta completar onboarding**
> Como sistema, quiero redirigir al alumno a la pagina de completacion de perfil si no ha terminado su onboarding, para asegurar que todos los perfiles tengan datos minimos.

Criterios de aceptacion:
- El layout guard del grupo `(classroom)` verifica `onboarding_completed_at` en el perfil.
- Si es null y el `system_role` es `user`, redirige a `/onboarding/complete-profile`.
- Si el `system_role` es `ops` o `admin`, no se aplica el guard (sus perfiles se marcan como completados en la migracion).
- La pagina `/onboarding/complete-profile` es accesible SOLO para usuarios autenticados con onboarding pendiente.
- Si un usuario con onboarding completado intenta acceder a `/onboarding/complete-profile`, se redirige a `/classroom`.

**US-O11: Registrar todas las invitaciones enviadas**
> Como sistema, quiero registrar cada email de invitacion enviado para trazabilidad y soporte.

Criterios de aceptacion:
- Cada email de invitacion (inicial o reenvio) genera un registro en `invitation_log` con: user_id, email, resend_message_id, sent_at, sent_by (null si es automatico), source ('manual', 'csv_import', 'payment_webhook'), cohort_id.
- El admin puede ver el historial de invitaciones en la ficha del usuario.
- Si Resend retorna un error, se registra igualmente con resend_message_id = null.

---

## 5. Pantallas y flujos

### 5.1 Email de invitacion

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │          ┌──────────────────────────────────────┐          │  │
│  │          │  [Logo Capital Academy]               │          │  │
│  │          │  CAPITAL ACADEMY                      │          │  │
│  │          │  Tu acceso esta listo                  │          │  │
│  │          └──────────────────────────────────────┘          │  │
│  │                                                            │  │
│  │  Hola Maria,                                               │  │
│  │                                                            │  │
│  │  Tu cupo en el Diplomado Ejecutivo en Ventas y             │  │
│  │  Asesoria Inmobiliaria esta confirmado. Ya puedes          │  │
│  │  ingresar a la plataforma.                                 │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  TUS CREDENCIALES                                    │  │  │
│  │  │                                                      │  │  │
│  │  │  Usuario:     maria@empresa.cl                       │  │  │
│  │  │  Contrasena:  Abc4kLm9NpQr                           │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │        [ Ingresar a Capital Academy ]  (boton CTA)         │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  PROXIMOS PASOS                                      │  │  │
│  │  │                                                      │  │  │
│  │  │  1. Ingresa con tus credenciales.                    │  │  │
│  │  │  2. Completa tu perfil (nombre, RUT, telefono).      │  │  │
│  │  │  3. Accede al aula virtual y comienza tu programa.   │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  Si tienes preguntas, responde directamente este correo.   │  │
│  │                                                            │  │
│  │  Capital Academy                                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Pagina de completacion de perfil (`/onboarding/complete-profile`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Capital Academy                              [Cerrar sesion]    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │     Bienvenido a Capital Academy                           │  │
│  │                                                            │  │
│  │     Completa tu perfil para acceder al aula virtual.       │  │
│  │     Los campos marcados con * son obligatorios.            │  │
│  │                                                            │  │
│  │     ── Datos obligatorios ──────────────────────────────   │  │
│  │                                                            │  │
│  │     Nombre completo *                                      │  │
│  │     ┌────────────────────────────────────────────────┐     │  │
│  │     │ Maria Lopez Gonzalez                           │     │  │
│  │     └────────────────────────────────────────────────┘     │  │
│  │                                                            │  │
│  │     Telefono *                                             │  │
│  │     ┌────────────────────────────────────────────────┐     │  │
│  │     │ +56 9 1234 5678                                │     │  │
│  │     └────────────────────────────────────────────────┘     │  │
│  │                                                            │  │
│  │     RUT *                                                  │  │
│  │     ┌────────────────────────────────────────────────┐     │  │
│  │     │ 12.345.678-9                                   │     │  │
│  │     └────────────────────────────────────────────────┘     │  │
│  │     Formato: XX.XXX.XXX-X (con puntos y guion)             │  │
│  │                                                            │  │
│  │     ── Datos opcionales (puedes completarlos despues) ──   │  │
│  │                                                            │  │
│  │     Empresa           Cargo                                │  │
│  │     ┌──────────────┐  ┌──────────────────────────────┐     │  │
│  │     │               │  │                              │     │  │
│  │     └──────────────┘  └──────────────────────────────┘     │  │
│  │                                                            │  │
│  │     LinkedIn URL                                           │  │
│  │     ┌────────────────────────────────────────────────┐     │  │
│  │     │ https://linkedin.com/in/...                    │     │  │
│  │     └────────────────────────────────────────────────┘     │  │
│  │                                                            │  │
│  │              [ Completar perfil y continuar ]              │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Comportamiento:**
- Los campos `full_name` y `phone` vienen prellenados si el admin los cargo al crear la cuenta.
- El campo `rut` se valida con algoritmo de digito verificador chileno (modulo 11). Se formatea automaticamente al salir del campo.
- El boton se habilita cuando los 3 campos requeridos estan llenos y validos.
- Al enviar, se llama `PATCH /api/onboarding/complete-profile` y se redirige a `/classroom`.

### 5.3 Importacion CSV en admin panel

```
┌──────────────────────────────────────────────────────────────────┐
│  Capital Academy Admin                       [Avatar] Admin      │
├──────────┬───────────────────────────────────────────────────────┤
│ Sidebar  │  Importar alumnos por CSV                             │
│          │                                                       │
│          │  Paso 1: Sube tu archivo CSV                          │
│          │  ┌─────────────────────────────────────────────────┐  │
│          │  │                                                 │  │
│          │  │     Arrastra tu CSV aqui                        │  │
│          │  │     o haz click para seleccionar archivo        │  │
│          │  │                                                 │  │
│          │  │     Formato: email, nombre_completo             │  │
│          │  │     Opcionales: telefono, rut                   │  │
│          │  │     [Descargar plantilla CSV]                   │  │
│          │  │                                                 │  │
│          │  └─────────────────────────────────────────────────┘  │
│          │                                                       │
│          │  Paso 2: Selecciona la cohorte destino                │
│          │  ┌─────────────────────────────────────────────────┐  │
│          │  │ Diplomado Ejecutivo 2S-2026               ▼    │  │
│          │  └─────────────────────────────────────────────────┘  │
│          │                                                       │
│          │  Paso 3: Revisa y confirma                             │
│          │  ┌──────────────────────────────────────────────────┐ │
│          │  │ #  │ Estado    │ Email           │ Nombre        │ │
│          │  ├────┼───────────┼─────────────────┼───────────────┤ │
│          │  │ 1  │ ● Nuevo   │ ana@mail.cl     │ Ana Torres    │ │
│          │  │ 2  │ ● Nuevo   │ pedro@mail.cl   │ Pedro Soto    │ │
│          │  │ 3  │ ● Existe  │ maria@mail.cl   │ Maria Lopez   │ │
│          │  │ 4  │ ● Error   │ juanmail.cl     │ Juan Perez    │ │
│          │  │    │           │ Email invalido  │               │ │
│          │  │ 5  │ ● Error   │ ana@mail.cl     │ Ana Torres    │ │
│          │  │    │           │ Duplicado fila 1│               │ │
│          │  └──────────────────────────────────────────────────┘ │
│          │                                                       │
│          │  Resumen: 2 nuevos · 1 existente · 2 errores          │
│          │                                                       │
│          │  [Cancelar]                     [Importar 3 alumnos]  │
└──────────┴───────────────────────────────────────────────────────┘
```

**Despues de confirmar:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Importacion completada                                          │
│                                                                  │
│  ████████████████████████████████████████ 100%                   │
│                                                                  │
│  ✓ 2 usuarios creados y matriculados                             │
│  ✓ 1 usuario existente asignado a la cohorte                     │
│  ✗ 2 filas con errores (omitidas)                                │
│                                                                  │
│  Se enviaron 3 emails de invitacion.                             │
│                                                                  │
│  [Descargar reporte de errores]  [Volver a usuarios]             │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Perfil del alumno en classroom (`/classroom/profile`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Capital Academy          [Cohorte: Dip. 2S-2026]  [ML]         │
├──────────┬───────────────────────────────────────────────────────┤
│ Sidebar  │  Mi perfil                                            │
│          │                                                       │
│ Modulos  │  ┌──────────────────────────────────────────────────┐ │
│ Mi perfil│  │  ┌──────┐                                        │ │
│          │  │  │ [ML] │  Maria Lopez Gonzalez                  │ │
│          │  │  │avatar│  maria@empresa.cl                      │ │
│          │  │  └──────┘  [Cambiar foto]                        │ │
│          │  └──────────────────────────────────────────────────┘ │
│          │                                                       │
│          │  ── Datos personales ────────────────────────────────  │
│          │                                                       │
│          │  Nombre completo *     Telefono *                     │
│          │  ┌────────────────┐    ┌────────────────────────┐     │
│          │  │ Maria Lopez G. │    │ +56 9 1234 5678        │     │
│          │  └────────────────┘    └────────────────────────┘     │
│          │                                                       │
│          │  RUT *                  Email (no editable)            │
│          │  ┌────────────────┐    ┌────────────────────────┐     │
│          │  │ 12.345.678-9   │    │ maria@empresa.cl       │     │
│          │  └────────────────┘    └────────────────────────┘     │
│          │                                                       │
│          │  ── Datos profesionales ─────────────────────────────  │
│          │                                                       │
│          │  Empresa                Cargo                          │
│          │  ┌────────────────┐    ┌────────────────────────┐     │
│          │  │ Inmobiliaria X │    │ Gerente Comercial      │     │
│          │  └────────────────┘    └────────────────────────┘     │
│          │                                                       │
│          │  LinkedIn URL                                          │
│          │  ┌──────────────────────────────────────────────┐     │
│          │  │ https://linkedin.com/in/marialopez           │     │
│          │  └──────────────────────────────────────────────┘     │
│          │                                                       │
│          │  Bio corta                                             │
│          │  ┌──────────────────────────────────────────────┐     │
│          │  │ 10 anos de experiencia en el sector          │     │
│          │  │ inmobiliario...                              │     │
│          │  └──────────────────────────────────────────────┘     │
│          │                                                       │
│          │  ── Contacto de emergencia ──────────────────────────  │
│          │                                                       │
│          │  Nombre                  Telefono                      │
│          │  ┌────────────────┐    ┌────────────────────────┐     │
│          │  │ Juan Lopez     │    │ +56 9 8765 4321        │     │
│          │  └────────────────┘    └────────────────────────┘     │
│          │                                                       │
│          │  Direccion                                             │
│          │  ┌──────────────────────────────────────────────┐     │
│          │  │ Av. Providencia 1234, Santiago               │     │
│          │  └──────────────────────────────────────────────┘     │
│          │                                                       │
│          │                           [Guardar cambios]           │
└──────────┴───────────────────────────────────────────────────────┘
```

### 5.5 Admin — Detalle de usuario con estado de onboarding

Extension de la ficha existente en `/admin/users/[userId]`:

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Usuarios    Maria Lopez                                       │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│          │  ┌── Datos del perfil ──────────────────────────────┐ │
│          │  │  Nombre:       Maria Lopez Gonzalez              │ │
│          │  │  Email:        maria@empresa.cl                  │ │
│          │  │  Telefono:     +56 9 1234 5678                   │ │
│          │  │  RUT:          12.345.678-9                      │ │
│          │  │  Empresa:      Inmobiliaria X                    │ │
│          │  │  Rol global:   user                              │ │
│          │  │  Creado:       15 may 2026                       │ │
│          │  │  Onboarding:   ● Completado (16 may 2026 14:32) │ │
│          │  │                                                  │ │
│          │  │  Invitaciones enviadas:                          │ │
│          │  │  ├ 15 may 2026 10:15 — Creacion manual (Admin)  │ │
│          │  │  └ 15 may 2026 11:40 — Reenvio (Admin)          │ │
│          │  │                                                  │ │
│          │  │          [Editar perfil]  [Acciones ▼]           │ │
│          │  └──────────────────────────────────────────────────┘ │
│          │                                                       │
│          │  (... participacion en cohortes, actividad reciente)   │
└──────────┴───────────────────────────────────────────────────────┘
```

Si el onboarding esta pendiente:

```
│  │  Onboarding:   ○ Pendiente                             │ │
│  │                Creado hace 3 dias, no ha completado     │ │
│  │                su perfil.                               │ │
```

---

## 6. API endpoints

### 6.1 Endpoints nuevos

| Endpoint | Metodo | Roles | Descripcion |
|---|---|---|---|
| `POST /api/admin/send-invitation` | POST | admin, ops | Envia o reenvia email de invitacion. Body: `{ user_id, cohort_id? }`. Genera nueva contrasena temporal si es reenvio. |
| `POST /api/admin/users/bulk` | POST | admin | Importacion masiva. Body: `{ rows: [{ email, full_name, phone?, rut? }], cohort_id }`. Retorna resumen con creados, asignados, errores. |
| `PATCH /api/onboarding/complete-profile` | PATCH | authenticated (user) | Completa el perfil del alumno. Body: `{ full_name, phone, rut, company?, job_title?, linkedin_url? }`. Setea `onboarding_completed_at`. |
| `GET /api/classroom/profile` | GET | authenticated | Retorna el perfil completo del usuario autenticado. |
| `PATCH /api/classroom/profile` | PATCH | authenticated | Actualiza campos del perfil (excepto email y system_role). |

### 6.2 Endpoints existentes que se extienden

| Endpoint | Cambio |
|---|---|
| `POST /api/admin/users` | Despues de crear el usuario, genera contrasena temporal, llama a `POST /api/admin/send-invitation` internamente, registra en `invitation_log`. |
| `POST /api/flow/webhook` | En el bloque `succeeded && !wasAlreadyPaid`, agrega logica de auto-registro: buscar/crear auth user + profile + enrollment + enviar invitacion. |

### 6.3 Detalle de `POST /api/admin/users/bulk`

**Request:**

```typescript
{
  rows: Array<{
    email: string;           // requerido
    full_name: string;       // requerido
    phone?: string;          // opcional
    rut?: string;            // opcional
  }>;
  cohort_id: string;         // UUID de la cohorte destino
}
```

**Response (200):**

```typescript
{
  summary: {
    total: number;
    created: number;          // usuarios nuevos creados
    assigned: number;         // usuarios existentes asignados a cohorte
    errors: number;
  };
  results: Array<{
    row: number;              // indice 0-based de la fila
    email: string;
    status: "created" | "assigned" | "error";
    error?: string;           // solo si status === "error"
    user_id?: string;         // solo si status !== "error"
  }>;
}
```

**Limites:**
- Maximo 50 filas por request.
- Timeout: 60 segundos (`export const maxDuration = 60` en el route handler).
- Rate limit: 5 requests por minuto por admin (previene ejecucion accidental multiple).

---

## 7. Modelo de datos

### 7.1 Cambios en `profiles`

```sql
-- Migracion: XXXX_add_onboarding_profile_fields.sql

alter table public.profiles
  add column rut text,
  add column company text,
  add column job_title text,
  add column linkedin_url text,
  add column bio text,
  add column address text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column onboarding_completed_at timestamptz;

-- Indice parcial para queries de "pendientes de onboarding"
create index profiles_onboarding_pending_idx
  on public.profiles (id)
  where onboarding_completed_at is null;

-- Unicidad de RUT (solo cuando no es null)
create unique index profiles_rut_unique_idx
  on public.profiles (rut)
  where rut is not null;

-- Marcar perfiles existentes de staff como completados
update public.profiles
  set onboarding_completed_at = now()
  where system_role in ('ops', 'admin');
```

### 7.2 Nueva tabla `invitation_log`

```sql
create table public.invitation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  resend_message_id text,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles(id) on delete set null,
  source text not null default 'manual',
  cohort_id uuid references public.cohorts(id) on delete set null,

  constraint invitation_log_source_check
    check (source in ('manual', 'csv_import', 'payment_webhook'))
);

create index invitation_log_user_idx on public.invitation_log(user_id);
create index invitation_log_sent_at_idx on public.invitation_log(sent_at desc);

alter table public.invitation_log enable row level security;

create policy invitation_log_staff_all on public.invitation_log
  for all using (public.is_platform_staff());
```

### 7.3 RLS para campos nuevos de `profiles`

Las RLS policies existentes de `profiles` ya permiten que el usuario edite su propio perfil y que staff vea todos los perfiles. Solo se necesita asegurar que las nuevas columnas esten cubiertas por las policies existentes (lo estan, porque las policies aplican a nivel de fila, no de columna).

**Validacion adicional a nivel de API:** el endpoint `PATCH /api/onboarding/complete-profile` solo acepta actualizar columnas de perfil del usuario autenticado, y solo si `onboarding_completed_at IS NULL` (idempotencia).

### 7.4 Diagrama de relaciones (agregado)

```
profiles
  |
  +-- invitation_log (user_id)       ← NUEVO
  |
  +-- cohort_roles (user_id)
  |     +-- cohorts (cohort_id)
  |
  +-- enrollments (student_id)
  |     +-- cohorts (cohort_id)
  |
  +-- payments (email match)          ← vinculo logico, no FK
```

---

## 8. Integraciones

| Sistema | Uso en onboarding | Direccion |
|---|---|---|
| **Resend** | Envio de email de invitacion (HTML + texto plano) | Outbound |
| **Supabase Auth** | Creacion de auth.users con contrasena temporal, update de contrasena en reenvios | Admin API |
| **Supabase DB** | Profiles, enrollments, cohort_roles, invitation_log | CRUD |
| **Flow** (webhook) | Trigger de auto-registro cuando pago es aprobado | Inbound |
| **Papa Parse** (client) | Parseo de CSV en el browser antes de enviar al API | Client-side |

---

## 9. Edge cases

### 9.1 Email duplicado en CSV

**Escenario:** El CSV tiene `maria@mail.cl` en la fila 3 y en la fila 12.

**Comportamiento:** La validacion client-side detecta el duplicado y marca la fila 12 como error ("Duplicado: misma direccion que fila 3"). Solo la primera ocurrencia se procesa.

### 9.2 Email del pago no corresponde a un usuario existente con datos distintos

**Escenario:** Juan paga con `juan@gmail.com`, pero el admin ya lo creo como `juan.perez@empresa.cl`.

**Comportamiento:** El sistema crea un nuevo auth user con `juan@gmail.com` (porque no encuentra match). Juan termina con dos cuentas. Solucion manual: el admin detecta el duplicado en la lista de usuarios y fusiona las cuentas (fuera de scope del MVP, se resuelve borrando la duplicada y reasignando el enrollment).

### 9.3 Alumno no completa el perfil en 7+ dias

**Escenario:** Maria recibio el email, ingreso una vez, vio el formulario de perfil y cerro sesion sin completarlo. Pasaron 7 dias.

**Comportamiento:**
- El guard de onboarding sigue activo: cada vez que Maria ingrese, vera el formulario.
- En el panel admin, Maria aparece con badge "Pendiente" en la columna de onboarding.
- Recomendacion operativa (fuera del sistema): ops filtra usuarios con onboarding pendiente hace mas de 7 dias y los contacta por WhatsApp o telefono.
- Backlog V1.5: email automatico de recordatorio a los 3 y 7 dias.

### 9.4 Invitacion expirada / contrasena olvidada

**Escenario:** El alumno recibio el email hace 2 semanas pero no ingreso. No recuerda la contrasena temporal.

**Comportamiento:** La contrasena temporal no expira (es una contrasena real en Supabase Auth). Si el alumno la olvido, tiene dos caminos:
1. El admin le reenvia la invitacion (genera nueva contrasena y envia email).
2. El alumno usa "Olvide mi contrasena" en `/login` (usa el flujo built-in de Supabase Auth que envia un email de reset).

### 9.5 CSV con encoding incorrecto (Windows-1252)

**Escenario:** El admin exporto el CSV desde Excel en Windows. Los caracteres con tilde (nombre: "Jose") aparecen como "Jos\xe9".

**Comportamiento:** Papa Parse detecta el encoding automaticamente en la mayoria de los casos. Si falla, los nombres con caracteres especiales se muestran rotos en la preview. El admin puede corregirlos en la tabla de preview antes de confirmar, o re-exportar el CSV como UTF-8.

### 9.6 Pago aprobado pero no hay cohorte activa

**Escenario:** El alumno paga el diplomado, pero el admin aun no ha creado la cohorte del siguiente semestre.

**Comportamiento:**
- El auth user y el profile se crean normalmente.
- El enrollment NO se crea (no hay cohorte destino).
- Se registra un log de advertencia: `"auto-register: no active cohort for program ${programId}"`.
- El alumno recibe el email de invitacion con un texto generico (sin nombre de cohorte): "Tu acceso a Capital Academy esta listo. Te asignaremos a tu cohorte pronto."
- Ops recibe notificacion (via el email de equipo existente) y asigna manualmente cuando la cohorte este disponible.

### 9.7 Concurrencia: admin crea usuario y pago llega simultaneamente

**Escenario:** El admin esta creando manualmente a `maria@mail.cl` al mismo tiempo que el webhook de Flow llega con el pago de Maria.

**Comportamiento:**
- Supabase Auth tiene constraint de unicidad por email. El segundo `createUser` falla con "User already registered".
- Tanto el endpoint de creacion manual como el webhook manejan este caso: si el auth user ya existe, solo crean enrollment + cohort_role.
- La invitacion se envia desde quien termine primero. El segundo flujo no envia un segundo email (verifica `invitation_log` para la cohorte).

---

## 10. Metricas de exito

| Metrica | Target MVP | Como se mide |
|---|---|---|
| Tiempo para dar de alta 1 alumno (con email) | < 2 min | UX testing manual |
| Tiempo para importar 35 alumnos via CSV | < 5 min | UX testing con CSV real |
| Alumnos que ingresan la primera semana | > 90% (vs 70% actual) | `profiles.onboarding_completed_at` dentro de 7 dias post-creacion |
| Tiempo entre pago y primer acceso disponible | < 5 min (automatico) | `payments.paid_at` vs `profiles.created_at` |
| Perfiles con RUT completo | 100% de quienes completaron onboarding | `profiles.rut IS NOT NULL WHERE onboarding_completed_at IS NOT NULL` |
| Emails de invitacion entregados exitosamente | > 98% | Resend delivery rate via `invitation_log.resend_message_id` |
| Errores de CSV que requieren soporte | < 5% de importaciones | Ratio de errores en `POST /api/admin/users/bulk` responses |

---

## 11. Dependencias y prerequisitos

| Dependencia | Estado | Bloqueante |
|---|---|---|
| Modelo RBAC (ADR-0004) implementado: `system_role`, `cohort_roles`, trigger sync | ✅ ADR escrito, migracion pendiente | Si |
| Resend configurado con dominio verificado | ✅ Configurado | Si |
| Panel admin de usuarios existente | ✅ Implementado (`/admin/users`) | Si |
| Endpoint de creacion de usuario existente | ✅ `POST /api/admin/users` | Si |
| Webhook de Flow existente | ✅ `POST /api/flow/webhook` | Si |
| Papa Parse (libreria de parseo CSV) | Pendiente instalacion | No (se instala con `pnpm add papaparse @types/papaparse`) |
| Libreria de validacion de RUT chileno | Pendiente instalacion | No (`pnpm add rut.js` o validacion manual con modulo 11) |

---

## 12. Fases de implementacion

### Fase 1 — Migracion de datos y email de invitacion (Sprint 4)

1. Migracion SQL: agregar columnas a `profiles` + crear tabla `invitation_log`.
2. Crear `lib/auth/temp-password.ts` (generacion de contrasena temporal).
3. Crear `lib/email/invitation.ts` (template de email de invitacion, siguiendo patron de `payment-confirmation.ts`).
4. Crear `POST /api/admin/send-invitation` (enviar/reenviar email).
5. Extender `POST /api/admin/users` para generar contrasena temporal + enviar invitacion automaticamente.
6. Conectar boton "Reenviar email de acceso" en la ficha de usuario (ya existe el boton, falta la logica).
7. Mostrar historial de invitaciones en la ficha de usuario.

### Fase 2 — Completacion de perfil obligatoria (Sprint 4)

8. Crear pagina `/onboarding/complete-profile` con formulario.
9. Crear `PATCH /api/onboarding/complete-profile`.
10. Agregar guard en `app/(classroom)/layout.tsx` para redirigir si onboarding pendiente.
11. Agregar columna/badge de estado de onboarding en lista de usuarios admin.
12. Agregar filtro "pendientes de onboarding" en lista de usuarios.

### Fase 3 — Importacion CSV (Sprint 5)

13. Instalar Papa Parse.
14. Crear componente de upload + preview con semaforo.
15. Crear `POST /api/admin/users/bulk`.
16. Integrar en `/admin/users` con modal de importacion.
17. Implementar descarga de reporte de errores.

### Fase 4 — Auto-registro post-pago (Sprint 5)

18. Crear `lib/onboarding/auto-register.ts` (funcion reutilizable).
19. Extender `app/api/flow/webhook/route.ts` para llamar a auto-register.
20. Manejar edge case de cohorte no disponible.
21. Manejar email duplicado (usuario ya existe).

### Fase 5 — Perfil del alumno (Sprint 5-6)

22. Crear pagina `/classroom/profile`.
23. Crear `GET /api/classroom/profile` y `PATCH /api/classroom/profile`.
24. Upload de avatar a Supabase Storage.
25. Agregar enlace "Mi perfil" en sidebar del classroom.

---

## 13. Preguntas abiertas

| # | Pregunta | Impacto | Decisor |
|---|---|---|---|
| 1 | El cambio de contrasena debe ser obligatorio en el primer login o solo recomendado? | Seguridad vs friccion | Direccion |
| 2 | Se necesita un email de recordatorio automatico para quienes no completan el onboarding en X dias? | Operacion, retention | Producto |
| 3 | El admin debe poder ver la contrasena temporal generada (para comunicarla verbalmente si el email falla)? | Seguridad vs practicidad | Direccion |
| 4 | Cuando Fintoc se active como payment provider, el auto-registro usa el mismo webhook o uno separado? | Arquitectura | Desarrollo |
| 5 | Los datos del formulario de pago (RUT, telefono) deben pre-llenar el perfil del auto-registro, o el alumno los reingresa en onboarding? | UX, consistencia de datos | Producto |
