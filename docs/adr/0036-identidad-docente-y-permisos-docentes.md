# ADR-0036: La ficha del docente es su identidad; el rol de cohorte son sus permisos

- **Status:** accepted
- **Date:** 2026-08-19
- **Deciders:** Elkis Daza
- **Tags:** data-model, roles, calendario

## Contexto

La plataforma llama "profesor" a **tres** cosas distintas, y no estaban conectadas:

| Fuente | Qué es | Apunta a | Quién la escribía |
|---|---|---|---|
| `instructors` | Identidad pública: foto, titular, reseña, redes | — | **Nadie desde la UI**: el alta venía del seed |
| `cohort_roles(role='teacher')` | Permisos sobre una cohorte: panel docente, moderar la sala, calificar | `profiles` | `/admin/users`, detalle de cohorte |
| `program_modules.teacher_id` | Decorativo: el nombre en la tarjeta del módulo | `profiles` | Nadie desde la UI |

`class_sessions.teacher_id` tiene FK a **`instructors`**, y el selector de docente
al crear una clase (`app/(admin)/admin/cohorts/[cohortId]/sesiones/page.tsx`) lee
solo `instructors where is_active = true`.

La consecuencia, reportada desde operaciones: **asignar a alguien como docente de
una cohorte no lo hace aparecer al crear la clase.** Al momento de escribir esto,
en producción había 14 personas con rol `teacher` y **4 sin ficha** — invisibles
para el calendario por más que tuvieran todos los permisos.

La causa de fondo no es que sobren tablas: es que el **puente**
(`instructors.profile_id`) era manual y no había forma de crear una ficha sin SQL.

## Decisión

**`instructors` y `cohort_roles` siguen separadas, y el puente se automatiza.**

1. **La ficha es la identidad publicable**; el rol de cohorte es el permiso. No se
   fusionan.
2. **Asignar rol `teacher` crea la ficha** si la persona no tenía
   (`lib/instructors/ensure.ts`, llamado desde `POST /api/admin/cohort-roles`).
   Copia solo el nombre; el resto del perfil lo completa después el equipo o la
   propia persona en `/docente/perfil`.
3. **`assistant` NO genera ficha**: tiene permisos, no es cara visible de una clase.
4. **Se puede crear una ficha a mano** desde `/admin/docentes`
   (`POST /api/admin/instructors`), con cuenta o sin ella.
5. **La ficha puede existir sin cuenta**: el relator invitado que dicta una clase
   suelta no usa la plataforma.
6. Si el alta de la ficha falla, **el rol igual queda asignado**: el permiso es
   válido y útil por sí solo, y revertirlo dejaría a la persona sin acceso por un
   problema cosmético.

## Opciones consideradas

### Opción A — Fusionar: que `class_sessions.teacher_id` apunte a `profiles`
- Pros: una sola fuente de verdad, cero puentes.
- Contras: **rompe al relator invitado**, que no tiene cuenta (5 de 20 fichas hoy
  no tienen `profile_id`). Obligaría a crear cuentas de plataforma para gente que
  nunca va a iniciar sesión. Además mezcla identidad publicable con credenciales
  de acceso: la ficha se muestra al alumno, la cuenta no.

### Opción B — Derivar la lista del selector desde `cohort_roles`
- Pros: no hace falta crear fichas.
- Contras: la clase quedaría sin ficha que mostrar al alumno (foto, reseña, redes
  viven en `instructors`), y el relator invitado seguiría sin poder ser asignado.

### Opción C — Mantener las dos tablas y automatizar el puente (elegida)
- Pros: cada tabla conserva su significado; el caso del invitado sigue funcionando;
  el hueco real (no había alta) se cierra donde estaba.
- Contras: sigue habiendo dos filas por persona; hay que cuidar los duplicados.

## Consecuencias

### Positivas
- Nombrar a alguien docente lo deja utilizable en el calendario en el mismo acto.
- `instructors` deja de depender del seed: un entorno nuevo puede operar sin SQL.
- El selector de la clase muestra dónde crear al que falta, en vez de fallar mudo.

### Negativas
- Una persona con **dos cuentas** puede terminar con dos fichas: el puente es por
  `profile_id`, así que dos cuentas de la misma persona son dos identidades para
  la base. Ya pasó antes (la ficha duplicada de Ivis García) y es la razón por la
  que el backfill de fichas faltantes se revisa a mano y no se corre a ciegas.
- Un rol docente otorgado "de paso" a alguien del equipo le crea ficha pública. Es
  reversible (`is_active = false`), pero conviene no repartir el rol `teacher` como
  atajo de permisos.

### Riesgos
- `ensureInstructorForProfile` **no degrada un fallo de lectura a "no existe"**: si
  la consulta falla, no inserta. Degradar duplicaría la identidad pública de la
  persona, que es peor que no crear la ficha.

## Pendiente (fuera de este ADR)

`program_modules.teacher_id` sigue apuntando a `profiles` y necesita un puente
(`getInstructorIdsByProfileIds`) para mostrar la ficha; con un docente sin cuenta,
la tarjeta del módulo no enlaza a nada. Migrarla a `instructors.id` la alinearía con
`class_sessions.teacher_id` y borraría el puente. Hoy solo 3 de 16 módulos la usan,
así que es barata ahora y más cara después. Queda propuesta, no decidida.

## Referencias

- [ADR-0004](0004-modelo-permisos-rbac-por-cohorte.md) — roles por cohorte
- [ADR-0028](0028-perfil-publico-del-profesor.md) — la ficha que ve el alumno
- `db/migrations/0085_instructors_write_system_role.sql` — la RLS que ya permitía
  el INSERT de staff, por eso este cambio no necesitó migración
