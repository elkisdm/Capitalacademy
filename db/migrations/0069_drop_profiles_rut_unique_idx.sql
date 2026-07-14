-- =============================================================================
-- Capital Academy — Drop del índice único global de RUT en profiles
-- =============================================================================
-- El RUT identifica a una PERSONA, no a una cuenta. Una misma persona puede
-- tener varias cuentas legítimas con propósitos distintos (alumna en un
-- programa, profe en otro), y la unicidad global de RUT lo impedía (violación
-- 23505 → "Error al actualizar perfil" en el onboarding). Ningún flujo resuelve
-- usuarios por RUT (login/matrícula/pago/dedup son por email o id), así que el
-- drop no rompe nada funcional. Ver ADR-0015 (supersede parcialmente ADR-0006).
-- =============================================================================

drop index if exists public.profiles_rut_unique_idx;
