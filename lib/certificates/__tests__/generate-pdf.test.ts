import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  generateCertificatePdf,
  normalizeName,
  type CertificateConfig,
} from "@/lib/certificates/generate-pdf";

// Assets reales del repo (no son un límite externo: son archivos locales que
// pdf-lib procesa de verdad, igual que en producción con la plantilla del
// programa). Se reusan los mismos que usa el sistema de certificados.
const FONT_PATH = path.resolve(process.cwd(), "assets/fonts/Allura-Regular.ttf");
const PNG_PATH = path.resolve(
  process.cwd(),
  "assets/certificates/template-workshop.png",
);

function baseConfig(overrides: Partial<CertificateConfig> = {}): CertificateConfig {
  return {
    templatePngPath: PNG_PATH,
    fontPath: FONT_PATH,
    nameCenterX: 1000,
    nameBaselineY: 700,
    defaultFontSize: 60,
    minFontSize: 20,
    maxNameWidth: 1200,
    nameColorHex: "#1a1a1a",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("capitaliza cada palabra de un nombre en minúsculas", () => {
    expect(normalizeName("martin travella")).toBe("Martin Travella");
  });

  it("mantiene en minúscula los conectores que no van primero", () => {
    expect(normalizeName("rosicela del valle fernandez")).toBe(
      "Rosicela del Valle Fernandez",
    );
  });

  it("capitaliza un conector si aparece como primera palabra", () => {
    expect(normalizeName("de la torre juan")).toBe("De la Torre Juan");
  });

  it("colapsa espacios múltiples y recorta bordes", () => {
    expect(normalizeName("  juan   perez  ")).toBe("Juan Perez");
  });

  it("es idempotente sobre un nombre ya normalizado", () => {
    expect(normalizeName("Rosicela del Valle Fernandez")).toBe(
      "Rosicela del Valle Fernandez",
    );
  });

  it("un string vacío o solo espacios normaliza a string vacío", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("generateCertificatePdf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("genera un PDF válido a partir de una plantilla local y una fuente local", async () => {
    const bytes = await generateCertificatePdf("martin travella", baseConfig());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("achica el tamaño de fuente hasta que el nombre entre en maxNameWidth", async () => {
    // Nombre largo + maxNameWidth chico fuerza el while a iterar al menos una vez.
    const bytes = await generateCertificatePdf(
      "Rosicela del Valle Fernandez Contreras Muñoz",
      baseConfig({ defaultFontSize: 80, minFontSize: 20, maxNameWidth: 150 }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("detiene el achicado en minFontSize aunque el texto siga sin entrar", async () => {
    // maxNameWidth imposible de alcanzar: el while debe parar por la guarda
    // fontSize > minFontSize, no quedar en loop infinito.
    const bytes = await generateCertificatePdf(
      "Un Nombre Extremadamente Largo Para Forzar El Limite Minimo",
      baseConfig({ defaultFontSize: 60, minFontSize: 40, maxNameWidth: 1 }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("no itera el while cuando el nombre ya entra en el ancho máximo", async () => {
    const bytes = await generateCertificatePdf(
      "Ana Lee",
      baseConfig({ defaultFontSize: 20, maxNameWidth: 5000 }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("lanza 'fullName vacío' si el nombre normalizado queda vacío", async () => {
    await expect(
      generateCertificatePdf("   ", baseConfig()),
    ).rejects.toThrow("fullName vacío");
  });

  it("descarga la plantilla por HTTP cuando templatePngPath es una URL", async () => {
    const pngBytes = await readFile(PNG_PATH);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () =>
        pngBytes.buffer.slice(
          pngBytes.byteOffset,
          pngBytes.byteOffset + pngBytes.byteLength,
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await generateCertificatePdf(
      "Juan Perez",
      baseConfig({ templatePngPath: "https://cdn.example.com/template.png" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example.com/template.png",
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("propaga un error legible si la descarga HTTP de la plantilla falla", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateCertificatePdf(
        "Juan Perez",
        baseConfig({ templatePngPath: "http://cdn.example.com/missing.png" }),
      ),
    ).rejects.toThrow("Failed to fetch template: 404 Not Found");
  });

  it("propaga el error del filesystem si la ruta de la fuente no existe", async () => {
    await expect(
      generateCertificatePdf(
        "Juan Perez",
        baseConfig({ fontPath: "/ruta/inexistente/fuente.ttf" }),
      ),
    ).rejects.toThrow();
  });

  it("propaga el error del filesystem si la ruta local de la plantilla no existe", async () => {
    await expect(
      generateCertificatePdf(
        "Juan Perez",
        baseConfig({ templatePngPath: "/ruta/inexistente/plantilla.png" }),
      ),
    ).rejects.toThrow();
  });
});
