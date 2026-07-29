import { describe, it, expect, beforeEach, vi } from "vitest";

type SurveyCampaign = {
  id: string;
  program_id: string;
  cohort_id: string | null;
  title: string;
  mode: "anonymous" | "identified";
  external_survey_slug: string;
  external_survey_url: string;
  audience_status: string[] | null;
  audience_segment: string | null;
};

type State = {
  claimed: SurveyCampaign | null;
  staleClaimed: SurveyCampaign | null;
  enrollments: unknown[];
  ledger: Array<{ student_id: string }>;
};

let state: State;
const statusUpdates: Record<string, unknown>[] = [];
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
    if (isClaim) return Promise.resolve({ data: state.claimed, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    let result: unknown;
    if (table === "enrollments") result = { data: state.enrollments, error: null };
    else if (table === "survey_campaign_recipients")
      result = selected ? { data: state.ledger, error: null } : { error: null };
    else {
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

const enrollSpy = vi.fn();
vi.mock("@/lib/surveys/remote", () => ({
  enrollRemoteRecipients: (...args: unknown[]) => enrollSpy(...args),
}));

const { sendSurveyCampaign, assertAnonymousUrl } = await import("@/lib/surveys/send");

const CAMPAIGN_ID = "dddddddd-2222-4222-8222-222222222222";

const ANON: SurveyCampaign = {
  id: CAMPAIGN_ID,
  program_id: "a0000000-0000-0000-0000-000000000002",
  cohort_id: null,
  title: "¿Qué te pareció la clase?",
  mode: "anonymous",
  external_survey_slug: "clase-abc123",
  external_survey_url: "https://capitalinteligente.com/s/clase-abc123",
  audience_status: ["active"],
  audience_segment: null,
};

const IDENT: SurveyCampaign = { ...ANON, mode: "identified" };

function enrollment(id: string, email: string) {
  return { student_id: id, profiles: { email, full_name: "Alumno", role: "student" } };
}

beforeEach(() => {
  state = {
    claimed: ANON,
    staleClaimed: null,
    enrollments: [enrollment("s1", "a@x.cl"), enrollment("s2", "b@x.cl")],
    ledger: [],
  };
  statusUpdates.length = 0;
  ledgerWrites.length = 0;
  sendEmailBatchSpy.mockReset();
  sendEmailBatchSpy.mockResolvedValue({ sent: ["a@x.cl", "b@x.cl"], failed: [] });
  enrollSpy.mockReset();
});

describe("assertAnonymousUrl", () => {
  it("acepta una URL limpia", () => {
    expect(() => assertAnonymousUrl("https://x.cl/s/abc")).not.toThrow();
    expect(() => assertAnonymousUrl("https://x.cl/s/abc?utm_source=correo")).not.toThrow();
  });

  it("rechaza cualquier identificador en la query", () => {
    for (const url of [
      "https://x.cl/s/abc?t=TOKEN",
      "https://x.cl/s/abc?token=TOKEN",
      "https://x.cl/s/abc?email=ana@x.cl",
      "https://x.cl/s/abc?utm=1&uid=9",
      "https://x.cl/s/abc?rut=111",
    ]) {
      expect(() => assertAnonymousUrl(url)).toThrow(/no puede llevar identificador/);
    }
  });
});

describe("sendSurveyCampaign — modo anónimo", () => {
  it("envía por Resend con el mismo enlace para todos", async () => {
    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result).toEqual({ status: "sent", sent: 2, alreadySent: 0, total: 2 });
    expect(enrollSpy).not.toHaveBeenCalled();

    const [messages, prefix] = sendEmailBatchSpy.mock.calls[0];
    expect(prefix).toBe(`sv:${CAMPAIGN_ID}`);
    const urls = (messages as Array<{ html: string }>).map((m) =>
      m.html.match(/href="(https:\/\/capitalinteligente[^"]+)"/)?.[1],
    );
    expect(new Set(urls).size).toBe(1);
  });

  it("aborta si el enlace lleva identificador", async () => {
    state.claimed = { ...ANON, external_survey_url: "https://x.cl/s/abc?t=TOKEN" };

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("skipped");
    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
    expect(statusUpdates.at(-1)!.status).toBe("failed");
  });
});

describe("sendSurveyCampaign — modo identificado", () => {
  it("delega en hclp y no manda correo propio", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "sent", whatsapp_status: "sent" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "disabled" },
      ],
    });

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
    expect(enrollSpy).toHaveBeenCalledWith("clase-abc123", [
      { email: "a@x.cl", name: "Alumno" },
      { email: "b@x.cl", name: "Alumno" },
    ]);
    expect(result).toEqual({ status: "sent", sent: 2, alreadySent: 0, total: 2 });
  });

  // hclp deduplica por 30 días: 'skipped' significa "ya la tenía", no un fallo.
  it("cuenta 'skipped' de hclp como entregado", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "skipped", whatsapp_status: "disabled" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "sent" },
      ],
    });

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("sent");
    expect(
      ledgerWrites[0].filter((r) => r.channel === "email").every((r) => r.status === "sent"),
    ).toBe(true);
  });

  // La migración 0083 admite channel='whatsapp' y hclp lo reporta: si no se
  // escribe, el segundo canal queda sin registro alguno.
  it("registra en la bitácora lo que hclp reportó por WhatsApp", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "sent", whatsapp_status: "sent" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "error" },
      ],
    });

    await sendSurveyCampaign(CAMPAIGN_ID);

    const whatsapp = ledgerWrites[0].filter((r) => r.channel === "whatsapp");
    expect(whatsapp).toHaveLength(2);
    expect(whatsapp.find((r) => r.email === "a@x.cl")!.status).toBe("sent");
    expect(whatsapp.find((r) => r.email === "b@x.cl")!.status).toBe("failed");
  });

  it("no registra fila de WhatsApp cuando hclp lo reporta 'disabled'", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "sent", whatsapp_status: "disabled" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "disabled" },
      ],
    });

    await sendSurveyCampaign(CAMPAIGN_ID);

    expect(ledgerWrites[0].some((r) => r.channel === "whatsapp")).toBe(false);
  });

  // WhatsApp es canal secundario: que falle no debe marcar fallida la campaña
  // ni forzar un reenvío del correo a quien ya lo recibió.
  it("un fallo de WhatsApp no ensucia el estado de la campaña", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "sent", whatsapp_status: "error" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "error" },
      ],
    });

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("sent");
    expect(statusUpdates.at(-1)!.status).toBe("sent");
  });

  it("registra como fallo lo que hclp reporta con error", async () => {
    state.claimed = IDENT;
    enrollSpy.mockResolvedValue({
      notified: [
        { email: "a@x.cl", email_status: "error", whatsapp_status: "error" },
        { email: "b@x.cl", email_status: "sent", whatsapp_status: "sent" },
      ],
    });

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result).toEqual({ status: "partial", sent: 1, failed: 1, alreadySent: 0, total: 2 });
    expect(statusUpdates.at(-1)!.status).toBe("failed");
  });

  it("marca la encuesta como fallida si el enrolamiento revienta", async () => {
    state.claimed = IDENT;
    enrollSpy.mockRejectedValue(new Error("ingesta caída"));

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result).toEqual({ status: "skipped", reason: "ingesta caída" });
    expect(statusUpdates.at(-1)!.status).toBe("failed");
  });
});

