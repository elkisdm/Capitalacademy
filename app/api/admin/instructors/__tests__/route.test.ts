import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let instructorLookupResult: Result; // ensure: ficha ya enlazada
let profileLookupResult: Result; // ensure: nombre de la cuenta
let insertResult: Result; // alta de la ficha
let readBackResult: Result; // relectura tras enlazar por cuenta
const insertSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "instructors") {
        return {
          select: () => ({
            // ensure: .eq().order().limit().maybeSingle()
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve(instructorLookupResult) }),
              }),
              // relectura de la ruta: .eq().maybeSingle()
              maybeSingle: () => Promise.resolve(readBackResult),
            }),
          }),
          insert: (row: unknown) => {
            insertSpy(row);
            return {
              select: () => ({
                single: () => Promise.resolve(insertResult),
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(profileLookupResult) }),
          }),
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    },
  })),
}));

const { POST } = await import("@/app/api/admin/instructors/route");

function req(body: unknown) {
  return new Request("http://x/api/admin/instructors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const PROFILE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";

describe("admin/instructors POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authResult = { user: { id: "admin-1" } };
    instructorLookupResult = { data: null };
    profileLookupResult = { data: { full_name: "Julio Fontecilla" } };
    insertResult = { data: { id: "inst-1", full_name: "Julio Fontecilla" }, error: null };
    readBackResult = { data: { id: "inst-1", full_name: "Julio Fontecilla", is_active: true } };
  });

  it("devuelve el error de authorizeAdmin sin tocar la base", async () => {
    const denied = new Response(null, { status: 403 });
    authResult = { error: denied };
    const res = await POST(req({ full_name: "Quien sea" }));
    expect(res).toBe(denied);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza JSON malformado con 400", async () => {
    const res = await POST(req("{no-es-json"));
    expect(res.status).toBe(400);
  });

  it("rechaza un nombre vacío o muy corto con 422", async () => {
    const res = await POST(req({ full_name: "A" }));
    expect(res.status).toBe(422);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("crea la ficha del relator invitado (sin cuenta) con 201", async () => {
    const res = await POST(req({ full_name: "  Julio Fontecilla  " }));
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({
      full_name: "Julio Fontecilla",
      is_active: true,
    });
  });

  it("con cuenta reusa el mismo camino que el alta por rol docente y no duplica", async () => {
    instructorLookupResult = { data: { id: "inst-previa", full_name: "Paola Vicuña" } };
    const res = await POST(req({ full_name: "Paola Vicuña", profile_id: PROFILE_ID }));
    // 200, no 201: la ficha ya existía.
    expect(res.status).toBe(200);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("traduce un rechazo de RLS a 403 en vez de un 500 opaco", async () => {
    insertResult = { data: null, error: { code: "42501", message: "denied" } };
    const res = await POST(req({ full_name: "Julio Fontecilla" }));
    expect(res.status).toBe(403);
  });
});
