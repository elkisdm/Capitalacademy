import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { SurveysNotConfiguredError } from "@/lib/surveys/config";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

let campaign: Record<string, unknown> | null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => Promise.resolve({ data: campaign, error: null });
      return b;
    },
  })),
}));

const fetchResultsSpy = vi.fn();
vi.mock("@/lib/surveys/remote", () => ({
  fetchRemoteResults: (...args: unknown[]) => fetchResultsSpy(...args),
}));

const { GET } = await import("@/app/api/admin/surveys/[campaignId]/results/route");

const ID = "dddddddd-2222-4222-8222-222222222222";
const ctx = (id = ID) => ({ params: Promise.resolve({ campaignId: id }) });

const SUBMISSIONS = [
  { respondent_email: "a@x.cl", answers: { utilidad: "5" } },
  { respondent_email: "b@x.cl", answers: { utilidad: "4" } },
];

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  campaign = {
    id: ID,
    title: "Encuesta de la clase",
    mode: "identified",
    external_survey_id: "srv-1",
    external_survey_url: "https://capitalinteligente.com/s/abc",
  };
  fetchResultsSpy.mockReset();
  fetchResultsSpy.mockResolvedValue({
    questions: [{ key: "utilidad", type: "scale", title: "¿Qué tan aplicable fue?" }],
    submissions: SUBMISSIONS,
  });
});

describe("GET /api/admin/surveys/[campaignId]/results", () => {
  it("propaga el 403", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };
    expect((await GET(new Request("http://x"), ctx())).status).toBe(403);
  });

  it("rechaza un id inválido", async () => {
    expect((await GET(new Request("http://x"), ctx("abc"))).status).toBe(422);
  });

  it("404 si la campaña no existe", async () => {
    campaign = null;
    expect((await GET(new Request("http://x"), ctx())).status).toBe(404);
  });

  it("409 si no tiene identificador remoto", async () => {
    campaign = { ...campaign, external_survey_id: null };
    expect((await GET(new Request("http://x"), ctx())).status).toBe(409);
  });

  it("devuelve las respuestas de una encuesta identificada", async () => {
    const body = await (await GET(new Request("http://x"), ctx())).json();

    expect(body.responseCount).toBe(2);
    expect(body.submissions).toHaveLength(2);
  });

  // Cruzar respuestas abiertas con la lista de invitados puede re-identificar.
  it("oculta el detalle por persona en una encuesta anónima", async () => {
    campaign = { ...campaign, mode: "anonymous" };

    const body = await (await GET(new Request("http://x"), ctx())).json();

    expect(body.responseCount).toBe(2);
    expect(body.submissions).toBeNull();
    expect(body.questions).toHaveLength(1);
  });

  it("503 si falta configuración", async () => {
    fetchResultsSpy.mockRejectedValue(new SurveysNotConfiguredError(["SURVEYS_API_TOKEN"]));

    const res = await GET(new Request("http://x"), ctx());

    expect(res.status).toBe(503);
    expect((await res.json()).missing).toContain("SURVEYS_API_TOKEN");
  });

  it("502 si el sistema remoto falla", async () => {
    fetchResultsSpy.mockRejectedValue(new Error("404 not found"));
    expect((await GET(new Request("http://x"), ctx())).status).toBe(502);
  });

  it("no revienta si el remoto devuelve payload vacío", async () => {
    fetchResultsSpy.mockResolvedValue({});

    const body = await (await GET(new Request("http://x"), ctx())).json();

    expect(body.responseCount).toBe(0);
    expect(body.questions).toEqual([]);
  });
});
