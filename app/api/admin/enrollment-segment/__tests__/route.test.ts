import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let updateResult: Result;
const eqSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          update: (values: unknown) => ({
            eq: (col1: string, val1: unknown) => {
              eqSpy(col1, val1);
              return {
                eq: (col2: string, val2: unknown) => {
                  eqSpy(col2, val2);
                  return {
                    select: () => ({
                      maybeSingle: () => Promise.resolve({ ...updateResult, values }),
                    }),
                  };
                },
              };
            },
          }),
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    },
  })),
}));

const { PATCH } = await import("@/app/api/admin/enrollment-segment/route");

const COHORT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const STUDENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";

function patchReq(body: unknown) {
  return new Request("http://x/api/admin/enrollment-segment", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  updateResult = {
    data: { id: "enr-1", student_id: STUDENT_ID, cohort_id: COHORT_ID, status: "active" },
    error: null,
  };
});

describe("PATCH /api/admin/enrollment-segment", () => {
  it("propaga el error de autorización cuando no está autenticado/autorizado", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    const res = await PATCH(patchReq({ cohort_id: COHORT_ID, student_id: STUDENT_ID }));
    expect(res.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(patchReq("{esto no es json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body inválido");
  });

  it("422 cuando falta cohort_id", async () => {
    const res = await PATCH(patchReq({ student_id: STUDENT_ID }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("cohort_id y student_id son requeridos");
  });

  it("422 cuando falta student_id", async () => {
    const res = await PATCH(patchReq({ cohort_id: COHORT_ID }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("cohort_id y student_id son requeridos");
  });

  it("422 cuando segment no está en la lista blanca", async () => {
    const res = await PATCH(
      patchReq({ cohort_id: COHORT_ID, student_id: STUDENT_ID, segment: "otro_segmento" }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("segment inválido. Permitidos: capital_inteligente o null");
  });

  it.each([
    ["undefined (ausente)", undefined],
    ["cadena vacía", ""],
    ["'all'", "all"],
  ])("normaliza segment %s a null", async (_label, segmentValue) => {
    const body: Record<string, unknown> = { cohort_id: COHORT_ID, student_id: STUDENT_ID };
    if (segmentValue !== undefined) body.segment = segmentValue;
    const res = await PATCH(patchReq(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, segment: null });
    expect(eqSpy).toHaveBeenCalledWith("cohort_id", COHORT_ID);
    expect(eqSpy).toHaveBeenCalledWith("student_id", STUDENT_ID);
  });

  it("segment null explícito también normaliza a null", async () => {
    const res = await PATCH(
      patchReq({ cohort_id: COHORT_ID, student_id: STUDENT_ID, segment: null }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, segment: null });
  });

  it("200 con segment válido de la lista blanca", async () => {
    const res = await PATCH(
      patchReq({
        cohort_id: COHORT_ID,
        student_id: STUDENT_ID,
        segment: "capital_inteligente",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, segment: "capital_inteligente" });
  });

  it("500 cuando falla la actualización en la base de datos", async () => {
    updateResult = { data: null, error: { message: "conexión perdida" } };
    const res = await PATCH(patchReq({ cohort_id: COHORT_ID, student_id: STUDENT_ID }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo actualizar el segmento");
  });

  it("404 cuando no existe una matrícula para ese alumno en esa cohorte", async () => {
    updateResult = { data: null, error: null };
    const res = await PATCH(patchReq({ cohort_id: COHORT_ID, student_id: STUDENT_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("No existe una matrícula para ese alumno en esta cohorte");
  });
});
