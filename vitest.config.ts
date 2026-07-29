import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    // Los worktrees de agentes viven en .claude/worktrees/ (gitignored) y el
    // glob de `include` los alcanza: 109 de 140 archivos recogidos eran de
    // otras ramas. configDefaults.exclude preserva node_modules/dist/etc.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    /**
     * La cobertura se mide sobre la CAPA DE LÓGICA: `lib/**` y los route
     * handlers/server actions de `app/api/**`. Es lo que se puede ejercitar de
     * verdad con el entorno `node` que ya usa este proyecto.
     *
     * Fuera de la medición, a propósito:
     * - Componentes React y pages/layouts: necesitarían jsdom +
     *   @testing-library, dependencias que este proyecto NO tiene.
     * - `lib/supabase/types.ts`: 2.500 líneas generadas por el CLI de Supabase.
     * - Fábricas de cliente (`admin.ts`, `client.ts`, `server.ts`, `resend/client.ts`):
     *   son un `createClient(env)` de una línea; testearlas sería testear el SDK.
     */
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "**/__tests__/**",
        "lib/supabase/types.ts",
        "lib/supabase/admin.ts",
        "lib/supabase/client.ts",
        "lib/supabase/server.ts",
        "lib/resend/client.ts",
      ],
      // Piso global con ratchet (autoUpdate) + rutas críticas fijas (ADR-0025/0012).
      // Config PLANA a propósito: autoUpdate hace reescritura estática (magicast)
      // y falla con mergeConfig. La clave de glob crítico va como LITERAL (no
      // variable/computed key): magicast solo puede reescribir claves de objeto
      // literales, y con una clave computada revienta con "Cannot set properties
      // of undefined" al sembrar los números. Arranca en 0 → el primer
      // test:coverage lo siembra y NUNCA baja.
      thresholds: {
        // Rutas críticas (dinero/leads/auth) — umbral ALTO y FIJO (devground ADR-0012).
        // Portado inline: Capitalacademy está fuera del monorepo; el preset
        // @devground/vitest-config no es resoluble en su CI (frozen-lockfile).
        "**/{payments,pricing,billing,checkout,commission,refund,auth,session,leads,webhooks,risk}/**":
          { lines: 99, functions: 95.83, statements: 99.06, branches: 97.84 },
        autoUpdate: true,
        lines: 92.48,
        functions: 93.06,
        branches: 86.25,
        statements: 91.89,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
