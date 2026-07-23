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
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
