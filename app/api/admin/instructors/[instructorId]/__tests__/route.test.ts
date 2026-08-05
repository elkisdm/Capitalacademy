import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));

type Res = { data: unknown; error: unknown };
let updated: Res;
let lastPatch: Record<string, unknown> | null = null;

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    builder[m] = () => builder;
  }
  builder.update = (patch: Record<string, unknown>) => {
    lastPatch = patch;
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve(updated);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: () => makeBuilder() })),
}));

const { authorizeAdmin } = await import("@/lib/auth/authorize-admin");
const { PATCH } = await import("@/app/api/admin/instructors/[instructorId]/route");

const ID = "d0000000-0000-0000-0000-000000000001";
const ctx = { params: Promise.resolve({ instructorId: ID }) };
const ctxFor = (id: string) => ({ params: Promise.resolve({ instructorId: id }) });

const ROW = {
  id: ID,
  full_name: "Paola Vicuña",
  photo_url: null,
  bio: "Directora académica.",
  headline: "Directora Académica",
  linkedin_url: null,
  instagram_url: null,
  website_url: null,
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/admin/instructors/x", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  updated = { data: ROW, error: null };
  lastPatch = null;
  vi.mocked(authorizeAdmin).mockResolvedValue({ user: { id: "admin-1" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/instructors/[instructorId]", () => {
  it("rebota a quien no es platform staff", async () => {
    vi.mocked(authorizeAdmin).mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });
    const res = await PATCH(req({ bio: "x" }), ctx);
    expect(res.status).toBe(403);
  });

  it("404 si el id no tiene forma de UUID (sin tocar la base)", async () => {
    const res = await PATCH(req({ bio: "x" }), ctxFor("../secretos"));
    expect(res.status).toBe(404);
    expect(lastPatch).toBeNull();
  });

  it("400 si el body no es JSON", async () => {
    const bad = new Request("http://localhost/x", { method: "PATCH", body: "no-json" });
    const res = await PATCH(bad, ctx);
    expect(res.status).toBe(400);
  });

  it("422 si el body no trae ningún campo editable", async () => {
    const res = await PATCH(req({}), ctx);
    expect(res.status).toBe(422);
  });

  it("422 si el headline excede el largo permitido", async () => {
    const res = await PATCH(req({ headline: "a".repeat(121) }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Validación fallida" });
  });

  it("422 si la bio excede el largo permitido", async () => {
    const res = await PATCH(req({ bio: "a".repeat(4001) }), ctx);
    expect(res.status).toBe(422);
  });

  it("guarda bio y headline recortados", async () => {
    const res = await PATCH(req({ bio: "  Lidera el área.  ", headline: " Directora " }), ctx);
    expect(res.status).toBe(200);
    expect(lastPatch).toEqual({ bio: "Lidera el área.", headline: "Directora" });
  });

  it("convierte texto vacío en null en vez de guardar cadena vacía", async () => {
    await PATCH(req({ bio: "   ", headline: "" }), ctx);
    expect(lastPatch).toEqual({ bio: null, headline: null });
  });

  it("acepta null explícito para borrar un campo", async () => {
    await PATCH(req({ bio: null, linkedin_url: null }), ctx);
    expect(lastPatch).toEqual({ bio: null, linkedin_url: null });
  });

  it("normaliza las URLs sin protocolo antes de guardarlas", async () => {
    await PATCH(
      req({
        linkedin_url: "linkedin.com/in/paola",
        instagram_url: " www.instagram.com/paola ",
        website_url: "https://paola.cl",
      }),
      ctx,
    );
    expect(lastPatch).toEqual({
      linkedin_url: "https://linkedin.com/in/paola",
      instagram_url: "https://www.instagram.com/paola",
      website_url: "https://paola.cl",
    });
  });

  it("422 con el campo culpable si la URL es javascript:", async () => {
    const res = await PATCH(req({ linkedin_url: "javascript:alert(1)" }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ field: "linkedin_url" });
    expect(lastPatch).toBeNull();
  });

  it("422 explicando que se use https cuando llega http", async () => {
    const res = await PATCH(req({ website_url: "http://paola.cl" }), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("https://");
    expect(body.field).toBe("website_url");
  });

  it("no toca los campos que el body no incluye", async () => {
    await PATCH(req({ headline: "Directora" }), ctx);
    expect(lastPatch).toEqual({ headline: "Directora" });
  });

  it("403 si la RLS rechaza la escritura", async () => {
    updated = { data: null, error: { code: "42501", message: "denied" } };
    const res = await PATCH(req({ bio: "x" }), ctx);
    expect(res.status).toBe(403);
  });

  it("422 legible si el CHECK de la migración rechaza el valor", async () => {
    updated = { data: null, error: { code: "23514", message: "check violation" } };
    const res = await PATCH(req({ bio: "x" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("formato permitido");
  });

  it("500 ante un error inesperado de la base", async () => {
    updated = { data: null, error: { code: "57014", message: "timeout" } };
    const res = await PATCH(req({ bio: "x" }), ctx);
    expect(res.status).toBe(500);
  });

  it("404 si el docente no existe", async () => {
    updated = { data: null, error: null };
    const res = await PATCH(req({ bio: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("devuelve la ficha actualizada", async () => {
    const res = await PATCH(req({ bio: "Nueva bio" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ROW);
  });
});
