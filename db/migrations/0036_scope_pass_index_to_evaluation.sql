-- =============================================================================
-- Capital Academy — Acotar el índice de "intento aprobado único" a la evaluación
-- Spec: docs/specs/quiz-evaluaciones-por-clase.md  ·  hallazgo del barrido anti-bypass
--
-- Bug (latente): el índice `quiz_attempts_one_pass_per_enrollment` (migración
-- 0030) era UNIQUE (enrollment_id) WHERE passed=true — GLOBAL por matrícula.
-- Se creó cuando solo existía el quiz final. Tras 0033, los quizzes formativos
-- por clase también escriben passed=true en la MISMA tabla. Consecuencia: un
-- alumno que aprueba un quiz formativo y luego el examen final (o dos
-- evaluaciones) viola el índice → el UPDATE de cierre falla con 500 → no puede
-- cerrar su examen final aprobado → NO recibe certificado.
--
-- Fix: acotar el índice a (enrollment_id, evaluation_id). Sigue garantizando un
-- único intento aprobado POR EVALUACIÓN (preserva el anti doble-certificado del
-- final, cuyo evaluation_id es fijo), pero permite aprobar evaluaciones distintas.
-- Verificado en prod: 0 filas violan el índice nuevo.
-- =============================================================================

drop index if exists public.quiz_attempts_one_pass_per_enrollment;

create unique index if not exists quiz_attempts_one_pass_per_evaluation
  on public.quiz_attempts (enrollment_id, evaluation_id)
  where passed = true;
