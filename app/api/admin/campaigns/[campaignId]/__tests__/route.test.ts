import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type State = {
  campaign: Record<string, unknown> | null;
  cohort: { id: string; program_id: string } | null;
  ledger: Array<{ status: string; email: string; error: string | null }>;
  updateResult: { data?: unknown; error?: unknown };
  deleteError: unknown;
};
let state: State;
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  let selected = false;
  b.select = () => {
    selected = true;
    return b;
  };
  b.eq = () => b;
  b.update = (values: unknown) => {
    updateSpy(values);
    return b;
  };
  b.delete = () => {
    deleteSpy();
    return b;
  };
  b.maybeSingle = () =>
    Promise.resolve({
      data: table === "cohorts" ? state.cohort : state.campaign,
      error: null,
    });
  b.single = () => Promise.resolve(state.updateResult);
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const value =
      table === "email_campaign_recipients"
        ? { data: state.ledger, error: null }
        : selected
          ? { data: state.campaign, error: null }
          : { error: state.deleteError };
    return Promise.resolve(value).then(res, rej);
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}));

const { GET, PATCH, DELETE } = await import("@/app/api/admin/campaigns/[campaignId]/route");

const ID = "cccccccc-1111-4111-8111-111111111111";
const PROGRAM_ID = "a0000000-0000-0000-0000-000000000002";
const COHORT_ID = "b0000000-0000-0000-0000-000000000004";
const ctx = (id = ID) => ({ params: Promise.resolve({ campaignId: id }) });

function patchReq(body: unknown) {
  return new Request(`http://x/api/admin/campaigns/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  state = {
    campaign: { id: ID, status: "draft", program_id: PROGRAM_ID, sent_count: 0 },
    cohort: { id: COHORT_ID, program_id: PROGRAM_ID },
    ledger: [],
    updateResult: { data: { id: ID }, error: null },
    deleteError: null,
  };
  updateSpy.mockReset();
  deleteSpy.mockReset();
});

describe("GET", () => {
  it("propaga el 403", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };
    expect((await GET(new Request("http://x"), ctx())).status).toBe(403);
  });

  it("rechaza un id inválido", async () => {
    expect((await GET(new Request("http://x"), ctx("abc"))).status).toBe(422);
  });

  it("404 si no existe", async () => {
    state.campaign = null;
    expect((await GET(new Request("http://x"), ctx())).status).toBe(404);
  });

  it("resume la entrega y lista solo los fallos", async () => {
    state.ledger = [
      { status: "sent", email: "a@x.cl", error: null },
      { status: "sent", email: "b@x.cl", error: null },
      { status: "failed", email: "c@x.cl", error: "bounced" },
    ];

    const body = await (await GET(new Request("http://x"), ctx())).json();

    expect(body.delivery.sent).toBe(2);
    expect(body.delivery.failed).toBe(1);
    expect(body.delivery.failures).toEqual([{ email: "c@x.cl", error: "bounced" }]);
  });
});

describe("PATCH", () => {
  it("rechaza body no JSON", async () => {
    const res = await PATCH(
      new Request(`http://x/api/admin/campaigns/${ID}`, { method: "PATCH", body: "{" }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("404 si no existe", async () => {
    state.campaign = null;
    expect((await PATCH(patchReq({ subject: "Nuevo" }), ctx())).status).toBe(404);
  });

  // Editar el cuerpo a mitad de un lote dejaría dos versiones del mismo
  // comunicado en las bandejas de los alumnos.
  it("409 si la campaña ya salió o está en curso", async () => {
    for (const status of ["sent", "sending"]) {
      state.campaign = { id: ID, status, program_id: PROGRAM_ID, sent_count: 10 };
      const res = await PATCH(patchReq({ subject: "Nuevo" }), ctx());
      expect(res.status).toBe(409);
    }
  });

  it("permite editar un borrador o una fallida", async () => {
    for (const status of ["draft", "failed"]) {
      state.campaign = { id: ID, status, program_id: PROGRAM_ID, sent_count: 0 };
      const res = await PATCH(patchReq({ subject: "Nuevo" }), ctx());
      expect(res.status).toBe(200);
    }
    expect(updateSpy).toHaveBeenCalledWith({ subject: "Nuevo" });
  });

  it("422 si no se manda nada que actualizar", async () => {
    expect((await PATCH(patchReq({}), ctx())).status).toBe(422);
  });

  it("rechaza una cohorte de otro entorno", async () => {
    state.cohort = { id: COHORT_ID, program_id: "otro" };
    expect((await PATCH(patchReq({ cohortId: COHORT_ID }), ctx())).status).toBe(422);
  });

  it("permite limpiar campos opcionales a null", async () => {
    await PATCH(patchReq({ preheader: null, ctaLabel: null, ctaUrl: null }), ctx());

    expect(updateSpy).toHaveBeenCalledWith({
      preheader: null,
      cta_label: null,
      cta_url: null,
    });
  });

  // Antes pasaba la validación y la incoherencia la atrapaba recién el CHECK de
  // la 0082, devolviendo un 422 genérico que no decía qué estaba mal.
  it("rechaza actualizar un solo lado del botón, con mensaje explícito", async () => {
    for (const body of [{ ctaUrl: null }, { ctaLabel: "Ver" }, { ctaLabel: null }]) {
      const res = await PATCH(patchReq(body), ctx());
      expect(res.status).toBe(422);
      expect(JSON.stringify(await res.json())).toContain("El botón se actualiza completo");
    }
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("acepta el par completo del botón", async () => {
    const res = await PATCH(patchReq({ ctaLabel: "Ver", ctaUrl: "https://x.cl" }), ctx());
    expect(res.status).toBe(200);
  });

  it("traduce un CHECK a 422", async () => {
    state.updateResult = { data: null, error: { code: "23514" } };
    expect((await PATCH(patchReq({ subject: "Nuevo" }), ctx())).status).toBe(422);
  });
});

describe("DELETE", () => {
  it("404 si no existe", async () => {
    state.campaign = null;
    expect((await DELETE(new Request("http://x"), ctx())).status).toBe(404);
  });

  // Una campaña enviada es registro de a quién se le escribió: borrarla se
  // llevaría la bitácora por cascada.
  it("409 si ya envió correos", async () => {
    state.campaign = { id: ID, status: "sent", program_id: PROGRAM_ID, sent_count: 20 };
    expect((await DELETE(new Request("http://x"), ctx())).status).toBe(409);

    state.campaign = { id: ID, status: "failed", program_id: PROGRAM_ID, sent_count: 3 };
    expect((await DELETE(new Request("http://x"), ctx())).status).toBe(409);

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("borra un borrador intacto", async () => {
    const res = await DELETE(new Request("http://x"), ctx());

    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("500 si la base falla", async () => {
    state.deleteError = { message: "boom" };
    expect((await DELETE(new Request("http://x"), ctx())).status).toBe(500);
  });
});
