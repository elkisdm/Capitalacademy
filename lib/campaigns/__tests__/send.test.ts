import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Dobles -----------------------------------------------------------------

type Campaign = {
  id: string;
  program_id: string;
  cohort_id: string | null;
  subject: string;
  preheader: string | null;
  body_md: string;
  cta_label: string | null;
  cta_url: string | null;
  audience_status: string[] | null;
  audience_segment: string | null;
};

type State = {
  /** Fila devuelta por el reclamo normal (null = la campaña no era reclamable). */
  claimed: Campaign | null;
  /** Fila devuelta por el reclamo de una reserva vieja (crash a mitad del lote). */
  staleClaimed: Campaign | null;
  claimError: unknown;
  /** Filas de enrollments que verá resolveAudience. */
  enrollments: unknown[];
  /** student_id ya presentes en la bitácora con status 'sent'. */
  ledger: Array<{ student_id: string }>;
  ledgerError: unknown;
};

let state: State;

/** Updates finales aplicados a email_campaigns (los que NO son reclamo). */
const statusUpdates: Record<string, unknown>[] = [];
/** Filas escritas en la bitácora. */
const ledgerWrites: Record<string, unknown>[][] = [];

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  let payload: Record<string, unknown> | null = null;
  let isClaim = false;
  let isStale = false;
  let selected = false;

  b.update = (values: Record<string, unknown>) => {
    payload = values;
    return b;
  };
  b.select = () => {
    selected = true;
    return b;
  };
  b.insert = () => b;
  b.delete = () => b;
  b.upsert = (rows: Record<string, unknown>[]) => {
    ledgerWrites.push(rows);
    return b;
  };
  b.eq = () => b;
  b.in = () => {
    isClaim = true;
    return b;
  };
  b.lt = () => {
    isStale = true;
    return b;
  };

  b.maybeSingle = () => {
    if (isStale) return Promise.resolve({ data: state.staleClaimed, error: null });
    if (isClaim) return Promise.resolve({ data: state.claimed, error: state.claimError });
    return Promise.resolve({ data: null, error: null });
  };

  // Await directo: lectura de bitácora, de enrollments, o update de estado.
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    let result: unknown;
    if (table === "enrollments") {
      result = { data: state.enrollments, error: null };
    } else if (table === "email_campaign_recipients") {
      result = selected ? { data: state.ledger, error: state.ledgerError } : { error: null };
    } else {
      // email_campaigns sin select → update de estado terminal.
      if (payload) statusUpdates.push(payload);
      result = { data: null, error: null };
    }
    return Promise.resolve(result).then(res, rej);
  };

  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const sendEmailBatchSpy = vi.fn();
vi.mock("@/lib/email/send-batch", () => ({
  sendEmailBatch: (...args: unknown[]) => sendEmailBatchSpy(...args),
}));

const { sendEmailCampaign } = await import("@/lib/campaigns/send");

// --- Fixtures ---------------------------------------------------------------

const CAMPAIGN_ID = "cccccccc-1111-4111-8111-111111111111";

const CAMPAIGN: Campaign = {
  id: CAMPAIGN_ID,
  program_id: "a0000000-0000-0000-0000-000000000002",
  cohort_id: null,
  subject: "Novedades",
  preheader: null,
  body_md: "Hola a todos.",
  cta_label: null,
  cta_url: null,
  audience_status: ["active"],
  audience_segment: null,
};

function enrollment(id: string, email: string) {
  return { student_id: id, profiles: { email, full_name: "Alumno", role: "student" } };
}

beforeEach(() => {
  state = {
    claimed: CAMPAIGN,
    staleClaimed: null,
    claimError: null,
    enrollments: [enrollment("s1", "a@x.cl"), enrollment("s2", "b@x.cl"), enrollment("s3", "c@x.cl")],
    ledger: [],
    ledgerError: null,
  };
  statusUpdates.length = 0;
  ledgerWrites.length = 0;
  sendEmailBatchSpy.mockReset();
  sendEmailBatchSpy.mockResolvedValue({ sent: ["a@x.cl", "b@x.cl", "c@x.cl"], failed: [] });
});

// --- Tests ------------------------------------------------------------------

