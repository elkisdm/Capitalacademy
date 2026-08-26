# Gestor de leads en `/admin/leads`

**Clasificación**: `feat` · large · riesgo med · known · toca `db/migrations/`, `lib/admin/`, `app/(admin)/admin/leads/`, `app/api/admin/leads/`, `app/api/cron/`
**Tier**: 3 — Full
**Origen**: conversación grabada del 2026-08-26 (`New Recording 111.m4a`)

---

## Objetivo

Que comercial pueda **gestionar** los leads dentro de la plataforma en vez de
descargar una planilla y anotar a mano: registrar a quién ya contactó y por qué
canal, dejar notas, agendar la próxima llamada con recordatorio, y mover el lead
por etapas hasta "matriculado".

Hoy `/admin/leads` es de **solo lectura**: se ve el lead y se descarga un XLSX.
El XLSX es un *snapshot* — cada descarga nueva pierde lo anotado a mano en la
anterior. Ese es el problema que este cambio resuelve.

**Por qué ahora**: la campaña del Diplomado sale la semana del 2026-09-01. Van a
caer leads de diplomado + liderazgo + ruta a la vez y no hay dónde hacerles
seguimiento.

---

## Hallazgos de exploración

1. **El CRM de la empresa no sirve para estos leads.** Está armado para gestión
   comercial inmobiliaria y no maneja `program_interest`, `lidera_equipo`,
   `personas_a_cargo` ni `desafios` (las columnas de la `0103`). Habría que
   crear campos personalizados. Además comercial todavía no tiene cuenta abierta
   ahí, así que la alternativa nunca se probó.
2. **`leads` es deny-all.** RLS habilitada sin ninguna policy (`0074`): el único
   escritor es `app/api/leads/route.ts` con service_role, y `leads-queries.ts`
   lee con `createAdminClient`. Cualquier escritura nueva sigue ese mismo camino.
3. **El panel ya tiene el patrón master–detail** de `/admin/alumnos`, filtra y
   busca en cliente (`leads-panel.tsx`, 298 líneas) y el volumen es de decenas
   por mes. No hace falta paginar ni filtrar en servidor.
4. **La infra de cron existe y está probada**: 5 Netlify Scheduled Functions que
   delegan a un route handler de Next validando `CRON_SECRET`. Un recordatorio
   diario reusa ese molde sin inventar nada.
5. **Restricción de cobertura**: el umbral fijo de rutas críticas de
   `vitest.config.ts` incluye el glob `**/leads/**` con `lines: 99.7`. Todo lo
   que viva bajo `app/api/admin/leads/` nace con esa exigencia.

---

## Supuestos (corrígeme si alguno está mal)

1. **Sin "asignado a".** Hoy gestiona los leads una sola persona. Se registra
   `created_by` en cada nota y tarea (barato, y sirve para el recordatorio),
   pero no se construye UI de asignación. Si mañana son dos personas, la columna
   ya está.
2. **El recordatorio v1 es correo diario, no calendario.** Conectar el Google
   Calendar propio implica OAuth y un contrato externo: no cabe en una semana.
   La v1 avisa por dos vías: una franja de "Pendientes" arriba del panel
   (vencidas + de hoy) y un correo digest a las 08:00 de Chile que solo sale si
   hay algo que avisar.
3. **La etapa se mueve a mano.** No se detecta automáticamente que un lead se
   matriculó cruzando el correo contra `enrollments`. Se puede hacer después;
   automatizarlo ahora mete un cruce de identidad que nadie pidió.
4. **Las 5 etapas van fijas en un CHECK**, no configurables: nuevo → contactado
   → interesado → matriculado / descartado. Cambiarlas es una migración de una
   línea; hacerlas configurables es una pantalla de administración que nadie usó
   todavía.
5. **Las tablas nuevas nacen deny-all**, igual que `leads`. Son datos de
   contacto de terceros que no dieron consentimiento para nada más: nunca se
   consultan desde el navegador con la llave anónima.
