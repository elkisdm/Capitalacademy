# ADR-0019: Escritura de intentos de evaluación solo por service_role

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Eduardo Daza, Equipo técnico Capital Academy
- **Tags:** security, rls, data-model, certification

## Contexto

La megaauditoría del 2026-07-16 encontró que `quiz_attempts_student_own`
(`db/migrations/0015_quiz_and_certificates.sql:129`) era una policy `FOR ALL
USING (enrollment_id in (...propias enrollments...))` **sin `WITH CHECK`**.

En Postgres, una policy `FOR ALL` sin `WITH CHECK` reutiliza la expresión
`USING` también como check de escritura. Como `authenticated` tiene además
INSERT/UPDATE/DELETE por las default privileges de Supabase (ninguna migración
de las 69 existentes las revoca) y no hay trigger que lo frene, cualquier
alumno podía hablarle directo a PostgREST y:

1. Insertar un intento `{passed: true, score_pct: 100, completed_at: now()}`
   sobre su propio `enrollment_id`, y luego llamar a
   `POST /api/classroom/certificate/retry` para emitir un certificado real,
   firmado y verificable públicamente, sin rendir el examen.
2. Borrar sus intentos reprobados para resetear el contador de
   `max_attempts` que calcula `quiz/start/route.ts:114`, obteniendo intentos
   infinitos.

Las cuatro escrituras legítimas de `quiz_attempts` (`quiz/start`,
`quiz/submit`, `evaluation/start`, `evaluation/submit`) ya usan
`createAdminClient()` (service_role) — ninguna pasa por un cliente RLS-bound
del alumno. El único uso legítimo de RLS del alumno sobre esta tabla es
lectura (`certificate/retry/route.ts:87`, `certificado/page.tsx:61,121`).

Esto no es un caso aislado: es el mismo patrón que ADR-0007 documentó para
`certificates` (alumno solo `SELECT`) y que ya seguía `enrollments`
(`db/migrations/0007_rbac_cohort_roles.sql`): el alumno tiene una policy de
`SELECT` propia, y todo INSERT/UPDATE/DELETE queda reservado a staff o a
service_role tras validación en servidor. `quiz_attempts` fue la excepción que
copió el patrón de pertenencia (`USING enrollment_id propio`) pero lo declaró
`FOR ALL` en vez de `FOR SELECT`, abriendo la escritura sin querer.

## Decisión

**En tablas de datos del alumno, ninguna policy con `USING` de pertenencia se
declara `FOR ALL`.** El alumno recibe una policy `FOR SELECT`, y toda
escritura sobre esos datos ocurre server-side vía `service_role`
(`createAdminClient()`), después de que el servidor valida la regla de negocio
(límite de intentos, ventana de tiempo, scoring, etc.). Si además el rol
`authenticated`/`anon` no necesita ningún grant de escritura legítimo sobre la
tabla, se revoca explícitamente con `REVOKE ... FROM authenticated, anon`
como segunda capa, independiente de las policies.

Aplicado en `db/migrations/0073_quiz_attempts_readonly_for_students.sql`:
la policy `quiz_attempts_student_own` pasa de `FOR ALL` a `FOR SELECT`, y se
revocan INSERT/UPDATE/DELETE/TRUNCATE de `authenticated` y `anon` sobre
`quiz_attempts`.

## Opciones consideradas

### Opción A — Policy `FOR SELECT` + REVOKE de escritura (elegida)

- **Pros:**
  - Dos capas independientes: si una policy futura se escribe mal, el REVOKE
    igual bloquea la escritura del navegador.
  - No requiere lógica adicional (trigger, función) que mantener.
  - Consistente con el patrón ya usado por `enrollments` y `certificates`.
- **Contras:**
  - El REVOKE es un artefacto de migración, no algo visible al mirar solo las
    policies con `\d+` — hay que documentarlo bien (se hizo en la cabecera de
    0073).

### Opción B — Trigger que bloquea escritura de `authenticated`

El patrón que usó `0052_prevent_role_self_escalation` para `profiles`.

- **Pros:** centraliza la regla en una función, útil cuando el rol SÍ
  necesita *algún* UPDATE legítimo (ese era el caso de `profiles`, donde
  `authenticated` puede actualizar su propio perfil salvo el campo `role`).
- **Contras:** en `quiz_attempts` ningún UPDATE/INSERT/DELETE de
  `authenticated` es legítimo — un trigger sería una capa de más para un caso
  donde el REVOKE ya resuelve todo de forma más simple.

### Opción C — Solo agregar `WITH CHECK` a la policy existente

- **Pros:** cambio mínimo, mantiene `FOR ALL`.
- **Contras:** el `WITH CHECK` seguiría permitiendo que el alumno escriba
  mientras el `enrollment_id` sea suyo — no cierra el vector (a), solo lo
  hace más molesto. El alumno igual podría insertar `{passed: true, ...}`
  sobre su propio enrollment. No resuelve el problema de fondo: el alumno no
  debe poder escribir esta tabla en absoluto.

## Consecuencias

### Positivas

- Cierra los dos vectores de fraude de certificación (C1) sin romper ningún
  flujo legítimo: los cuatro endpoints de escritura ya usaban service_role.
- Establece un criterio explícito y citable (este ADR) para el próximo
  diseño de tabla con datos del alumno: `FOR SELECT` + REVOKE, no `FOR ALL`.
- Refuerza en dos capas independientes (policy + grants), no solo una.

### Negativas

- Ninguna migración de rollback trivial: si en el futuro se necesita que el
  alumno escriba `quiz_attempts` directamente (no se prevé), habrá que
  revertir tanto la policy como el REVOKE.

### Riesgos

- Si una migración futura vuelve a crear `quiz_attempts` con default
  privileges de Supabase (por ejemplo, un `DROP TABLE` + recreación
  accidental), el REVOKE de 0073 no se reaplica solo. Mitigación: cualquier
  migración que toque `quiz_attempts` con `CREATE TABLE` debe repetir el
  REVOKE, y este ADR queda como referencia para el revisor.

## Referencias

- [ADR-0007](0007-certificacion-y-quizzes.md) — pipeline de certificación y
  modelo de datos original de `quiz_attempts`.
- `db/migrations/0007_rbac_cohort_roles.sql` — patrón de referencia en
  `enrollments` (policies por comando, alumno solo `SELECT`).
- `db/migrations/0052_prevent_role_self_escalation.sql` — caso donde SÍ se
  eligió trigger en vez de REVOKE, porque `authenticated` necesitaba UPDATE
  legítimo sobre `profiles`.
- `db/migrations/0073_quiz_attempts_readonly_for_students.sql` — fix aplicado
  a partir de este ADR.