describe("sendSurveyCampaign — idempotencia y guardas", () => {
  it("solo invita a quien falta según la bitácora", async () => {
    state.ledger = [{ student_id: "s1" }];
    sendEmailBatchSpy.mockResolvedValue({ sent: ["b@x.cl"], failed: [] });

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect((sendEmailBatchSpy.mock.calls[0][0] as unknown[]).length).toBe(1);
    expect(result).toEqual({ status: "sent", sent: 1, alreadySent: 1, total: 2 });
  });

  it("no reenvía si ya la recibieron todos", async () => {
    state.ledger = [{ student_id: "s1" }, { student_id: "s2" }];

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(sendEmailBatchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("sent");
  });

  it("aborta si la encuesta no es reclamable", async () => {
    state.claimed = null;

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result).toEqual({
      status: "skipped",
      reason: "La encuesta ya fue enviada o hay un envío en curso",
    });
  });

  it("retoma un envío que murió a medias", async () => {
    state.claimed = null;
    state.staleClaimed = ANON;

    expect((await sendSurveyCampaign(CAMPAIGN_ID)).status).toBe("sent");
  });

  it("marca fallida la audiencia vacía", async () => {
    state.enrollments = [];

    const result = await sendSurveyCampaign(CAMPAIGN_ID);

    expect(result.status).toBe("skipped");
    expect(statusUpdates.at(-1)!.status).toBe("failed");
  });
});
