import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Autoservicio del docente (ADR-0028). Lo que estos tests protegen es la
 * decisión de seguridad de la ruta: la ficha se resuelve SIEMPRE por
 * `profile_id = auth.uid()` y jamás por un id que llegue del cuerpo, aunque
 * escriba con service_role.
 */

const mockGetUser = vi.fn();
const mockSelectEq = vi.fn();
const mockUpdateResult = vi.fn();
/** Filtros con que se buscó la ficha propia. */
const selectFilters: Array<{ column: string; value: unknown }> = [];
/** Filtros del UPDATE, para verificar que nunca se escribe por un id ajeno. */
const updateFilters: Array<{ column: string; value: unknown }> = [];
let updatedValues: unknown = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            selectFilters.push({ column, value });
            return chain;
          },
          limit: () => chain,
          maybeSingle: mockSelectEq,
        };
        return chain;
      },
      update: (values: unknown) => {
        updatedValues = values;
        const chain = {
          eq: (column: string, value: unknown) => {
            updateFilters.push({ column, value });
            return chain;
          },
          select: () => chain,
          maybeSingle: mockUpdateResult,
        };
        return chain;
      },
    }),
  }),
}));

const { PATCH } = await import("@/app/api/docente/perfil/route");

function req(body: unknown) {
  return new Request("http://localhost/api/docente/perfil", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FICHA = { id: "ins-1", is_active: true, full_name: "Paola Vicuña" };

beforeEach(() => {
  vi.clearAllMocks();
  selectFilters.length = 0;
  updateFilters.length = 0;
  updatedValues = null;
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockSelectEq.mockResolvedValue({ data: FICHA, error: null });
  mockUpdateResult.mockResolvedValue({
    data: { id: "ins-1", headline: "Abogada" },
    error: null,
  });
});

describe("PATCH /api/docente/perfil", () => {
  it("rechaza a quien no está autenticado", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(req({ headline: "Cualquier cosa" }));

    expect(res.status).toBe(401);
    expect(updatedValues).toBeNull();
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/docente/perfil", {
        method: "PATCH",
        body: "no-es-json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("busca la ficha por la cuenta autenticada y nunca por un id del cuerpo", async () => {
    // El cuerpo trae un id ajeno a propósito: tiene que ser ignorado.
    await PATCH(req({ id: "ins-de-otro", profile_id: "user-999", headline: "Abogada" }));

    expect(selectFilters).toEqual([{ column: "profile_id", value: "user-1" }]);
    expect(updateFilters).toContainEqual({ column: "id", value: "ins-1" });
    expect(updateFilters).toContainEqual({ column: "profile_id", value: "user-1" });
  });

  it("no deja tocar identidad ni estado de la ficha", async () => {
    await PATCH(
      req({
        headline: "Abogada",
        full_name: "Otro Nombre",
        is_active: false,
        profile_id: "user-999",
        email: "otro@x.cl",
        photo_url: "https://x.cl/foto.jpg",
      }),
    );

    expect(updatedValues).toEqual({ headline: "Abogada" });
  });

  it("guarda el titular y las redes normalizadas", async () => {
    await PATCH(req({ headline: "Abogada", linkedin_url: "linkedin.com/in/paola" }));

    expect(updatedValues).toEqual({
      headline: "Abogada",
      linkedin_url: "https://linkedin.com/in/paola",
    });
  });

  it("devuelve 422 cuando no viene ningún campo editable", async () => {
    const res = await PATCH(req({ full_name: "Solo identidad" }));

    expect(res.status).toBe(422);
    expect(updatedValues).toBeNull();
  });

  it("devuelve 422 y nombra el campo cuando un enlace es inválido", async () => {
    const res = await PATCH(req({ linkedin_url: "no es una url" }));

    expect(res.status).toBe(422);
    expect((await res.json()).field).toBe("linkedin_url");
  });

  it("manda a operaciones a quien no tiene ficha enlazada, sin dar 403", async () => {
    // 19 de 20 fichas no están enlazadas: decirle "no tienes permiso" a un
    // docente real sería mentirle sobre la causa.
    mockSelectEq.mockResolvedValue({ data: null, error: null });

    const res = await PATCH(req({ headline: "Abogada" }));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/operaciones/i);
    expect(updatedValues).toBeNull();
  });

  it("responde 500 si no se puede leer la ficha", async () => {
    mockSelectEq.mockRejectedValue(new Error("db caída"));

    expect((await PATCH(req({ headline: "Abogada" }))).status).toBe(500);
  });

  it("traduce el check de Postgres a un 422 legible", async () => {
    mockUpdateResult.mockResolvedValue({ data: null, error: { code: "23514" } });

    const res = await PATCH(req({ headline: "Abogada" }));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/formato/i);
  });

  it("responde 500 ante cualquier otro error de escritura", async () => {
    mockUpdateResult.mockResolvedValue({ data: null, error: { code: "XX000" } });

    expect((await PATCH(req({ headline: "Abogada" }))).status).toBe(500);
  });

  it("responde 500 si el update no devuelve la fila", async () => {
    mockUpdateResult.mockResolvedValue({ data: null, error: null });

    expect((await PATCH(req({ headline: "Abogada" }))).status).toBe(500);
  });

  it("devuelve la ficha actualizada", async () => {
    const res = await PATCH(req({ headline: "Abogada" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "ins-1", headline: "Abogada" });
  });
});
