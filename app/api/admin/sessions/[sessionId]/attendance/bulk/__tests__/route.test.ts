import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let staffResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireSessionStaff: vi.fn(async () => staffResult),
}));

type Report = { title: string; students: unknown[] };
type BulkResult =
  | { ok: true; report: Report }
  | { ok: false; error?: string; report?: undefined };
let bulkResult: BulkResult;

const bulkSetAttendanceMock = vi.fn(async (..._args: unknown[]) => bulkResult);

vi.mock("@/lib/asistencia/queries", () => ({
  bulkSetAttendance: (...args: unknown[]) => bulkSetAttendanceMock(...args),
}));

const { POST } = await import(
  "@/app/api/admin/sessions/[sessionId]/attendance/bulk/route"
);

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";
const STUDENT_ID_1 = "11111111-2222-4333-8444-555555555555";
const STUDENT_ID_2 = "22222222-2222-4333-8444-555555555555";
const INVALID_ID = "no-es-un-uuid";

function props(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

function req(body?: unknown) {
  return new Request(`http://x/api/admin/sessions/${SESSION_ID}/attendance/bulk`, {
    method: "POST",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function reqBadJson() {
  return new Request(`http://x/api/admin/sessions/${SESSION_ID}/attendance/bulk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ esto no es json",
  });
}

describe("admin/sessions/[sessionId]/attendance/bulk route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffResult = { user: { id: "staff-1" } };
    bulkResult = { ok: true, report: { title: "Clase 1", students: [] } };
  });

  it("responde 422 cuando el sessionId no es un uuid válido", async () => {
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: true }),
      props(INVALID_ID),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("ID inválido");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("propaga el error de autorización cuando el usuario no tiene permiso", async () => {
    const authError = NextResponse.json({ error: "No autenticado" }, { status: 401 });
    staffResult = { error: authError };
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(401);
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el body no es JSON válido", async () => {
    const res = await POST(reqBadJson(), props(SESSION_ID));
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 422 cuando studentIds viene vacío", async () => {
    const res = await POST(req({ studentIds: [], attended: true }), props(SESSION_ID));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 422 cuando studentIds supera los 200 elementos", async () => {
    const studentIds = Array.from({ length: 201 }, (_, i) =>
      `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`,
    );
    const res = await POST(req({ studentIds, attended: true }), props(SESSION_ID));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 422 cuando algún studentId no es un uuid válido", async () => {
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1, "no-es-uuid"], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 422 cuando attended no es booleano", async () => {
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: "true" }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(bulkSetAttendanceMock).not.toHaveBeenCalled();
  });

  it("responde 404 con el error del proveedor cuando bulkSetAttendance falla", async () => {
    bulkResult = { ok: false, error: "Sesión no encontrada." };
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("Sesión no encontrada.");
  });

  it("responde 404 con mensaje genérico cuando bulkSetAttendance falla sin error explícito", async () => {
    bulkResult = { ok: false };
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("No se pudo actualizar.");
  });

  it("responde 404 cuando bulkSetAttendance reporta ok pero sin reporte", async () => {
    bulkResult = { ok: true, report: undefined as unknown as Report };
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("No se pudo actualizar.");
  });

  it("responde 200 con el reporte y marca la asistencia en el camino feliz", async () => {
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1, STUDENT_ID_2], attended: true }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual(bulkResult.ok ? bulkResult.report : undefined);
    expect(bulkSetAttendanceMock).toHaveBeenCalledWith(
      SESSION_ID,
      [STUDENT_ID_1, STUDENT_ID_2],
      true,
      "staff-1",
    );
  });

  it("responde 200 y desmarca la asistencia cuando attended es false", async () => {
    const res = await POST(
      req({ studentIds: [STUDENT_ID_1], attended: false }),
      props(SESSION_ID),
    );
    expect(res!.status).toBe(200);
    expect(bulkSetAttendanceMock).toHaveBeenCalledWith(
      SESSION_ID,
      [STUDENT_ID_1],
      false,
      "staff-1",
    );
  });
});