6. **Este gestor no reemplaza al CRM de la empresa**: convive con él y cubre
   solo captación educativa. Queda dicho en el ADR para que no se derive sin
   decisión.

---

## Criterios de aceptación

- [ ] Cada lead tiene una **etapa** visible, cambiable desde el detalle, y el
      panel se filtra por etapa.
- [ ] Cambiar la etapa **queda registrado** en el historial con quién y cuándo.
- [ ] Se puede **registrar un contacto** sobre un lead: llamada (con resultado
      contestó / no contestó / número equivocado), correo o WhatsApp.
- [ ] Se puede **escribir una nota libre** sobre un lead y queda en el historial,
      lo más reciente primero.
- [ ] Se puede **agendar una tarea con fecha y hora** ("llamar mañana 11:00") y
      marcarla como hecha.
- [ ] Al abrir `/admin/leads` se ve arriba **qué está vencido y qué vence hoy**,
      con acceso directo al lead.
- [ ] Un **correo diario a las 08:00 de Chile** avisa las tareas vencidas y las
      del día a quien las creó. Si no hay ninguna, no se envía nada.
- [ ] El listado **distingue el programa de interés** (diplomado / liderazgo /
      ruta / indeciso) — ya existe, se mantiene al agregar los chips de etapa.
- [ ] El **XLSX incluye la etapa y la fecha del último contacto**, para que la
      descarga siga sirviendo como reporte sin ser el lugar donde se trabaja.
- [ ] Borrar un lead borra en cascada su historial y sus tareas.
- [ ] Nada de esto es alcanzable sin ser `ops`/`admin`.

---

## Técnico

### Modelo de datos — migración `0107_gestor_de_leads.sql`

```
alter table leads
  add column stage text not null default 'nuevo'
    check (stage in ('nuevo','contactado','interesado','matriculado','descartado'));

create table lead_activity (      -- lo que YA pasó (append-only)
  id, lead_id -> leads on delete cascade,
  kind check ('note','call','email','whatsapp','stage_change'),
  outcome text null,              -- llamada: contestó / no contestó / equivocado
  body text null,                 -- nota, o "nuevo -> contactado"
  created_at, created_by -> profiles
);

create table lead_tasks (         -- lo que VA a pasar
  id, lead_id -> leads on delete cascade,
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz null,
  created_at, created_by -> profiles
);
```

Dos tablas y no una: una nota no tiene vencimiento y una tarea no es un hecho
ocurrido. Meterlas juntas obliga a un `due_at` nullable cuyo significado cambia
según la fila — justo el tipo de columna que después nadie sabe leer.

`stage` va en `leads` y no en la bitácora porque es una propiedad del lead: el
panel filtra y cuenta por ella, y derivarla del último `stage_change` sería un
`distinct on` en cada carga para un dato que cabe en una columna.

Índices: `lead_activity(lead_id, created_at desc)` y
`lead_tasks(due_at) where done_at is null` (el índice parcial es el que sirve al
digest y a la franja de pendientes; las tareas hechas no se consultan por fecha).

RLS habilitada **sin policies** en ambas, igual que `leads`. Falla cerrado.

### Rutas

| Ruta | Método | Qué hace |
|------|--------|----------|
| `app/api/admin/leads/[leadId]/route.ts` | `PATCH` | Cambia la etapa. Escribe el `stage_change` en la misma operación. |
| `app/api/admin/leads/[leadId]/activity/route.ts` | `POST` | Registra nota / llamada / correo / WhatsApp. |
| `app/api/admin/leads/[leadId]/tasks/route.ts` | `POST` | Agenda una tarea. |
| `app/api/admin/leads/tasks/[taskId]/route.ts` | `PATCH` · `DELETE` | Marca hecha/pendiente, o borra. |
| `app/api/cron/lead-tasks/route.ts` | `POST` | Digest diario. Valida `CRON_SECRET`. |

