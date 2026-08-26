# ADR-0038: Gestor de leads propio en la plataforma, no en el CRM de la empresa

- **Status:** proposed
- **Date:** 2026-08-26
- **Deciders:** Elkis (desarrollo), comercial (Capital Academy)
- **Tags:** data-model, captación, crm

## Contexto

`/admin/leads` muestra los contactos que dejan sus datos en las landings, pero
es **de solo lectura**: se ve el lead y se descarga un XLSX. El seguimiento real
—a quién llamé, qué me dijo, cuándo lo vuelvo a llamar— se hace a mano sobre esa
planilla descargada.

El problema es que el XLSX es un **snapshot**. La descarga del día siguiente trae
los leads nuevos pero pierde todo lo anotado en la anterior, así que hay que
copiar las filas nuevas de una planilla a la otra a mano. En la conversación del
26-ago quedó dicho textualmente: *"la lata es que mañana cuando lo abra tengo que
volver a descargarlo… tendría que agarrar los últimos de aquí y copiarlos en la
anterior"*. El trabajo que importa vive fuera del sistema.

La restricción de tiempo es real: la campaña del Diplomado sale la semana del
1-sep y van a caer leads de diplomado, liderazgo y ruta a la vez.

## Decisión

Construir un **gestor de leads liviano dentro de Capital Academy**: etapa por
lead, bitácora de contacto (nota, llamada con resultado, correo, WhatsApp),
tareas con vencimiento y un recordatorio diario por correo.

No es un CRM. No hay automatizaciones, ni secuencias, ni scoring, ni envío de
WhatsApp desde la plataforma. Es el registro de lo que ya se hace a mano.

**Convive con el CRM de la empresa, no lo reemplaza.** El CRM sigue siendo el
sistema de la gestión comercial inmobiliaria; este gestor cubre solo captación
educativa. Queda escrito acá para que nadie derive lo contrario sin una decisión
explícita: son dos fuentes de verdad de contactos y esa duplicación es
deliberada, no un descuido.

## Opciones consideradas

### Opción A — Usar el CRM de la empresa
- **Pros:** ya existe, ya está pagado, una sola herramienta comercial.
- **Contras:** está armado para gestión inmobiliaria y no maneja los campos de
  estos leads (`program_interest`, `lidera_equipo`, `personas_a_cargo`,
  `desafios` — las columnas de la migración 0103). Habría que crear campos
  personalizados para cada uno. Además la persona de comercial todavía no tiene
  cuenta abierta ahí, así que la alternativa nunca llegó a probarse.

### Opción B — Mejorar el XLSX (más columnas, más filtros)
- **Pros:** cambio mínimo, cero modelo de datos nuevo.
- **Contras:** no resuelve el problema. El problema no es qué columnas trae la
  planilla, es que la planilla no guarda estado entre descargas. Cualquier
  mejora al export sigue perdiendo las anotaciones.

### Opción C — Gestor propio en la plataforma **(elegida)**
- **Pros:** el estado vive donde ya viven los leads; conoce los campos de cada
  landing sin configuración; el mismo panel sirve para mirar y para trabajar.
- **Contras:** una segunda herramienta comercial en la empresa; hay que
  construirla y mantenerla.

### Opción D — Tablero kanban arrastrable
- **Pros:** es la metáfora que la gente espera de un CRM.
- **Contras:** es la parte más cara de construir y la más frágil en móvil. Con
  decenas de leads, un selector de etapa en el detalle más chips de filtro da el
  mismo resultado operativo. Se puede agregar después sobre el mismo modelo de
  datos, sin migración.

## Decisiones de diseño

- **Dos tablas y no una.** `lead_activity` es lo que ya pasó (append-only) y
  `lead_tasks` es lo que va a pasar. Juntarlas obligaría a un `due_at` nullable
  cuyo significado cambia según la fila.
- **`stage` como columna de `leads`**, no derivada del último `stage_change`: el
  panel filtra y cuenta por ella en cada carga.
- **Mover la etapa y anotarlo es una sola operación.** Lo hace la función
  `mover_etapa_lead` en una transacción; hecho desde la aplicación, un fallo a
  medio camino dejaría la bitácora mintiendo.
- **RLS deny-all en las dos tablas nuevas**, igual que `leads` (0074). Son datos
  de contacto de terceros; el único camino es service_role desde rutas que ya
  pasaron por `authorizeAdmin()`.
- **El recordatorio v1 es correo, no calendario.** Conectar el Google Calendar
  propio implica OAuth y un contrato externo que no cabía en el plazo. La v2 más
  barata es un enlace `.ics` por tarea, sin OAuth.
- **Sin "asignado a".** Hoy gestiona una sola persona. Se registra `created_by`
  para saber a quién avisarle; cuando sean dos, la columna ya está.

## Consecuencias

### Positivas
- El seguimiento deja de vivir en una planilla local y pasa a ser consultable,
  auditable y compartible.
- La pregunta "¿a quién tengo que llamar hoy?" se responde al abrir el panel.
- El XLSX sigue existiendo como **reporte** (ahora con etapa y último contacto),
  que es para lo que sirve.

### Negativas
- Dos sistemas comerciales en la empresa. Un contacto de la base inmobiliaria
  que se interese en un programa va a existir en los dos lados sin vínculo.
- Es superficie nueva que mantener: 2 tablas, 5 rutas, 1 cron.

### Neutras
- El modelo soporta un tablero kanban más adelante sin migración.

## Referencias

- `docs/specs/gestor-de-leads.md` — la especificación completa
- `db/migrations/0107_gestor_de_leads.sql`
- ADR-0012 (umbral de cobertura para rutas de leads)
- Conversación grabada del 2026-08-26
