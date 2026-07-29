import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const insertSpy = vi.fn();
let insertResult: { data: unknown; error: unknown };

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      insert: (values: Record<string, unknown>) => {
        insertSpy(values);
        return { select: () => ({ single: () => Promise.resolve(insertResult) }) };
      },
    }),
  })),
}));

const {
  createRemoteSurvey,
  enrollRemoteRecipients,
  fetchRemoteResults,
  publicSurveyUrl,
} = await import("@/lib/surveys/remote");
const { SurveysNotConfiguredError } = await import("@/lib/surveys/config");

const QUESTION = {
  key: "utilidad",
  type: "scale" as const,
  title: "¿Qué tan aplicable fue?",
  validation: { min: 1, max: 5 },
};

const ENV = [
  "SURVEYS_SUPABASE_URL",
  "SURVEYS_SUPABASE_SERVICE_ROLE_KEY",
  "SURVEYS_PUBLIC_BASE_URL",
  "SURVEY_RECIPIENTS_INGEST_SECRET",
  "SURVEYS_API_BASE_URL",
  "SURVEYS_API_TOKEN",
];
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  insertSpy.mockReset();
  insertResult = { data: { id: "srv-1", slug: "encuesta-abc123" }, error: null };
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const key of ENV) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.unstubAllGlobals();
});

function configureCreate() {
  process.env.SURVEYS_SUPABASE_URL = "https://shared.supabase.co";
  process.env.SURVEYS_SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
}

describe("publicSurveyUrl", () => {
  it("arma /s/<slug> sin duplicar la barra", () => {
    expect(publicSurveyUrl("https://x.cl/", "abc")).toBe("https://x.cl/s/abc");
    expect(publicSurveyUrl("https://x.cl", "abc")).toBe("https://x.cl/s/abc");
  });
});

describe("createRemoteSurvey", () => {
  it("exige configuración antes de tocar la red", async () => {
    await expect(
      createRemoteSurvey({ title: "T", questions: [QUESTION], mode: "anonymous" }),
    ).rejects.toBeInstanceOf(SurveysNotConfiguredError);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  // Las tres capas de anonimato deben viajar juntas: quitar cualquiera rompe
  // la promesa hecha a quien responde.
  it("publica una encuesta anónima con access_mode open, audience public y collect* en false", async () => {
    configureCreate();

    const created = await createRemoteSurvey({
      title: "¿Qué te pareció la clase?",
      questions: [QUESTION],
      mode: "anonymous",
    });

    const values = insertSpy.mock.calls[0][0];
    expect(values.access_mode).toBe("open");
    expect(values.audience).toBe("public");
    expect(values.settings).toMatchObject({
      collectEmail: false,
      collectName: false,
      collectPhone: false,
    });
    expect(values.status).toBe("published");
    expect(created.url).toBe("https://capitalinteligente.com/s/encuesta-abc123");
  });

  it("publica una encuesta identificada como gated", async () => {
    configureCreate();

    await createRemoteSurvey({ title: "T", questions: [QUESTION], mode: "identified" });

    const values = insertSpy.mock.calls[0][0];
    expect(values.access_mode).toBe("gated");
    expect(values.audience).toBe("internal");
  });

  it("deriva un slug del título con sufijo para no colisionar", async () => {
    configureCreate();

    await createRemoteSurvey({ title: "Clase de IA", questions: [QUESTION], mode: "anonymous" });

    expect(String(insertSpy.mock.calls[0][0].slug)).toMatch(/^clase-de-ia-[a-z0-9]{1,6}$/);
  });

  it("propaga el error del motor remoto con contexto", async () => {
    configureCreate();
    insertResult = { data: null, error: { message: "duplicate slug" } };

    await expect(
      createRemoteSurvey({ title: "T", questions: [QUESTION], mode: "anonymous" }),
    ).rejects.toThrow(/rechazó la creación: duplicate slug/);
  });
});

describe("enrollRemoteRecipients", () => {
  it("exige configuración", async () => {
    await expect(enrollRemoteRecipients("slug", [{ email: "a@x.cl" }])).rejects.toBeInstanceOf(
      SurveysNotConfiguredError,
    );
  });

  it("llama al endpoint de ingesta con el header secreto y notify", async () => {
    process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
    process.env.SURVEY_RECIPIENTS_INGEST_SECRET = "s3cr3t";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        recipients: [{ token: "t1" }],
        notified: { t1: { email: "sent", whatsapp: "sent" } },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await enrollRemoteRecipients("mi-encuesta", [
      { email: "a@x.cl", name: "Ana" },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://capitalinteligente.com/api/surveys/mi-encuesta/recipients");
    expect((init.headers as Record<string, string>)["x-ingest-secret"]).toBe("s3cr3t");

    const body = JSON.parse(init.body as string);
    expect(body.notify).toBe(true);
    // hclp valida con Zod .nullish(): los opcionales van como null explícito.
    expect(body.clients[0]).toEqual({ email: "a@x.cl", name: "Ana", phone: null, rut: null });

    expect(outcome.notified[0]).toEqual({
      email: "a@x.cl",
      email_status: "sent",
      whatsapp_status: "sent",
    });
  });

  it("marca desconocido lo que hclp no reporta", async () => {
    process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
    process.env.SURVEY_RECIPIENTS_INGEST_SECRET = "s3cr3t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );

    const outcome = await enrollRemoteRecipients("s", [{ email: "a@x.cl" }]);

    expect(outcome.notified[0].email_status).toBe("unknown");
    expect(outcome.notified[0].whatsapp_status).toBe("disabled");
  });

  // Si `recipients` no viene alineado con lo enviado, atribuir por índice le
  // asignaría a una persona el resultado de otra y la bitácora mentiría.
  it("corta si la respuesta no permite atribuir el resultado con certeza", async () => {
    process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
    process.env.SURVEY_RECIPIENTS_INGEST_SECRET = "s3cr3t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          recipients: [{ token: "t1" }],
          notified: { t1: { email: "sent", whatsapp: "sent" } },
        }),
      })),
    );

    await expect(
      enrollRemoteRecipients("s", [{ email: "a@x.cl" }, { email: "b@x.cl" }]),
    ).rejects.toThrow(/no se puede atribuir el resultado con certeza/);
  });

  it("falla con el status y el detalle cuando el endpoint rechaza", async () => {
    process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
    process.env.SURVEY_RECIPIENTS_INGEST_SECRET = "s3cr3t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" })),
    );

    await expect(enrollRemoteRecipients("s", [{ email: "a@x.cl" }])).rejects.toThrow(
      /rechazó el enrolamiento \(401\): unauthorized/,
    );
  });
});

describe("fetchRemoteResults", () => {
  it("exige configuración", async () => {
    await expect(fetchRemoteResults("srv-1")).rejects.toBeInstanceOf(SurveysNotConfiguredError);
  });

  it("autentica con Bearer y no cachea", async () => {
    process.env.SURVEYS_API_BASE_URL = "https://admin.capitalinteligente.com";
    process.env.SURVEYS_API_TOKEN = "tok";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ survey: { id: "srv-1" }, submissions: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRemoteResults("srv-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://admin.capitalinteligente.com/api/external/surveys/srv-1/results");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.cache).toBe("no-store");
  });

  it("propaga el status del error", async () => {
    process.env.SURVEYS_API_BASE_URL = "https://admin.capitalinteligente.com";
    process.env.SURVEYS_API_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "not found" })),
    );

    await expect(fetchRemoteResults("nope")).rejects.toThrow(/\(404\)/);
  });
});
