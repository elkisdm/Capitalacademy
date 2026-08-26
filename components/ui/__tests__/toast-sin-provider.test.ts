import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda contra el toast que no se puede usar.
 *
 * Hay dos módulos de toast en el repo:
 *
 *   - `@/components/admin/toast` — hook con estado propio. Funciona en
 *     cualquier parte; hay que pintar su `<ToastContainer />`.
 *   - `@/components/ui/toast`    — depende de un `<ToastProvider>` que NO se
 *     monta en ningún layout. Su `useToast` lanza al renderizar.
 *
 * El nombre `ui/` invita a elegirlo, y elegirlo tumba la pantalla completa:
 * el error es de contexto de React en tiempo de ejecución, así que `tsc`, el
 * `next build` y los tests unitarios pasan verdes y el fallo solo aparece en el
 * navegador. Pasó el 26-ago con `/admin/leads` recién desplegado a producción.
 *
 * Este test falla en cuanto alguien vuelva a importarlo, o —si algún día se
 * monta el provider— avisa que la prohibición ya no aplica.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const CARPETAS = ["app", "components", "lib"];
const IGNORAR = new Set(["node_modules", ".next", ".git", "__tests__", ".claude"]);

function archivosFuente(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORAR.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(archivosFuente(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const fuentes = CARPETAS.flatMap((c) => archivosFuente(join(RAIZ, c)));

/** El código sin comentarios: una nota que MENCIONA `<ToastProvider>` o el
    import prohibido no es un uso, y contarla daría un falso positivo. */
function codigo(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("el toast de components/ui", () => {
  it("sigue sin tener quien monte su provider", () => {
    // Si esto falla, alguien montó el <ToastProvider>: el resto del test
    // ya no tiene sentido y hay que borrarlo.
    const montan = fuentes.filter(
      (f) =>
        !f.endsWith(join("components", "ui", "toast.tsx")) &&
        /<ToastProvider/.test(codigo(f)),
    );
    expect(montan).toEqual([]);
  });

  it("por lo tanto nadie lo importa: su useToast lanzaría al renderizar", () => {
    const culpables = fuentes
      .filter((f) => /from "@\/components\/ui\/toast"/.test(codigo(f)))
      .map((f) => f.slice(RAIZ.length + 1));

    expect(
      culpables,
      `Estos archivos importan @/components/ui/toast, cuyo <ToastProvider> no se ` +
        `monta en ninguna parte: useToast lanza al renderizar y tumba la pantalla. ` +
        `Usa @/components/admin/toast (devuelve { toast, ToastContainer }).`,
    ).toEqual([]);
  });

  it("encontró archivos que revisar (si no, el test no prueba nada)", () => {
    expect(fuentes.length).toBeGreaterThan(100);
  });
});
