import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

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
    Promise.resolve(table === "email_campaigns" ? state.listResult : { data: null }).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}));

const { GET, POST } = await import("@/app/api/admin/campaigns/route");

const PROGRAM_ID = "a0000000-0000-0000-0000-000000000002";
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";

const VALID = {
  programId: PROGRAM_ID,
  subject: "Novedades",
  bodyMd: "Hola a todos.",
};

function postReq(body: unknown) {
  return new Request("http://x/api/admin/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  state = {
    listResult: { data: [{ id: "c1" }], error: null },
    insertResult: { data: { id: "c1", subject: "Novedades" }, error: null },
    cohort: { id: COHORT_ID, program_id: PROGRAM_ID },
  };
  insertSpy.mockReset();
});

describe("GET /api/admin/campaigns", () => {
  it("propaga el 403 de authorizeAdmin", async () => {
    authResult = { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };

    const res = await GET(new Request(`http://x/api/admin/campaigns?programId=${PROGRAM_ID}`));

    expect(res.status).toBe(403);
  });

  it("exige programId", async () => {
    expect((await GET(new Request("http://x/api/admin/campaigns"))).status).toBe(422);
  });

  it("rechaza un programId que no es UUID", async () => {
    const res = await GET(new Request("http://x/api/admin/campaigns?programId=abc"));
    expect(res.status).toBe(422);
  });

  it("devuelve las campañas del entorno", async () => {
    const res = await GET(new Request(`http://x/api/admin/campaigns?programId=${PROGRAM_ID}`));

    expect(res.status).toBe(200);
    expect((await res.json()).campaigns).toHaveLength(1);
  });

  it("traduce un error de base a 500", async () => {
    state.listResult = { data: null, error: { message: "boom" } };

    const res = await GET(new Request(`http://x/api/admin/campaigns?programId=${PROGRAM_ID}`));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/admin/campaigns", () => {
  it("rechaza un body que no es JSON", async () => {
    const res = await POST(
      new Request("http://x/api/admin/campaigns", { method: "POST", body: "{" }),
    );
    expect(res.status).toBe(400);
  });

  it("exige asunto y cuerpo", async () => {
    expect((await POST(postReq({ programId: PROGRAM_ID }))).status).toBe(422);
    expect((await POST(postReq({ ...VALID, subject: "" }))).status).toBe(422);
    expect((await POST(postReq({ ...VALID, bodyMd: "  " }))).status).toBe(422);
  });

  it("rechaza un CTA a medias", async () => {
    const soloLabel = await POST(postReq({ ...VALID, ctaLabel: "Ver" }));
    expect(soloLabel.status).toBe(422);

    const soloUrl = await POST(postReq({ ...VALID, ctaUrl: "https://x.cl" }));
    expect(soloUrl.status).toBe(422);
  });

  it("rechaza un enlace de botón que no es URL", async () => {
    const res = await POST(postReq({ ...VALID, ctaLabel: "Ver", ctaUrl: "no-es-url" }));
    expect(res.status).toBe(422);
  });

  // Sin esta guarda se podría segmentar por una cohorte de otro entorno y
  // mandarle el comunicado al tenant equivocado.
  it("rechaza una cohorte de otro entorno", async () => {
    state.cohort = { id: COHORT_ID, program_id: "otro-programa" };

    const res = await POST(postReq({ ...VALID, cohortId: COHORT_ID }));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("no pertenece");
  });

  it("rechaza una cohorte inexistente", async () => {
    state.cohort = null;
    expect((await POST(postReq({ ...VALID, cohortId: COHORT_ID }))).status).toBe(422);
  });

  it("crea el borrador con el autor y estado por defecto", async () => {
    const res = await POST(postReq(VALID));

    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        program_id: PROGRAM_ID,
        subject: "Novedades",
        body_md: "Hola a todos.",
        cohort_id: null,
        audience_status: ["active"],
        created_by: "admin-1",
      }),
    );
  });

  it("acepta varios estados de matrícula", async () => {
    await POST(postReq({ ...VALID, audienceStatus: ["active", "completed"] }));

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ audience_status: ["active", "completed"] }),
    );
  });

  it("rechaza un estado de matrícula desconocido", async () => {
    const res = await POST(postReq({ ...VALID, audienceStatus: ["fantasma"] }));
    expect(res.status).toBe(422);
  });

  it("traduce una violación de CHECK a 422", async () => {
    state.insertResult = { data: null, error: { code: "23514", message: "check" } };
    expect((await POST(postReq(VALID))).status).toBe(422);
  });

  it("traduce otros errores de base a 500", async () => {
    state.insertResult = { data: null, error: { code: "XXXXX", message: "boom" } };
    expect((await POST(postReq(VALID))).status).toBe(500);
  });
});