describe("sendEmailCampaign — camino feliz", () => {
  it("envía a toda la audiencia y deja la campaña en 'sent'", async () => {
    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result).toEqual({ status: "sent", sent: 3, alreadySent: 0, total: 3 });

    const terminal = statusUpdates.at(-1)!;
    expect(terminal.status).toBe("sent");
    expect(terminal.recipients_count).toBe(3);
    expect(terminal.sent_count).toBe(3);
    expect(terminal.sent_at).toBeTruthy();
  });

  it("despacha por lote, nunca uno a uno", async () => {
    await sendEmailCampaign(CAMPAIGN_ID);

    expect(sendEmailBatchSpy).toHaveBeenCalledTimes(1);
    const [messages, prefix] = sendEmailBatchSpy.mock.calls[0];
    expect(messages).toHaveLength(3);
    // El prefijo ancla la clave de idempotencia de Resend a ESTA campaña.
    expect(prefix).toBe(`ec:${CAMPAIGN_ID}`);
  });

  it("registra en la bitácora a cada destinatario entregado", async () => {
    await sendEmailCampaign(CAMPAIGN_ID);

    expect(ledgerWrites).toHaveLength(1);
    expect(ledgerWrites[0]).toHaveLength(3);
    expect(ledgerWrites[0][0]).toMatchObject({
      campaign_id: CAMPAIGN_ID,
      channel: "email",
      status: "sent",
    });
  });
});

describe("sendEmailCampaign — idempotencia por destinatario", () => {
  // Este es el corazón de ADR-0020: reintentar no puede duplicar correos.
  it("solo envía a quien falta cuando la bitácora ya tiene entregas", async () => {
    state.ledger = [{ student_id: "s1" }, { student_id: "s2" }];
    sendEmailBatchSpy.mockResolvedValue({ sent: ["c@x.cl"], failed: [] });

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    const [messages] = sendEmailBatchSpy.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect((messages as Array<{ to: string }>)[0].to).toBe("c@x.cl");
    expect(result).toEqual({ status: "sent", sent: 1, alreadySent: 2, total: 3 });
  });

  it("no envía nada si ya recibieron todos, y cierra la campaña", async () => {
    state.ledger = [{ student_id: "s1" }, { student_id: "s2" }, { student_id: "s3" }];

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "sent", sent: 0, alreadySent: 3, total: 3 });
    expect(statusUpdates.at(-1)!.status).toBe("sent");
  });
});

describe("sendEmailCampaign — entrega parcial", () => {
  // El bug que ADR-0020 documentó en prod: marcar 'sent' con entregas parciales
  // dejaba la fila terminal y esos correos se perdían para siempre.
  it("deja la campaña en 'failed' (reintentable), no en 'sent'", async () => {
    sendEmailBatchSpy.mockResolvedValue({
      sent: ["a@x.cl", "b@x.cl"],
      failed: [{ to: "c@x.cl", error: "invalid recipient" }],
    });

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result).toEqual({ status: "partial", sent: 2, failed: 1, alreadySent: 0, total: 3 });

    const terminal = statusUpdates.at(-1)!;
    expect(terminal.status).toBe("failed");
    expect(terminal.sent_at).toBeUndefined();
    expect(String(terminal.error)).toContain("1 de 3");
  });

  it("registra los fallos en la bitácora con su motivo", async () => {
    sendEmailBatchSpy.mockResolvedValue({
      sent: ["a@x.cl"],
      failed: [{ to: "b@x.cl", error: "bounced" }],
    });

    await sendEmailCampaign(CAMPAIGN_ID);

    const rows = ledgerWrites[0];
    expect(rows.find((r) => r.email === "b@x.cl")).toMatchObject({
      status: "failed",
      error: "bounced",
    });
  });
});

describe("sendEmailCampaign — reclamo", () => {
  it("aborta si la campaña no es reclamable ni quedó colgada", async () => {
    state.claimed = null;
    state.staleClaimed = null;

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result).toEqual({
      status: "skipped",
      reason: "La campaña ya fue enviada o hay un envío en curso",
    });
    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
  });

  it("retoma una reserva vieja de un envío que murió a medias", async () => {
    state.claimed = null;
    state.staleClaimed = CAMPAIGN;

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("sent");
    expect(sendEmailBatchSpy).toHaveBeenCalledTimes(1);
  });

  it("no envía si el reclamo falla", async () => {
    state.claimed = null;
    state.claimError = { message: "db down" };
    state.staleClaimed = null;

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("skipped");
    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
  });
});

describe("sendEmailCampaign — guardas de audiencia", () => {
  it("marca 'failed' y no envía si la audiencia quedó vacía", async () => {
    state.enrollments = [];

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result).toEqual({
      status: "skipped",
      reason: "La audiencia quedó vacía con los filtros elegidos",
    });
    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
    expect(statusUpdates.at(-1)!.status).toBe("failed");
  });

  it("no envía a ciegas si no se pudo leer la bitácora", async () => {
    state.ledgerError = { message: "timeout" };

    const result = await sendEmailCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("skipped");
    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
  });
});
