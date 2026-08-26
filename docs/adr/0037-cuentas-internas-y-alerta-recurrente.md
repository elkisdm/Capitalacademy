# ADR-0037: Cuentas internas etiquetadas y alerta de inasistencias recurrente

- **Status:** accepted
- **Date:** 2026-08-26
- **Deciders:** Elkis Daza (producto e ingeniería)
- **Tags:** data-model, correos, métricas, asistencia
- **Reemplaza:** el punto 2 del [ADR-0013](0013-alerta-inasistencias-y-expiracion-qr.md)
  ("un único envío por alumno+cohorte")

## Contexto

Dos problemas que resultaron ser el mismo.

**1. No se distinguía a un alumno real de una cuenta del equipo.** Las cuentas de staff,
las cuentas personales usadas para probar y la basura de QA estaban matriculadas como
alumnos cualquiera. Entraban en los correos masivos y en las métricas de cada cohorte:
Workshop 10 de 280 matrículas, Diplomado G4 3 de 24, Ciclo CI 1 de 243. La cuenta
`Administrador` incluso figuraba con inasistencias acumuladas.

Ninguna señal existente alcanzaba para detectarlas:

- `profiles.system_role` solo marca `admin`/`ops`. Dos personas del equipo (Elkis, Paola
  Vicuña) tienen además una cuenta Gmail con `system_role='user'`, indistinguible de una
  alumna.
- El dominio del correo tampoco sirve: muchas alumnas **reales** son
  `@capitalinteligente.cl` (segmento `capital_inteligente`, migración 0024).
- Ya existía `isStaffEnrollment(system_role)` en `lib/admin/actividad-queries.ts`, pero
  con esa limitación y aplicado en **un solo** consumidor de los once. Es el patrón que
  la auditoría del 17-jul llamó "defensas ya escritas sin propagar".

**2. La alerta de inasistencias estaba muerta.** Se encendió el 2026-07-11, antes de que
se cargara la asistencia histórica desde Excel. El cron contó como inasistencia toda
clase sin registro y mandó 22 correos de golpe: **11 alumnos con asistencia perfecta
recibieron un correo que decía "Registramos 6 inasistencias"**. Como el envío era único
por `(student_id, cohort_id, kind)`, esos avisos quedaron quemados. Hoy hay alumnos con
16 inasistencias reales y el sistema no vuelve a avisar nunca.

Los dos se cruzan: reactivar la alerta sin (1) significa mandarle el correo de
advertencia a la cuenta `Administrador` y a las cuentas personales del equipo.

## Decisión

### 1. `profiles.account_type` como etiqueta explícita

Columna `text not null default 'real'` con check en `('real', 'staff', 'test')`
(migración 0104).

- **En `profiles`, no en `enrollments`**: la condición es de la persona, no de una
  matrícula puntual, y hoy no existe ningún caso de staff-en-una-cohorte y
  alumno-real-en-otra. Si aparece, se agrega un override en `enrollments` sin migrar nada
  de esto — es barato de revertir, así que no justifica complejidad hoy.
- **Tres valores y no un booleano**: las dos poblaciones ya existen y tienen destinos
  distintos. `test` es basura borrable; `staff` son personas del equipo que se quedan. El
  filtro es el mismo (`<> 'real'`).
- **Backfill enumerado por correo, nunca por patrón**: un `LIKE '%@capitalinteligente.cl'`
  habría marcado como interna a media cohorte de alumnas reales.

**La etiqueta NO quita acceso.** Una cuenta `staff` sigue entrando al aula, rindiendo
quiz y entrando a la sala. Solo desaparece de los correos y de los números. Por eso los
~20 consumidores de `enrollments` que resuelven permisos (`verify-enrollment`,
`evaluation-access`, `conversaciones/access`, …) no miran este campo.

La regla vive en `lib/profiles/account-type.ts` y **un ausente se trata como real**: si
una consulta olvida pedir la columna, la persona se queda dentro de sus correos y sus
métricas. El error inverso la borra de los reportes y le corta las comunicaciones sin
que nadie lo note.

### 2. La alerta de inasistencias usa marca de agua

La fila de `attendance_alerts` deja de significar "ya se avisó" y pasa a guardar **el
conteo del último aviso enviado**. Se reenvía cuando el conteo real lo supera.

De ahí sale gratis el anti-ráfaga, que era el requisito difícil: un alumno que salta de 2
a 16 inasistencias — lo que pasa cada vez que se carga asistencia por Excel — recibe
**un** correo que dice 16, no catorce correos de los niveles intermedios.

Se descartó la alternativa de una fila por nivel (`absence_2`, `absence_3`, …): explota
la tabla y obliga a lógica extra para suprimir los niveles intermedios, que es justo lo
que la marca de agua resuelve sin código.

El `unique (student_id, cohort_id, kind)` y el patrón reserva-antes-de-enviar se
conservan intactos. El reclamo de una fila existente es un UPDATE condicional atómico con
`absences_count < N`: dos corridas concurrentes con el mismo conteo no pueden producir dos
correos, porque la que llega segunda ya no encuentra el `status` que su WHERE exige. Es lo
que impide repetir el incidente de 239 correos duplicados del 21-jul.

El sufijo `_2` del `kind` se mantiene: es el umbral de **entrada**, no un número de aviso.
Renombrarlo era cosmético y arriesgaba desincronizar código y datos.

### 3. Limpieza del histórico

- Las 11 cuentas de QA se borraron de `public.profiles` **y** de `auth.users`. Como
  `profiles` no tiene FK hacia `auth.users`, borrar solo el perfil habría dejado 11
  cuentas capaces de autenticarse sin perfil. El segundo paso va por la Admin API
  (`scripts/borrar-cuentas-qa.mjs`), no por SQL.
- Se borraron los 21 avisos de inasistencia cuyo `absences_count` **exageraba** frente a
  las faltas que hoy sabemos que el alumno tenía a esa fecha (migración 0105), para que
  esos alumnos vuelvan a ser elegibles y reciban un correo con su número verdadero. Se
  conservaron los 4 que fueron correctos: su marca de agua sigue siendo válida.

## Consecuencias

**A favor**

- Los números de cada cohorte pasan a ser los reales: el Diplomado G4 tiene **19 alumnos**,
  no 24; el Workshop 269, no 280.
- Un entorno nuevo nace limpio: `account_type` default `'real'` no etiqueta a nadie, y
  agregar una cuenta de equipo es un UPDATE de una línea sin deploy.
- La alerta vuelve a servir para lo que existe: acompañar al alumno que se está
  descolgando, no avisarle una sola vez en la vida.

**En contra / a vigilar**

- **La etiqueta es manual.** Una cuenta de equipo nueva que nadie marque vuelve a
  contaminar. Mitigación parcial: en el panel de actividad la etiqueta convive con el
  filtro por `system_role`, que atrapa admin/ops aunque nadie los marque. El resto de los
  consumidores depende solo de la etiqueta.
- **Orden de despliegue obligatorio**: la migración 0105 (borrado de avisos) solo puede
  aplicarse DESPUÉS de que el código nuevo esté en producción. Aplicada antes, el cron
  viejo — que no conoce `account_type` — reenviaría a todos los que quedaron sin fila,
  cuentas internas incluidas.
- Una persona con dos cuentas sigue siendo dos identidades (Elkis, Paola, posiblemente
  Camila). Unificarlas queda fuera de alcance; el ADR-0036 ya documentó el mismo problema
  para las fichas de docente.