Todas gatean con `authorizeAdmin()` y escriben con `createAdminClient()`, mismo
molde que `app/api/admin/instructors/route.ts`. Validación con `zod`.

### Decisión de diseño: por qué no un pipeline arrastrable

La conversación mencionó "moverlos de etapa como si fuera un CRM". Un tablero
kanban con drag & drop es bonito y es la parte más cara de construir y de
mantener en móvil. Con decenas de leads, un **selector de etapa en el detalle**
más **chips de filtro por etapa** da el mismo resultado operativo con una
fracción del código. Si el volumen crece a cientos, el tablero se agrega encima
del mismo modelo de datos sin migración.

### Plan de reversa

La `0107` es aditiva: columna con default y dos tablas nuevas. Revertir es
`drop table lead_activity, lead_tasks; alter table leads drop column stage;` sin
tocar un solo lead existente. El panel actual sigue funcionando si el código se
revierte y la migración queda.

---

## Spec (Given / When / Then)

**Escenario: mover un lead de etapa deja rastro**
- GIVEN un lead en etapa `nuevo`
- WHEN un `ops` la cambia a `contactado`
- THEN el lead queda en `contactado` Y aparece en su historial un
  `stage_change` con su autor y la hora

**Escenario: registrar una llamada sin respuesta**
- GIVEN un lead cualquiera
- WHEN se registra una llamada con resultado "no contestó"
- THEN el historial muestra la llamada con ese resultado, la más reciente arriba

**Escenario: una tarea vencida se ve al abrir el panel**
- GIVEN una tarea con `due_at` de ayer y sin `done_at`
- WHEN comercial abre `/admin/leads`
- THEN la franja de pendientes la muestra como vencida con acceso al lead

**Escenario: el digest no molesta cuando no hay nada**
- GIVEN ninguna tarea vencida ni que venza hoy
- WHEN corre el cron de las 08:00
- THEN no se envía ningún correo y la respuesta reporta 0 envíos

**Escenario: el digest agrupa por persona**
- GIVEN dos tareas vencidas creadas por personas distintas
- WHEN corre el cron
- THEN cada una recibe un correo solo con las suyas

**Escenario: borrar el lead se lleva su rastro**
- GIVEN un lead con notas y tareas
- WHEN se borra el lead
- THEN sus filas de `lead_activity` y `lead_tasks` desaparecen (cascade)

**Escenario: nadie fuera de staff toca esto**
- GIVEN una sesión de alumno
- WHEN llama a cualquiera de las rutas nuevas
- THEN recibe 403 y no se escribe nada

**Escenario: el cron exige su secreto**
- GIVEN una petición sin `Authorization: Bearer <CRON_SECRET>`
- WHEN llega a `/api/cron/lead-tasks`
- THEN recibe 401

---

## Archivos y rutas a tocar

*Verificado contra el código: sí.*

**Nuevos**
- `db/migrations/0107_gestor_de_leads.sql` — etapa + `lead_activity` + `lead_tasks`
- `lib/admin/leads-pipeline.ts` — puro: etapas, etiquetas, orden, y clasificación de una tarea en vencida / hoy / próxima
- `lib/email/lead-tasks-digest.ts` — plantilla del digest diario
- `app/api/admin/leads/[leadId]/route.ts` — PATCH etapa
- `app/api/admin/leads/[leadId]/activity/route.ts` — POST actividad
- `app/api/admin/leads/[leadId]/tasks/route.ts` — POST tarea
- `app/api/admin/leads/tasks/[taskId]/route.ts` — PATCH / DELETE tarea
- `app/api/cron/lead-tasks/route.ts` — digest diario
- `netlify/functions/lead-tasks-cron.mjs` — `schedule: "0 12 * * *"` (08:00 Chile en invierno)
- `app/(admin)/admin/leads/pendientes.tsx` — franja de vencidas / de hoy
- `app/(admin)/admin/leads/lead-seguimiento.tsx` — bloque de historial + notas + tareas del detalle
- `docs/adr/0038-gestor-de-leads-propio.md` — la decisión y su límite frente al CRM

