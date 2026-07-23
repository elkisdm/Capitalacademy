import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let staffResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireSessionStaff: vi.fn(async () => staffResult),
}));

type Report = { title: string; students: unknown[] } | null;
let attendanceReport: Report;
let markResult: { ok: true } | { ok: false; error: string };
let unmarkResult: { ok: true } | { ok: false; error: string };

const getSessionAttendanceMock = vi.fn(async (..._args: unknown[]) => attendanceReport);
const markManualAttendanceMock = vi.fn(async (..._args: unknown[]) => markResult);
const unmarkAttendanceMock = vi.fn(async (..._args: unknown[]) => unmarkResult);

vi.mock("@/lib/asistencia/queries", () => ({
  getSessionAttendance: (...args: unknown[]) => getSessionAttendanceMock(...args),
  markManualAttendance: (...args: unknown[]) => markManualAttendanceMock(...args),
  unmarkAttendance: (...args: unknown[]) => unmarkAttendanceMock(...args),
}));

const { GET, POST, DELETE } = await import(
  "@/app/api/admin/sessions/[sessionId]/attendance/route"
);

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";
const STUDENT_ID = "11111111-2222-4333-8444-555555555555";
const INVALID_ID = "no-es-un-uuid";

function props(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

function req(method: string, body?: unknown) {
  return new Request(`http://x/api/admin/sessions/${SESSION_ID}/attendance`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function reqBadJson(method: string) {
  return new Request(`http://x/api/admin/sessions/${SESSION_ID}/attendance`, {
    method,
    headers: { "content-type": "application/json" },
    body: "{ esto no es json",
  });
}

describe("admin/sessions/[sessionId]/attendance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffResult = { user: { id: "staff-1" } };
    attendanceReport = { title: "Clase 1", students: [] };
    markResult = { ok: true };
    unmarkResult = { ok: true };
  });

  describe("GET", () => {
    it("responde 422 cuando el sessionId no es un uuid válido", async () => {
      const res = await GET(req("GET"), props(INVALID_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("ID inválido");
      expect(getSessionAttendanceMock).not.toHaveBeenCalled();
    });

    it("propaga el error de autorización cuando el usuario no tiene permiso", async () => {
      const authError = NextResponse.json({ error: "No autenticado" }, { status: 401 });
      staffResult = { error: authError };
      const res = await GET(req("GET"), props(SESSION_ID));
      expect(res!.status).toBe(401);
      expect(getSessionAttendanceMock).not.toHaveBeenCalled();
    });

    it("responde 404 cuando la sesión no existe", async () => {
      attendanceReport = null;
      const res = await GET(req("GET"), props(SESSION_ID));
      expect(res!.status).toBe(404);
      const json = await res!.json();
      expect(json.error).toBe("Sesión no encontrada");
    });

    it("responde 200 con el reporte de asistencia en el camino feliz", async () => {
      const res = await GET(req("GET"), props(SESSION_ID));
      expect(res!.status).toBe(200);
      const json = await res!.json();
      expect(json).toEqual(attendanceReport);
      expect(getSessionAttendanceMock).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  describe("POST", () => {
    it("responde 422 cuando el sessionId no es un uuid válido", async () => {
      const res = await POST(req("POST", { studentId: STUDENT_ID }), props(INVALID_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("ID inválido");
    });

    it("propaga el error de autorización cuando el usuario no tiene permiso", async () => {
      const authError = NextResponse.json({ error: "No autenticado" }, { status: 401 });
      staffResult = { error: authError };
      const res = await POST(req("POST", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(401);
      expect(markManualAttendanceMock).not.toHaveBeenCalled();
    });

    it("responde 400 cuando el body no es JSON válido", async () => {
      const res = await POST(reqBadJson("POST"), props(SESSION_ID));
      expect(res!.status).toBe(400);
      const json = await res!.json();
      expect(json.error).toBe("Body inválido");
    });

    it("responde 422 cuando el body no trae un studentId válido", async () => {
      const res = await POST(req("POST", { studentId: "no-es-uuid" }), props(SESSION_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("Validación fallida");
      expect(markManualAttendanceMock).not.toHaveBeenCalled();
    });

    it("responde 422 con el error del proveedor cuando markManualAttendance falla", async () => {
      markResult = { ok: false, error: "El alumno no está matriculado en esta cohorte." };
      const res = await POST(req("POST", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("El alumno no está matriculado en esta cohorte.");
    });

    it("responde 200 y marca la asistencia en el camino feliz", async () => {
      const res = await POST(req("POST", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(200);
      const json = await res!.json();
      expect(json).toEqual({ ok: true });
      expect(markManualAttendanceMock).toHaveBeenCalledWith(SESSION_ID, STUDENT_ID, "staff-1");
    });
  });

  describe("DELETE", () => {
    it("responde 422 cuando el sessionId no es un uuid válido", async () => {
      const res = await DELETE(req("DELETE", { studentId: STUDENT_ID }), props(INVALID_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("ID inválido");
    });

    it("propaga el error de autorización cuando el usuario no tiene permiso", async () => {
      const authError = NextResponse.json({ error: "No autenticado" }, { status: 401 });
      staffResult = { error: authError };
      const res = await DELETE(req("DELETE", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(401);
      expect(unmarkAttendanceMock).not.toHaveBeenCalled();
    });

    it("responde 400 cuando el body no es JSON válido", async () => {
      const res = await DELETE(reqBadJson("DELETE"), props(SESSION_ID));
      expect(res!.status).toBe(400);
      const json = await res!.json();
      expect(json.error).toBe("Body inválido");
    });

    it("responde 422 cuando el body no trae un studentId válido", async () => {
      const res = await DELETE(req("DELETE", { studentId: "no-es-uuid" }), props(SESSION_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("Validación fallida");
      expect(unmarkAttendanceMock).not.toHaveBeenCalled();
    });

    it("responde 422 con el error del proveedor cuando unmarkAttendance falla", async () => {
      unmarkResult = { ok: false, error: "No se pudo quitar la asistencia." };
      const res = await DELETE(req("DELETE", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(422);
      const json = await res!.json();
      expect(json.error).toBe("No se pudo quitar la asistencia.");
    });

    it("responde 200 y quita la asistencia en el camino feliz", async () => {
      const res = await DELETE(req("DELETE", { studentId: STUDENT_ID }), props(SESSION_ID));
      expect(res!.status).toBe(200);
      const json = await res!.json();
      expect(json).toEqual({ ok: true });
      expect(unmarkAttendanceMock).toHaveBeenCalledWith(SESSION_ID, STUDENT_ID);
    });
  });
});
