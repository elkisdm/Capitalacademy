# ADR-0016: Ventana de programación (apertura/cierre) de evaluaciones

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza
- **Tags:** classroom, quiz, evaluations, scheduling

## Contexto

La operación (Camila) pidió, en la reunión del 15-jul con la profe Paola, poder programar la
apertura y cierre de un quiz por fecha-hora ("que se active el miércoles a las nueve y media...
y que se desactive sólo a la hora que yo ponga"), y Paola lo ratificó explícitamente ("subís
todos los cuices pero los dejai programados para que se activen y desactiven según el horario
que tú indiques"), conectándolo con el precedente ya existente en `deliverables`
(`db/migrations/0053_entregables.sql`), que resuelve el mismo problema para entregables con
`opens_at`/`due_at`.

Hoy `evaluations.is_active` (`0033_evaluations.sql:34`) es un boolean simple: publicada o
borrador, activado/desactivado a mano por el staff. No existe ventana de tiempo.

Ver brief completo: `docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md` (Cambio 1).

## Decisión

1. **On-read, sin cron.** La disponibilidad se evalúa en cada lectura (server component o route
   handler), igual que el patrón vigente de `lessons.unlock_at` y de `deliverables`. Un cron
   (como `deliverable-openings` en `app/api/cron/deliverable-openings/route.ts`, que solo
   notifica) introduciría hasta 30 min de desfase — inaceptable para una hora exacta como
   "9:30" — y un estado derivado que puede desincronizarse.

2. **`is_active` sigue siendo el master switch (publicada/borrador); la ventana es un filtro
   adicional y opcional.** Los tres índices únicos parciales que dependen de `is_active`
   (`evaluations_one_final_per_program`, `evaluations_one_active_per_lesson`,
   `evaluations_one_active_per_module`/`_session`, en `0033` y `0040`) no se tocan: un índice
   único parcial no puede depender de `now()` (no es `IMMUTABLE`, `CREATE INDEX` lo rechaza), así
   que no existe forma de expresar "único activo AHORA" a nivel de índice. La disponibilidad real
   se calcula como:

   ```
   is_active AND (opens_at IS NULL OR now() >= opens_at) AND (closes_at IS NULL OR now() <= closes_at)
   ```

   `opens_at`/`closes_at` NULL/NULL preserva el comportamiento actual exacto (cero cambio al
   desplegar). El toggle manual "Activar/Desactivar" sigue funcionando igual.

3. **`opens_at`/`closes_at` son NULLABLE**, a diferencia del precedente de `deliverables` (que las
   tiene `NOT NULL`): una evaluación sí tiene sentido sin ventana (el quiz final no se programa).
   Nullable evita backfill de datos.

4. **Ventana uniforme para los 4 scopes** (`final`, `module`, `lesson`, `session`) en vez de
   exceptuar `final`: más simple; en la práctica el final queda NULL/NULL.

5. **`closes_at` gatea iniciar y ver, no entregar.** Un intento ya iniciado siempre se puede
   entregar (`submit`), aunque la ventana cierre mientras el alumno responde: aplicar `closes_at`
   en el submit le "quemaría" el intento sin nota. El límite por intento ya lo cubre
   `time_limit_minutes`. Concretamente: `quiz/route.ts` (estado) y `quiz/start/route.ts` /
   `evaluation/route.ts` / `evaluation/start/route.ts` aplican la ventana completa; `submit`
   (final y formativo) solo exige `is_active`.

   Nota: esto se aparta de una lectura literal de "se desactiva a la hora que yo ponga" (un
   intento iniciado justo antes del cierre seguiría aceptándose después). No se confirmó
   explícitamente con la operación antes de esta implementación — queda como decisión de
   ingeniería a validar si genera confusión en la práctica.

6. **Helper puro compartido** (`lib/classroom/evaluation-window.ts`, `getEvaluationState` /
   `isEvaluationOpen`) en vez de `.or()` de PostgREST: filtrado en JS, más legible, y una única
   fuente de verdad para las ~6 llamadas que necesitan la regla (sidebar, lección, sesión, los 3
   endpoints de quiz).

## Opciones consideradas

### Opción A — On-read con `is_active` + ventana opcional (elegida)
- Pros: reusa el patrón vigente (`unlock_at`, `deliverables`), sin desfase, sin infraestructura
  nueva, los índices únicos existentes no se tocan.
- Contras: no resuelve el caso de dos quizzes programados sobre la MISMA lección en ventanas
  distintas (ver limitación abajo).

### Opción B — Derivar `is_active` de la ventana (rechazada)
- Pros: un solo campo de verdad, sin doble estado.
- Contras: imposible de conciliar con los índices únicos parciales (`where is_active`), que no
  pueden usar `now()`. Requeriría rediseñar esos índices con `EXCLUDE USING gist` +
  `btree_gist` — sobre-ingeniería para un requisito no pedido (ver N1 en el brief, confirmado por
  la transcripción: un quiz por clase, no varios por lección/sesión).

### Opción C — Cron que activa/desactiva `is_active` (rechazada)
- Pros: no requiere tocar el código de lectura.
- Contras: desfase de hasta 30 min (el único cron existente corre cada `*/30 * * * *`),
  inaceptable para una hora exacta; estado derivado que puede desincronizarse si el cron falla.

## Consecuencias

### Positivas
- La profe/operación puede programar apertura y cierre de un quiz con antelación, sin
  intervención manual el día de la clase.
- Cero cambio de comportamiento para las evaluaciones existentes (ventana NULL/NULL).
- Reusa infraestructura y patrones ya probados (`DatePicker`, `isoToLocalInput`/`fromLocalInput`,
  CHECK con guarda idempotente).

### Negativas / Limitación aceptada
- **No se pueden programar DOS quizzes distintos sobre la MISMA lección/sesión en ventanas
  diferentes**: ambos requerirían `is_active=true`, lo que viola el índice único parcial
  existente. La transcripción de la reunión confirma que esto no hace falta: cada clase tiene
  UN quiz que la acompaña "por siempre" (Paola, 31:12), y los casos mencionados de "dos quizzes"
  son de clases/sesiones distintas, no de la misma lección.
- El reporte del panel del profesor (`lib/admin/student-panel-queries.ts`) y las pantallas de
  certificado deliberadamente NO aplican la ventana: son consultas de evaluaciones publicadas
  para fines de registro/certificación, no gates de acceso. Si se aplicara, una evaluación cerrada
  desaparecería del reporte junto con el registro de quién la aprobó.

### Riesgos
- Si en el futuro se necesita de verdad más de un quiz vigente por lección/sesión, hay que
  revisar esta decisión (Opción B con `EXCLUDE USING gist`, más compleja).
- La vista "cerrado con nota visible para el alumno" no está resuelta en esta iteración (N2 del
  brief): hoy, al cerrar, el alumno deja de ver el quiz (RLS lo oculta), igual que "Desactivar".
  Depende de que la pantalla de notas consolidada (`docs/briefs/evaluaciones-y-notas-1-7.md`)
  cubra ese caso.

## Referencias

- `db/migrations/0070_evaluations_schedule_window.sql` — columnas, CHECK, índice y policy.
- `db/migrations/0053_entregables.sql` — patrón de ventana `opens_at`/`due_at` copiado.
- `lib/classroom/evaluation-window.ts` — helper puro `getEvaluationState`/`isEvaluationOpen`.
- `lib/classroom/evaluation-access.ts` — gate real (service-role, bypassea RLS).
- [ADR-0007: Pipeline de certificación con quiz final](0007-certificacion-y-quizzes.md) — deriva de
  este ADR.
- `docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md` — brief original con la
  transcripción de la reunión.
