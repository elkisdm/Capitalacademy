import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error: unknown };

type State = {
  moduleResult: Result;
  cohortResult: Result;
  sessionResult: Result;
};
let state: State;
let recordingIds: Set<string>;
let getSessionRecordingLessonIdsMock: (...args: unknown[]) => void;

function makeBuilder(table: string) {
  const chain = ["select", "eq", "order", "in"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  const resolve = (): Result => {
    if (table === "program_modules") return state.moduleResult;
    if (table === "cohorts") return state.cohortResult;
    if (table === "class_sessions") return state.sessionResult;
    return { data: null, error: null };
  };
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

vi.mock("@/lib/classroom/queries", () => ({
  getSessionRecordingLessonIds: vi.fn(async (...args: unknown[]) => {
    getSessionRecordingLessonIdsMock(...args);
    return recordingIds;
  }),
}));

const { GET } = await import("@/app/api/admin/evaluations/targets/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const MODULE_1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000010";
const MODULE_2 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000020";
const LESSON_1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000011";
const LESSON_2 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000012";
const COHORT_1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000030";
const SESSION_1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000040";

function getReq(qs: string) {
  return new Request(`http://x/api/admin/evaluations/targets${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionRecordingLessonIdsMock = vi.fn();
  authResult = { user: { id: "admin-1" } };
  recordingIds = new Set();
  state = {
    moduleResult: {
      data: [
        {
          id: MODULE_1,
          title: "Módulo 1",
          position: 1,
          lessons: [
            { id: LESSON_2, title: "Lección 2", position: 2 },
            { id: LESSON_1, title: "Lección 1", position: 1 },
          ],
        },
        { id: MODULE_2, title: "Módulo 2", position: 2, lessons: [] },
      ],
      error: null,
    },
    cohortResult: {
      data: [{ id: COHORT_1, name: "Cohorte 1" }],
      error: null,
    },
    sessionResult: {
      data: [
        {
          id: SESSION_1,
          title: "Clase en vivo",
          starts_at: "2026-01-01T10:00:00.000Z",
          module_id: MODULE_1,
          cohort_id: COHORT_1,
        },
      ],
      error: null,
    },
  };
});

describe("GET /api/admin/evaluations/targets", () => {
  it("401 cuando no autenticado", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(401);
  });

  it("422 cuando falta programId", async () => {
    const res = await GET(getReq(""));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("programId es requerido");
  });

  it("500 cuando falla la consulta de módulos", async () => {
    state.moduleResult = { data: null, error: { message: "boom" } };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al obtener módulos y lecciones");
  });

  it("200 con modules data null normaliza a listas vacías y no llama a cohortes con array vacío", async () => {
    state.moduleResult = { data: null, error: null };
    state.cohortResult = { data: [], error: null };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.modules).toEqual([]);
    expect(json.lessons).toEqual([]);
    expect(json.cohorts).toEqual([]);
    expect(json.sessions).toEqual([]);
    // Lista vacía de lessonIds: getSessionRecordingLessonIds no debería ni llamarse
    // con contenido (allLessonIds vacío).
    expect(getSessionRecordingLessonIdsMock).toHaveBeenCalledWith([]);
  });

  it("200 ordena lecciones por posición dentro de cada módulo y marca isRecording", async () => {
    recordingIds = new Set([LESSON_1]);
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.modules).toEqual([
      { id: MODULE_1, title: "Módulo 1" },
      { id: MODULE_2, title: "Módulo 2" },
    ]);
    // Las lecciones venían en orden [L2, L1] y deben quedar ordenadas [L1, L2].
    expect(json.lessons).toEqual([
      {
        id: LESSON_1,
        title: "Lección 1",
        moduleId: MODULE_1,
        moduleTitle: "Módulo 1",
        isRecording: true,
      },
      {
        id: LESSON_2,
        title: "Lección 2",
        moduleId: MODULE_1,
        moduleTitle: "Módulo 1",
        isRecording: false,
      },
    ]);
    expect(getSessionRecordingLessonIdsMock).toHaveBeenCalledWith([LESSON_2, LESSON_1]);
  });

  it("200 registra el error de cohortes pero continúa con cohortList vacío y sessions vacío", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.cohortResult = { data: null, error: { message: "cohorts boom" } };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.cohorts).toEqual([]);
    // cohortIds.length === 0 -> nunca se consulta class_sessions -> sessions vacío
    expect(json.sessions).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      "Error fetching cohorts for evaluation targets:",
      { message: "cohorts boom" },
    );
    errSpy.mockRestore();
  });

  it("200 registra el error de sesiones pero responde sessions vacío", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.sessionResult = { data: null, error: { message: "sessions boom" } };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.sessions).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      "Error fetching class sessions for evaluation targets:",
      { message: "sessions boom" },
    );
    errSpy.mockRestore();
  });

  it("200 arma sessions resolviendo moduleTitle y cohortName por id", async () => {
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.sessions).toEqual([
      {
        id: SESSION_1,
        title: "Clase en vivo",
        startsAt: "2026-01-01T10:00:00.000Z",
        moduleTitle: "Módulo 1",
        cohortName: "Cohorte 1",
      },
    ]);
  });

  it("200 sessions con module_id null deja moduleTitle en null sin consultar el mapa", async () => {
    state.sessionResult = {
      data: [
        {
          id: SESSION_1,
          title: null,
          starts_at: "2026-01-01T10:00:00.000Z",
          module_id: null,
          cohort_id: COHORT_1,
        },
      ],
      error: null,
    };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    const json = await res!.json();
    expect(json.sessions[0].moduleTitle).toBeNull();
    expect(json.sessions[0].title).toBeNull();
  });

  it("200 sessions con module_id que no existe en el mapa cae a null y cohort_id ajeno cae a cohortName vacío", async () => {
    state.sessionResult = {
      data: [
        {
          id: SESSION_1,
          title: "Otra clase",
          starts_at: "2026-01-02T10:00:00.000Z",
          module_id: "modulo-inexistente",
          cohort_id: "cohorte-inexistente",
        },
      ],
      error: null,
    };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    const json = await res!.json();
    expect(json.sessions[0].moduleTitle).toBeNull();
    expect(json.sessions[0].cohortName).toBe("");
  });
});
