import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAuthorizeAdmin = vi.fn();

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));

const mockCallerProfileSingle = vi.fn();
const mockUpdateCall = vi.fn();
const mockUpdateSingle = vi.fn();

const mockSupabaseFrom = vi.fn((table: string) => {
  if (table !== "profiles") return {};
  return {
    select: () => ({
      eq: () => ({
        single: mockCallerProfileSingle,
      }),
    }),
    update: (payload: unknown) => {
      mockUpdateCall(payload);
      return {
        eq: () => ({
          select: () => ({
            single: mockUpdateSingle,
          }),
        }),
      };
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...(args as [string])),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { PATCH } = await import("@/app/api/admin/users/[userId]/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/target-id", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost/api/admin/users/target-id", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{ not-json",
  });
}

function call(body: unknown, userId = "target-id") {
  return PATCH(makeRequest(body), {
    params: Promise.resolve({ userId }),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("PATCH /api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: admin caller
    mockAuthorizeAdmin.mockResolvedValue({
      user: { id: "caller-id", email: "admin@test.com" },
    });

    mockCallerProfileSingle.mockResolvedValue({
      data: { system_role: "admin" },
    });

    mockUpdateSingle.mockResolvedValue({
      data: {
        id: "target-id",
        full_name: "Actualizado",
        phone: "+56911111111",
        system_role: "user",
      },
      error: null,
    });
  });

  /* ---- Auth ---- */

  it("returns 401 when authorizeAdmin rejects (unauthenticated)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });

    const res = await call({ full_name: "X" });
    expect(res!.status).toBe(401);
  });

  it("returns 403 when authorizeAdmin rejects (unauthorized role)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });

    const res = await call({ full_name: "X" });
    expect(res!.status).toBe(403);
  });

  /* ---- Body inválido ---- */

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await PATCH(makeInvalidJsonRequest(), {
      params: Promise.resolve({ userId: "target-id" }),
    });
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  /* ---- Guard de system_role ---- */

  it("returns 403 when a non-admin caller (ops) tries to change system_role", async () => {
    mockCallerProfileSingle.mockResolvedValue({
      data: { system_role: "ops" },
    });

    const res = await call({ system_role: "admin" });
    expect(res!.status).toBe(403);
    const json = await res!.json();
    expect(json.error).toBe("Solo un admin puede cambiar el system_role");
    expect(mockUpdateCall).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller profile could not be resolved and system_role is requested", async () => {
    mockCallerProfileSingle.mockResolvedValue({ data: null });

    const res = await call({ system_role: "ops" });
    expect(res!.status).toBe(403);
  });

  it("allows an admin caller to change system_role", async () => {
    mockUpdateSingle.mockResolvedValue({
      data: { id: "target-id", system_role: "ops" },
      error: null,
    });

    const res = await call({ system_role: "ops" });
    expect(res!.status).toBe(200);
    expect(mockUpdateCall).toHaveBeenCalledWith({ system_role: "ops" });
  });

  /* ---- Validación de campos ---- */

  it("returns 422 when no updatable fields are provided", async () => {
    const res = await call({});
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("No hay campos para actualizar");
    expect(mockUpdateCall).not.toHaveBeenCalled();
  });

  it("only includes the fields present in the body in the update payload", async () => {
    await call({ phone: "+56922222222" });
    expect(mockUpdateCall).toHaveBeenCalledWith({ phone: "+56922222222" });
  });

  /* ---- Error del proveedor ---- */

  it("returns 500 when the update fails in Supabase", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpdateSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });

    const res = await call({ full_name: "Falla" });
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al actualizar perfil");
    consoleErrorSpy.mockRestore();
  });

  /* ---- Usuario no encontrado ---- */

  it("returns 404 when no profile matches the given userId", async () => {
    mockUpdateSingle.mockResolvedValue({ data: null, error: null });

    const res = await call({ full_name: "Nadie" }, "id-inexistente");
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("Usuario no encontrado");
  });

  /* ---- Camino feliz ---- */

  it("returns 200 with the updated profile", async () => {
    const res = await call({ full_name: "Actualizado", phone: "+56911111111" });
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.id).toBe("target-id");
    expect(json.full_name).toBe("Actualizado");
    expect(mockUpdateCall).toHaveBeenCalledWith({
      full_name: "Actualizado",
      phone: "+56911111111",
    });
  });
});
