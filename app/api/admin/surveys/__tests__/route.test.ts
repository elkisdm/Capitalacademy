import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { SurveysNotConfiguredError } from "@/lib/surveys/config";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type State = {
  listResult: { data?: unknown; error?: unknown };
  insertResult: { data?: unknown; error?: unknown };
  cohort: { id: string; program_id: string } | null;
};
let state: State;
const insertSpy = vi.fn();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) b[m] = () => b;
  b.insert = (values: unknown) => {
    insertSpy(values);
    return b;
  };
  b.single = () => Promise.resolve(state.insertResult);
  b.maybeSingle = () => Promise.resolve({ data: state.cohort, error: null });
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(table === "survey_campaigns" ? state.listResult : { data: null }).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}));

const createRemoteSpy = vi.fn();
vi.mock("@/lib/surveys/remote", () => ({
  createRemoteSurvey: (...args: unknown[]) => createRemoteSpy(...args),
}));

const { GET, POST } = await import("@/app/api/admin/surveys/route");

const PROGRAM_ID = "a0000000-0000-0000-0000-000000000002";
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";

const QUESTION = {
  key: "utilidad",
  type: "scale",
  title: "¿Qué tan aplicable fue?",
  validation: { min: 1, max: 5 },
};

const VALID = {
  programId: PROGRAM_ID,
  title: "Encuesta de la clase",
  mode: "anonymous",
  questions: [QUESTION],
};

function postReq(body: unknown) {
  return new Request("http://x/api/admin/surveys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  state = {
    listResult: { data: [{ id: "sv1" }], error: null },
    insertResult: { data: { id: "sv1" }, error: null },
    cohort: { id: COHORT_ID, program_id: PROGRAM_ID },
  };
  insertSpy.mockReset();
  createRemoteSpy.mockReset();
  createRemoteSpy.mockResolvedValue({
    id: "srv-1",
    slug: "encuesta-abc123",
    url: "https://capitalinteligente.com/s/encuesta-abc123",
  });
});

describe("GET /api/admin/surveys", () => {
  it("propaga el 403", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };
    expect((await GET(new Request(`http://x?programId=${PROGRAM_ID}`))).status).toBe(403);
  });

  it("exige un programId válido", async () => {
    expect((await GET(new Request("http://x"))).status).toBe(422);
  });

  it("devuelve las encuestas y el estado de configuración del cruce", async () => {
    const body = await (await GET(new Request(`http://x?programId=${PROGRAM_ID}`))).json();

    expect(body.surveys).toHaveLength(1);
    // La UI necesita saber qué capacidades están listas para no ofrecer crear.
    expect(body.config).toHaveProperty("create");
    expect(body.config).toHaveProperty("enroll");
    expect(body.config).toHaveProperty("results");
  });

  it("500 ante error de base", async () => {
    state.listResult = { data: null, error: { message: "boom" } };
    expect((await GET(new Request(`http://x?programId=${PROGRAM_ID}`))).status).toBe(500);
  });
});

describe("POST /api/admin/surveys", () => {
  it("rechaza body no JSON", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("exige título, modo y preguntas válidas", async () => {
    expect((await POST(postReq({ programId: PROGRAM_ID }))).status).toBe(422);
    expect((await POST(postReq({ ...VALID, mode: "raro" }))).status).toBe(422);
    expect((await POST(postReq({ ...VALID, questions: [] }))).status).toBe(422);
  });

  it("rechaza una cohorte de otro entorno", async () => {
    state.cohort = { id: COHORT_ID, program_id: "otro" };
    expect((await POST(postReq({ ...VALID, cohortId: COHORT_ID }))).status).toBe(422);
  });

  // Configuración ausente es un problema de despliegue, no un error de uso.
  it("503 con la lista de variables faltantes", async () => {
    createRemoteSpy.mockRejectedValue(
      new SurveysNotConfiguredError(["SURVEYS_SUPABASE_URL", "SURVEYS_SUPABASE_SERVICE_ROLE_KEY"]),
    );

    const res = await POST(postReq(VALID));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.missing).toContain("SURVEYS_SUPABASE_URL");
  });

  it("502 si el motor remoto rechaza la creación", async () => {
    createRemoteSpy.mockRejectedValue(new Error("duplicate slug"));

    const res = await POST(postReq(VALID));

    expect(res.status).toBe(502);
    // Y no deja una campaña local huérfana apuntando a nada.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("crea la encuesta remota primero y luego la campaña local", async () => {
    const res = await POST(postReq(VALID));

    expect(res.status).toBe(201);
    expect(createRemoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Encuesta de la clase", mode: "anonymous" }),
    );
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        program_id: PROGRAM_ID,
        external_survey_id: "srv-1",
        external_survey_slug: "encuesta-abc123",
        external_survey_url: "https://capitalinteligente.com/s/encuesta-abc123",
        mode: "anonymous",
        created_by: "admin-1",
      }),
    );
  });

  // La encuesta remota YA existe: ocultarlo la dejaría huérfana e invisible.
  it("devuelve la URL remota si falla el registro local", async () => {
    state.insertResult = { data: null, error: { message: "boom" } };

    const res = await POST(postReq(VALID));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.remoteUrl).toBe("https://capitalinteligente.com/s/encuesta-abc123");
  });
});
