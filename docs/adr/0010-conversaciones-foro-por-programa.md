# ADR-0010: Conversaciones — foro de comunidad con alcance por programa

- **Status:** proposed
- **Date:** 2026-07-06
- **Deciders:** Eduardo (producto/dev)
- **Tags:** data-model, classroom, community, rls

## Contexto

Los entornos (programas) necesitan un espacio de comunidad donde cualquier alumno
pueda abrir una **conversación** (post con título + cuerpo) y otros participen en un
**hilo de comentarios** — estilo Skool. Hasta hoy la única interacción social del
classroom son los `lesson_comments` (comentarios atados a una lección, `0011`), que
están aislados **por cohorte** vía `enrollments`, igual que el resto del contenido del
classroom (calendario, recursos, quizzes).

La pregunta de diseño central es el **límite de aislamiento** del feed: ¿por cohorte
(cada generación tiene su feed privado) o por programa (todas las generaciones de un
diplomado comparten)? La decisión queda horneada en el FK y en las políticas RLS de
tres tablas nuevas, por lo que es cara de revertir.

Restricción de producto: las cohortes son chicas (G4 del Diplomado tiene 8 alumnos).
Un foro por cohorte de ~8 personas no alcanza masa crítica y se siente muerto.

## Decisión

El feed de Conversaciones se **scopea por `program_id`**, no por `cohort_id`. Todas
las generaciones de un mismo programa comparten un único feed; los feeds de programas
distintos quedan aislados entre sí.

Consecuencia directa en el modelo: `conversation_threads.program_id → programs`, y las
RLS usan un helper nuevo `has_program_access(program_id)` (análogo a
`has_cohort_access` de `0007`, pero joineando `cohorts → enrollments` por `program_id`).
El acceso se concede a quien tenga matrícula `active` **o** `completed` en **cualquier**
cohorte del programa, más el staff transversal (`is_platform_staff()`).

Esto es coherente con el modelo de tenancy documentado del proyecto: **el programa es
el tenant** (la marca/entorno); la cohorte es la unidad de aislamiento de *contenido
académico*, no necesariamente de *comunidad*.

## Opciones consideradas

### Opción A — Alcance por programa (elegida)
- **Pros:** masa crítica de participantes (todas las generaciones juntas); sensación de
  comunidad persistente estilo Skool; el programa es el tenant real.
- **Contras:** rompe con el patrón de aislamiento-por-cohorte del resto del classroom;
  un dev nuevo esperaría `cohort_id` por analogía (de ahí este ADR); requiere un helper
  RLS nuevo.

### Opción B — Alcance por cohorte
- **Pros:** patrón idéntico a `lesson_comments`/calendario/recursos; reusa
  `has_cohort_access`; máximo aislamiento entre generaciones.
- **Contras:** feeds muertos con cohortes de ~8; fragmenta la comunidad; contradice el
  objetivo de producto (espacio vivo estilo Skool/Reddit).

## Consecuencias

### Positivas
- Un solo feed vivo por programa; el valor de red crece con cada generación.
- Modelo de datos simple: `program_id` como frontera de tenant en las tres tablas.

### Negativas
- Diverge del patrón de scope del classroom; el contexto de cohorte (URL `[cohortSlug]`)
  se usa solo para navegación, no para filtrar el feed.
- Introduce helpers RLS nuevos (`has_program_access`, `is_program_staff`) que hay que
  mantener junto a los de cohorte.

### Riesgos
- **Fuga entre programas** si la RLS por `program_id` está mal escrita. Mitigación:
  helper `SECURITY DEFINER` probado + criterio de aceptación explícito "un alumno de
  otro programa no ve ni postea", verificado contra RLS y no solo UI.
- Moderación entre generaciones: staff transversal modera todo el programa (aceptado).

## Referencias

- `db/migrations/0011_lesson_comments.sql` (patrón threaded + RLS que se calca).
- `db/migrations/0007_rbac_cohort_roles.sql` (helpers `has_cohort_access`,
  `is_cohort_staff`, `is_platform_staff` que se replican a nivel de programa).
- `lib/programs/registry.ts` (el programa como entorno/tenant).
- Brief: `docs/specs/conversaciones.md`.
