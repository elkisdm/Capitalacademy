-- =============================================================================
-- Capital Academy — La alerta de inasistencias deja de ser un aviso único y
-- limpia los avisos que salieron con datos incompletos.
--
-- ADR: docs/adr/0037-cuentas-internas-y-alerta-recurrente.md (reemplaza el
--      punto 2 del ADR-0013, "un único envío por alumno+cohorte").
--
-- Contexto: la alerta se encendió el 2026-07-11, ANTES de que se cargara la
-- asistencia histórica desde Excel. El cron contó como inasistencia toda clase
-- sin registro y mandó 22 correos de golpe: 11 alumnos con asistencia PERFECTA
-- recibieron un correo que decía "Registramos 6 inasistencias". Como el envío
-- era único por (alumno, cohorte, kind), esos 22 avisos quedaron quemados y la
-- alerta murió en la G4 — hoy hay alumnos con 16 faltas reales y nadie recibe
-- nada.
--
-- Esta migración NO cambia el esquema. El comportamiento recurrente lo aporta
-- el código (`processAbsenceAlerts`), que pasa a tratar `absences_count` como
-- MARCA DE AGUA: reenvía solo cuando el conteo real supera al del último aviso.
-- Acá solo se borran los avisos mentirosos, para que esos alumnos vuelvan a ser
-- elegibles y reciban un correo con su número verdadero.
--
-- Criterio de borrado: el aviso EXAGERÓ, es decir `absences_count` es mayor que
-- las inasistencias que hoy sabemos que ese alumno tenía a esa fecha. El conteo
-- verdadero se recalcula con la misma regla de negocio del código
-- (`lib/asistencia/window.ts::sessionAppliesToEnrollment`): sesión en vivo, no
-- cancelada, posterior a la matrícula del alumno, de su audiencia, y sin fila en
-- `session_attendance`.
--
-- Se conservan los avisos que fueron correctos o que se quedaron cortos: esos
-- no hay nada que reparar, y su marca de agua sigue siendo válida.
--
-- Efecto verificado contra producción el 2026-08-26: 21 filas borradas, 4
-- conservadas (Administrador 6/6, Cristian Figueroa 7/7, Elkis 2/2,
-- María Paz González 2/2).
--
-- Guardia temporal: solo toca avisos anteriores al 2026-08-27. Si alguien
-- re-corre esta migración más adelante, no puede alcanzar a los avisos que el
-- sistema nuevo haya mandado mientras tanto.
-- =============================================================================

delete from public.attendance_alerts al
where al.sent_at < timestamptz '2026-08-27 00:00:00+00'
  and al.absences_count > (
    select count(*)
    from public.class_sessions s
    join public.enrollments e
      on e.student_id = al.student_id
     and e.cohort_id = al.cohort_id
    where s.cohort_id = al.cohort_id
      and s.modality <> 'recorded'
      and s.status <> 'cancelled'
      -- Ventana de registro ya cerrada al momento del aviso.
      and s.ends_at < al.sent_at
      -- No se le imputan clases anteriores a su matrícula.
      and s.ends_at >= e.enrolled_at
      -- Audiencia: una clase del segmento interno no cuenta para el resto.
      and (
        s.audience = 'all'
        or (s.audience = 'capital_inteligente' and e.segment = 'capital_inteligente')
      )
      and not exists (
        select 1
        from public.session_attendance a
        where a.session_id = s.id
          and a.student_id = al.student_id
      )
  );
