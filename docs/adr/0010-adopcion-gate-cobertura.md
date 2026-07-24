# ADR-0010: Adopción del gate de cobertura de tests en CI

- **Status:** proposed
- **Date:** 2026-07-24
- **Deciders:** Elkis
- **Tags:** testing, ci, infra

## Contexto

El proyecto tiene Vitest + `@vitest/coverage-v8` instalados y una suite de 2257+
tests deterministas, pero `vitest.config.ts` no imponía ningún umbral: la
cobertura podía bajar en cualquier PR sin que CI lo notara. Rutas críticas de
dinero, leads y auth (`lib/payments/**`, `app/api/webhooks/**`,
`app/api/auth/**`) quedaban sin ningún piso mínimo exigido.

devground (el monorepo de tooling propio) ya resolvió este mismo problema en
su [ADR-0029](../../../devground-1/docs/adr/0029-*.md) con un estándar de dos
capas: un **ratchet** (`autoUpdate`) que siembra el piso global desde la
cobertura real y nunca lo deja bajar, más **umbrales fijos y altos** para un
conjunto de rutas críticas (dinero/leads/auth) que no dependen de dónde
arrancó la cobertura histórica (ADR-0012 de devground).

Capitalacademy vive **fuera** del monorepo devground, así que el preset
`@devground/vitest-config` no es instalable en su CI (el workflow usa
`pnpm install --frozen-lockfile` contra el `pnpm-lock.yaml` propio de este
repo, que no tiene ese paquete como dependencia). Portar el estándar exige
copiar los valores inline en vez de importar el preset.

## Decisión

Se adopta el estándar de cobertura de devground, portado inline en
`vitest.config.ts`:

1. **Ratchet global** (`thresholds.autoUpdate: true` + `lines/functions/
   branches/statements` sembrados desde la primera corrida de
   `pnpm test:coverage`, no en `0`): el piso nunca baja, porque cada corrida
   verde reescribe el número al máximo alcanzado.
2. **Umbrales fijos para rutas críticas** (glob
   `**/{payments,pricing,billing,checkout,commission,refund,auth,session,leads,webhooks,risk}/**`):
   `lines/functions/statements: 90`, `branches: 85`, sin ratchet — no dependen
   de la cobertura histórica de esas rutas, son el piso que devground exige
   por ADR-0012 para dinero/leads/auth.
3. La clave del glob crítico se escribe como **string literal**, no como
   variable/computed key: `vitest`'s `autoUpdate` reescribe el archivo de
   config vía `magicast` (AST estático), que solo sabe localizar y sobrescribir
   claves de objeto literales. Con una clave computada
   (`[CRITICAL_GLOBS]: {...}`) la reescritura revienta con
   `TypeError: Cannot set properties of undefined (setting 'lines')` al
   intentar sembrar los números — se verificó en la implementación de este
   piloto.
4. `vitest.config.ts` se mantiene **plano** (`defineConfig({...})`, sin
   `mergeConfig` ni imports de preset): `autoUpdate` también falla con
   `mergeConfig` ("configuration file is too complex" para el parser estático
   de magicast).
5. Se agrega el script `pnpm test:coverage` (`vitest run --coverage`) y un
   step "Coverage gate" en `.github/workflows/ci.yml`, después de "Tests".

Cobertura sembrada en la implementación de este ADR: global —
statements 91.89%, branches 86.23%, functions 93.06%, lines 92.47%. Grupo
crítico — statements 99.06%, branches 97.84%, functions 95.83%, lines 99%.

Se añadieron además dos tests que antes faltaban en rutas críticas en 0%:
`app/api/auth/signout/__tests__/route.test.ts` (handler de logout, antes sin
ningún test) y `lib/payments/__tests__/provider.test.ts` (test honesto del
factory trivial, en vez de sumarlo a las exclusiones de cobertura).

## Opciones consideradas

### Opción A — Portar el estándar inline (elegida)
- Pros: piso real desde hoy, rutas críticas protegidas, sin depender de
  publicar/mantener un paquete compartido fuera del monorepo.
- Contras: los valores del estándar (90/85) y el criterio de qué cuenta como
  "crítico" se duplican a mano en cada repo que lo adopte fuera de devground;
  si ADR-0012 cambia sus números allá, no se propaga automáticamente acá.

### Opción B — Instalar `@devground/vitest-config` como dependencia
- Pros: una sola fuente de verdad, actualizaciones centralizadas.
- Contras: requiere publicar el paquete a un registro accesible desde el CI
  de Capitalacademy y mantener el `pnpm-lock.yaml` sincronizado con un repo
  externo; con `--frozen-lockfile` en CI, cualquier desfase rompe la
  instalación. No viable mientras el paquete no esté publicado y versionado.

### Opción C — No poner umbrales, solo reportar cobertura
- Pros: cero fricción, cero riesgo de bloquear un PR por cobertura.
- Contras: no es un gate — la cobertura de rutas de dinero/auth puede seguir
  cayendo sin que nadie lo note, que es exactamente el problema que motivó
  este ADR.

## Consecuencias

### Positivas
- CI falla si un PR baja la cobertura global o deja una ruta crítica por
  debajo de 90%/85%.
- Las dos rutas críticas que estaban en 0% (`signout`, `payments/provider`)
  ahora tienen test real.

### Negativas
- Los números del ratchet quedan hardcodeados en `vitest.config.ts` y se
  reescriben automáticamente en cada corrida verde — un diff de config que no
  toca lógica puede aparecer en PRs futuros solo por el ratchet subiendo.
- El criterio "qué es crítico" (el glob) es manual; si se agrega una ruta de
  dinero nueva que no calza con el glob, no queda protegida sin acordarse de
  actualizarlo.

### Riesgos
- Si alguien reintroduce `mergeConfig` o un import de preset en
  `vitest.config.ts`, `autoUpdate` deja de funcionar silenciosamente en la
  próxima corrida verde (no rompe el build, solo dispara el error de
  "Unhandled Error" visto en la implementación de este ADR) — mitigado por el
  comentario inline en el propio archivo.

## Referencias

- devground ADR-0012 (umbrales fijos para rutas críticas).
- devground ADR-0025 (ratchet de cobertura vía `autoUpdate`).
- devground ADR-0029 (adopción del estándar de cobertura, fuente de este
  piloto).
