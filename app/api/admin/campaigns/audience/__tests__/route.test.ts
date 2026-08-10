import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({}) })),
}));

const resolveAudienceSpy = vi.fn();
vi.mock("@/lib/campaigns/audience", () => ({
  resolveAudience: (...args: unknown[]) => resolveAudienceSpy(...args),
  AUDIENCE_STATUSES: ["active", "invited", "completed", "suspended"],
}));

const { GET } = await import("@/app/api/admin/campaigns/audience/route");

const PROGRAM_ID = "a0000000-0000-0000-0000-000000000002";
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";

function req(qs: string) {
  return new Request(`http://x/api/admin/campaigns/audience${qs}`);
}

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  resolveAudienceSpy.mockReset();
  resolveAudienceSpy.mockResolvedValue([
    { studentId: "s1", email: "a@x.cl", fullName: "Ana Pérez" },
    { studentId: "s2", email: "b@x.cl", fullName: "" },
  ]);
});

describe("GET /api/admin/campaigns/audience", () => {
  it("propaga el 401 de authorizeAdmin", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    expect((await GET(req(`?programId=${PROGRAM_ID}`))).status).toBe(401);
  });

  it("exige un programId válido", async () => {
    expect((await GET(req(""))).status).toBe(422);
    expect((await GET(req("?programId=abc"))).status).toBe(422);
  });

  it("rechaza un cohortId que no es UUID", async () => {
    expect((await GET(req(`?programId=${PROGRAM_ID}&cohortId=abc`))).status).toBe(422);
  });

  it("devuelve el conteo y una muestra corta", async () => {
    const res = await GET(req(`?programId=${PROGRAM_ID}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(2);
    // Es un contador, no un exportador de PII: la muestra va acotada.
    expect(body.sample).toEqual(["Ana Pérez", "b@x.cl"]);
  });

  it("acota la muestra a 5 aunque haya más", async () => {
    resolveAudienceSpy.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        studentId: `s${i}`,
        email: `a${i}@x.cl`,
        fullName: `Alumno ${i}`,
      })),
    );

    const body = await (await GET(req(`?programId=${PROGRAM_ID}`))).json();

    expect(body.count).toBe(30);
    expect(body.sample).toHaveLength(5);
  });

  it("usa 'active' por defecto y respeta la lista pedida", async () => {
    await GET(req(`?programId=${PROGRAM_ID}`));
    expect(resolveAudienceSpy.mock.calls[0][1]).toMatchObject({ statuses: ["active"] });

    await GET(req(`?programId=${PROGRAM_ID}&status=active,completed`));
    expect(resolveAudienceSpy.mock.calls[1][1]).toMatchObject({
      statuses: ["active", "completed"],
    });
  });

  it("pasa cohorte y segmento cuando vienen", async () => {
    await GET(req(`?programId=${PROGRAM_ID}&cohortId=${COHORT_ID}&segment=capital_inteligente`));

    expect(resolveAudienceSpy.mock.calls[0][1]).toMatchObject({
      cohortId: COHORT_ID,
      segment: "capital_inteligente",
    });
  });

  // La lista completa solo con detail=full: la pantalla que deja marcar
  // destinatarios uno por uno la necesita, el resto de las llamadas no (0092).
  it("no incluye la lista completa salvo que se pida", async () => {
    const body = await (await GET(req(`?programId=${PROGRAM_ID}`))).json();
    expect(body.recipients).toBeUndefined();
  });

  it("con detail=full devuelve la lista completa de destinatarios", async () => {
    const body = await (await GET(req(`?programId=${PROGRAM_ID}&detail=full`))).json();

    expect(body.count).toBe(2);
    expect(body.recipients).toEqual([
      { studentId: "s1", email: "a@x.cl", fullName: "Ana Pérez" },
      { studentId: "s2", email: "b@x.cl", fullName: "" },
    ]);
  });

  it("un detail distinto de 'full' no abre la lista", async () => {
    const body = await (await GET(req(`?programId=${PROGRAM_ID}&detail=1`))).json();
    expect(body.recipients).toBeUndefined();
  });

  it("traduce un fallo de la audiencia a 500", async () => {
    resolveAudienceSpy.mockRejectedValue(new Error("boom"));
    expect((await GET(req(`?programId=${PROGRAM_ID}`))).status).toBe(500);
  });
});
