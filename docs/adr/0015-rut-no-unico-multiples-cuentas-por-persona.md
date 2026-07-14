# ADR-0015: RUT no unico globalmente — una persona puede tener multiples cuentas

- **Status:** accepted
- **Date:** 2026-07-14
- **Deciders:** Eduardo Daza
- **Tags:** data-model, onboarding, auth

## Contexto

[ADR-0006](0006-flujo-onboarding-y-matricula.md) introdujo un indice unico global sobre `profiles.rut` (`profiles_rut_unique_idx`, en `db/migrations/0014_onboarding_profiles.sql:20-22`), asumiendo implicitamente que el RUT identifica una cuenta. En la practica, el RUT identifica a la **persona**, no a la cuenta, y Capital Academy permite que una misma persona tenga varias cuentas legitimas con propositos distintos entre programas — cada entorno es su propio tenant (ver memoria "Entorno como Tenant").

Caso real que expuso el problema: Paola Vicuña es alumna del Workshop con su correo personal (gmail) y ademas profesora del Diplomado 4a generacion con su correo corporativo. Ambas cuentas comparten el mismo RUT. Al intentar completar el onboarding de profesora, el update a `profiles` violaba la constraint `23505` (unique violation) y el endpoint devolvia un 500 generico ("Error al actualizar perfil"), bloqueando el acceso sin explicar la causa real.

Se audito el codigo para confirmar que ningun flujo depende de la unicidad global del RUT:

- **Login:** resuelve por `auth.users` (email/id), no por RUT.
- **Matricula (enrollment):** se crea por `user_id`, no por RUT.
- **Pago (Flow/Fintoc):** el webhook matricula por email, no por RUT.
- **Dedup de importacion CSV:** compara por email (`lib/onboarding/...`), no por RUT.

El RUT en `profiles` solo se usa para reportes y certificados (SENCE), donde se lee por cuenta individual, nunca para resolver identidad entre cuentas.

## Decision

1. **Dropear el indice unico** `profiles_rut_unique_idx` via migracion `db/migrations/0069_drop_profiles_rut_unique_idx.sql` (`drop index if exists`, idempotente). El RUT sigue siendo un campo normal de `profiles`, sin constraint de unicidad.
2. **Los endpoints de completacion/edicion de perfil** (`app/api/onboarding/complete-profile/route.ts` y `app/api/classroom/profile/route.ts`) capturan explicitamente el codigo `23505` en el error de Postgres y devuelven `409` con un mensaje claro ("Este RUT ya esta registrado en otra cuenta. Contacta a soporte.") en vez del 500 generico, por si en el futuro otra constraint distinta llega a chocar.

Esta decision **supersede parcialmente** [ADR-0006](0006-flujo-onboarding-y-matricula.md): el resto de las decisiones de ese ADR (schema de onboarding, invitacion por email, matricula automatica) sigue vigente sin cambios; solo se revierte la unicidad global de `rut` descrita en su seccion "1. Extension del schema de `profiles`".

## Opciones consideradas

### Opcion A — Dropear el indice unico global (elegida)
- Pros: resuelve el bloqueo de raiz, sin perdida de funcionalidad (nada resuelve usuarios por RUT), cambio minimo y reversible.
- Contras: dos perfiles pueden compartir RUT sin que la DB lo impida; cualquier validacion de "RUT unico" futura tendria que hacerse a nivel de aplicacion, con alcance explicito (ej: por programa).

### Opcion B — Unicidad compuesta (RUT + programa/entorno)
- Pros: mantendria cierta garantia de unicidad a nivel de tenant.
- Contras: mas complejo de modelar (el RUT vive en `profiles`, no en una tabla por-programa); no hay ningun requisito de negocio que pida esta garantia hoy; sobre-ingenieria para un problema que no existe.

### Opcion C — Mantener el indice y resolver via UI (permitir "vincular" cuentas)
- Pros: preserva la garantia de unicidad de RUT si algun dia se necesita.
- Contras: requiere disenar un flujo de vinculacion de cuentas que no esta pedido, retrasa el desbloqueo del onboarding de profesores, y complejidad sin valor claro dado que ningun flujo depende de esa unicidad.

## Consecuencias

### Positivas
- El onboarding de profesor/alumno con RUT compartido entre cuentas deja de fallar con 500.
- Si en el futuro otra constraint de unicidad choca en estos endpoints, el usuario ve un mensaje claro (409) en vez de un error generico.
- Cambio quirurgico y reversible: recrear el indice unico es una migracion de una linea si se decide revertir.

### Negativas
- La base de datos ya no impide que dos perfiles tengan el mismo RUT por error de captura (ej: tipeo). Esto no se validaba de forma robusta antes tampoco (el formato de RUT solo se valida en frontend), pero ahora tampoco hay red de seguridad a nivel de unicidad.

### Riesgos
- Si en el futuro se agrega un flujo que SI necesite resolver identidad por RUT (ej: dedup de importacion CSV por RUT en vez de email), debera implementar su propia logica de deteccion de duplicados a nivel de aplicacion — el indice unico ya no existe como red de seguridad implicita.

## Referencias

- [ADR-0006: Flujo de onboarding, invitacion y matricula automatica](0006-flujo-onboarding-y-matricula.md) — supersedido parcialmente por este ADR (seccion de unicidad de RUT).
- `db/migrations/0014_onboarding_profiles.sql` — creacion original del indice.
- `db/migrations/0069_drop_profiles_rut_unique_idx.sql` — drop del indice.
- `app/api/onboarding/complete-profile/route.ts`, `app/api/classroom/profile/route.ts` — manejo de `23505`.
