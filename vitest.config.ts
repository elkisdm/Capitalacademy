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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