**Modificados**
- `lib/admin/leads-queries.ts` — `stage` en `LeadRow`; `getLeadActivity`, `getOpenLeadTasks`, `getTasksDueForDigest`
- `lib/admin/leads-export.ts` — columnas "Etapa" y "Último contacto"
- `app/(admin)/admin/leads/page.tsx` — carga actividad y tareas; stats por etapa
- `app/(admin)/admin/leads/leads-panel.tsx` — chips de etapa, selector en el detalle, montaje del bloque de seguimiento
- `docs/codemap.md` · `CHANGELOG.md`

---

## Tests

- `lib/admin/__tests__/leads-pipeline.test.ts` — etapas válidas, transiciones, y el corte vencida/hoy/próxima en zona horaria de Chile (incluye el borde de medianoche)
- `lib/admin/__tests__/leads-export.test.ts` *(modificar)* — las dos columnas nuevas
- `app/api/admin/leads/[leadId]/__tests__/route.test.ts` — PATCH feliz + etapa inválida (422) + no-staff (403)
- `app/api/admin/leads/[leadId]/activity/__tests__/route.test.ts` — cada `kind`, `outcome` inválido, lead inexistente (404), 403
- `app/api/admin/leads/[leadId]/tasks/__tests__/route.test.ts` — alta feliz, `due_at` inválido, 403
- `app/api/admin/leads/tasks/[taskId]/__tests__/route.test.ts` — completar, revertir, borrar, 403
- `app/api/cron/lead-tasks/__tests__/route.test.ts` — sin pendientes no envía, agrupa por persona, 401 sin secreto
- `lib/email/__tests__/lead-tasks-digest.test.ts` — asunto y cuerpo con 1 y con N tareas

**Cobertura**: todo lo que cae bajo `app/api/admin/leads/**` entra en el glob
crítico de `vitest.config.ts` (`lines: 99.7`, `branches: 98.87`). Cada rama de
error de esas rutas necesita su caso; no alcanza con el camino feliz.

---

## Tareas

1. Migración `0107` — escribirla, aplicarla a local, verificar el cascade.
2. `lib/admin/leads-pipeline.ts` + su test (puro, sin BD; se hace primero porque el resto depende de sus tipos).
3. Lecturas en `leads-queries.ts` (`stage`, actividad, tareas abiertas).
4. Rutas de etapa y actividad + tests.
5. Rutas de tareas + tests.
6. Detalle del lead: selector de etapa, historial, alta de nota y de tarea.
7. Chips de etapa en el listado + franja de pendientes + stats por etapa.
8. Columnas nuevas del XLSX + test.
9. Digest: plantilla, route del cron, función de Netlify, tests.
10. ADR-0038, codemap, CHANGELOG.

Las tareas 1–7 son el núcleo: si la semana aprieta, la 9 (digest por correo) se
corta sin romper nada — la franja de pendientes ya cubre el aviso mientras
comercial abra el panel.

---

## Fuera de alcance

- **Conectar Google Calendar** (OAuth). La v2 más barata es un enlace `.ics` por
  tarea, sin OAuth.
- **Enviar WhatsApp desde la plataforma.** El botón actual abre `wa.me` con el
  WhatsApp de quien hace clic, y así se queda. El Evolution API con QR vive en
  el CRM, no acá.
- **Secuencias automáticas de correo a leads.** Quedó explícitamente pendiente
  de definir "qué tan encima vamos a estar de la gente".
- **Detección automática de que un lead se matriculó** cruzando correo contra
  `enrollments`.
- **Tablero kanban arrastrable** (ver la decisión de diseño arriba).
- **Migrar o sincronizar con el CRM de la empresa.**
