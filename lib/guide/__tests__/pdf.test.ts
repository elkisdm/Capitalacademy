import { describe, it, expect } from "vitest";
import { buildGuidePdf } from "@/lib/guide/pdf";
import { articlesByAudience, type Article } from "@/lib/guide/content";

describe("buildGuidePdf", () => {
  it("genera un PDF válido y no vacío con los artículos del profesor", async () => {
    const bytes = await buildGuidePdf(articlesByAudience("teacher"));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    // El plan estimaba ~20-90 KB asumiendo una fuente embebida; con
    // StandardFonts (sin programa de fuente incrustado) el real de los 9
    // artículos de profesor es ~15 KB. El umbral solo guarda contra un PDF
    // vacío o corrupto, no un tamaño exacto.
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it("no lanza excepción con un emoji o caracteres fuera de WinAnsi (sanitizador)", async () => {
    const weird: Article = {
      ...articlesByAudience("teacher")[0],
      slug: "articulo-de-prueba-emoji",
      title: "Prueba con emoji 🎉 y símbolo ≥",
      summary: "Resumen con emoji 😀",
      overview: "Overview con emoji 🚀 y comilla “curva”.",
      steps: ["Paso con emoji ✅ uno", "Paso dos"],
      tips: ["Tip con emoji 💡"],
      faqs: [{ q: "¿Pregunta con emoji 🤔?", a: "Respuesta con emoji 👍" }],
    };
    await expect(buildGuidePdf([weird])).resolves.toBeInstanceOf(Uint8Array);
  });
});
