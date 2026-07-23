import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Estado mutable leído por el mock de Supabase Storage ───────────

const mockState = {
  bucketCalledWith: null as string | null,
  createSignedUrlsCalledWith: null as [string[], number] | null,
  createSignedUrlsResult: {
    data: null as { error: string | null; path: string | null; signedUrl: string | null }[] | null,
    error: null as { message?: string } | null,
  },
  shouldThrow: false,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        mockState.bucketCalledWith = bucket;
        return {
          createSignedUrls: (paths: string[], expiry: number) => {
            mockState.createSignedUrlsCalledWith = [paths, expiry];
            if (mockState.shouldThrow) {
              throw new Error("network error simulado");
            }
            return Promise.resolve(mockState.createSignedUrlsResult);
          },
        };
      },
    },
  }),
}));

const { resolveResourceUrls } = await import("@/lib/classroom/resource-urls");

// Anota el shape con viewUrl?: para que el genérico de resolveResourceUrls
// infiera un T que ya contempla esa clave (si no, TS se queja de que no
// existe en los literales de entrada aunque la función la agregue en runtime).
type Resource = {
  url: string | null;
  storage_path: string | null;
  viewUrl?: string | null;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockState.bucketCalledWith = null;
  mockState.createSignedUrlsCalledWith = null;
  mockState.createSignedUrlsResult = { data: null, error: null };
  mockState.shouldThrow = false;
});

describe("resolveResourceUrls — sin recursos subidos", () => {
  it("retorna el arreglo vacío tal cual, sin llamar a Storage", async () => {
    const result = await resolveResourceUrls([]);
    expect(result).toEqual([]);
    expect(mockState.createSignedUrlsCalledWith).toBeNull();
  });

  it("con solo recursos externos (storage_path vacío/null), no llama a Storage y los devuelve intactos", async () => {
    const externos = [
      { url: "https://externo.test/a.pdf", storage_path: null },
      { url: "https://externo.test/b.pdf", storage_path: "" as unknown as null },
    ];

    const result = await resolveResourceUrls(externos);

    expect(result).toEqual(externos);
    expect(mockState.createSignedUrlsCalledWith).toBeNull();
  });
});

describe("resolveResourceUrls — camino feliz (firma exitosa)", () => {
  it("firma en un solo lote, deja los externos intactos y resuelve viewUrl/url de los subidos", async () => {
    mockState.createSignedUrlsResult = {
      data: [
        { error: null, path: "lesson/uno.pdf", signedUrl: "https://signed.test/uno.pdf?token=1" },
        { error: null, path: "lesson/dos.pdf", signedUrl: "https://signed.test/dos.pdf?token=2" },
      ],
      error: null,
    };

    const externo: Resource = { url: "https://externo.test/a.pdf", storage_path: null };
    const subido1: Resource = { url: null, storage_path: "lesson/uno.pdf" };
    const subido2: Resource = { url: null, storage_path: "lesson/dos.pdf" };

    const result = await resolveResourceUrls([externo, subido1, subido2]);

    // Firma en un solo lote con ambos paths de los subidos, ignorando el externo.
    expect(mockState.bucketCalledWith).toBe("lesson-resources");
    expect(mockState.createSignedUrlsCalledWith).toEqual([
      ["lesson/uno.pdf", "lesson/dos.pdf"],
      7_200,
    ]);

    // El externo queda intacto (no se le toca url ni viewUrl).
    expect(result[0]).toEqual(externo);

    // Los subidos obtienen viewUrl (firma pura) y url (firma + &download=).
    expect(result[1]).toEqual({
      storage_path: "lesson/uno.pdf",
      viewUrl: "https://signed.test/uno.pdf?token=1",
      url: "https://signed.test/uno.pdf?token=1&download=",
    });
    expect(result[2].viewUrl).toBe("https://signed.test/dos.pdf?token=2");
    expect(result[2].url).toBe("https://signed.test/dos.pdf?token=2&download=");
  });

  it("si una entrada de la firma no trae path, ese recurso no se resuelve (queda en null)", async () => {
    mockState.createSignedUrlsResult = {
      data: [{ error: "not found", path: null, signedUrl: null }],
      error: null,
    };

    const subido: Resource = { url: null, storage_path: "lesson/perdido.pdf" };
    const result = await resolveResourceUrls([subido]);

    expect(result[0].viewUrl).toBeNull();
    expect(result[0].url).toBeNull();
  });

  it("si la firma trae path pero signedUrl null, el recurso queda con viewUrl y url en null", async () => {
    mockState.createSignedUrlsResult = {
      data: [{ error: "boom", path: "lesson/roto.pdf", signedUrl: null }],
      error: null,
    };

    const subido: Resource = { url: null, storage_path: "lesson/roto.pdf" };
    const result = await resolveResourceUrls([subido]);

    expect(result[0].viewUrl).toBeNull();
    expect(result[0].url).toBeNull();
  });
});

describe("resolveResourceUrls — degradación con gracia", () => {
  it("si Storage responde con error, degrada: subidos quedan con url/viewUrl null, externos intactos", async () => {
    mockState.createSignedUrlsResult = {
      data: null,
      error: { message: "signing error" },
    };

    const externo: Resource = { url: "https://externo.test/a.pdf", storage_path: null };
    const subido: Resource = { url: "https://previo.test/x.pdf", storage_path: "lesson/x.pdf" };

    const result = await resolveResourceUrls([externo, subido]);

    expect(result[0]).toEqual(externo);
    expect(result[1]).toEqual({
      url: null,
      storage_path: "lesson/x.pdf",
      viewUrl: null,
    });
  });

  it("si Storage no responde error pero tampoco data, degrada igual", async () => {
    mockState.createSignedUrlsResult = { data: null, error: null };

    const subido: Resource = { url: "https://previo.test/x.pdf", storage_path: "lesson/x.pdf" };
    const result = await resolveResourceUrls([subido]);

    expect(result[0].url).toBeNull();
    expect(result[0].viewUrl).toBeNull();
  });

  it("si createSignedUrls lanza (reject de red/cliente), degrada sin tumbar la vista", async () => {
    mockState.shouldThrow = true;

    const externo: Resource = { url: "https://externo.test/a.pdf", storage_path: null };
    const subido: Resource = { url: "https://previo.test/x.pdf", storage_path: "lesson/x.pdf" };

    const result = await resolveResourceUrls([externo, subido]);

    expect(result[0]).toEqual(externo);
    expect(result[1]).toEqual({
      url: null,
      storage_path: "lesson/x.pdf",
      viewUrl: null,
    });
  });
});
