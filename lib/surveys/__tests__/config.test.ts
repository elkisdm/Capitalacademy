import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SurveysNotConfiguredError,
  missingFor,
  requireSurveyEnv,
  surveyAuthorTag,
  surveysConfigStatus,
} from "@/lib/surveys/config";

const KEYS = [
  "SURVEYS_SUPABASE_URL",
  "SURVEYS_SUPABASE_SERVICE_ROLE_KEY",
  "SURVEYS_PUBLIC_BASE_URL",
  "SURVEY_RECIPIENTS_INGEST_SECRET",
  "SURVEYS_API_BASE_URL",
  "SURVEYS_API_TOKEN",
  "SURVEYS_CREATED_BY",
];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("missingFor", () => {
  it("lista las variables faltantes de cada capacidad", () => {
    expect(missingFor("create")).toEqual([
      "SURVEYS_SUPABASE_URL",
      "SURVEYS_SUPABASE_SERVICE_ROLE_KEY",
      "SURVEYS_PUBLIC_BASE_URL",
    ]);
    expect(missingFor("results")).toEqual(["SURVEYS_API_BASE_URL", "SURVEYS_API_TOKEN"]);
  });

  it("trata una variable en blanco como ausente", () => {
    process.env.SURVEYS_API_BASE_URL = "   ";
    process.env.SURVEYS_API_TOKEN = "tok";

    expect(missingFor("results")).toEqual(["SURVEYS_API_BASE_URL"]);
  });

  it("queda vacío cuando están todas", () => {
    process.env.SURVEYS_API_BASE_URL = "https://admin.example.com";
    process.env.SURVEYS_API_TOKEN = "tok";

    expect(missingFor("results")).toEqual([]);
  });
});

describe("surveysConfigStatus", () => {
  it("reporta cada capacidad por separado", () => {
    process.env.SURVEYS_PUBLIC_BASE_URL = "https://capitalinteligente.com";
    process.env.SURVEY_RECIPIENTS_INGEST_SECRET = "s3cr3t";

    const status = surveysConfigStatus();

    expect(status.enroll.ready).toBe(true);
    expect(status.create.ready).toBe(false);
    expect(status.results.ready).toBe(false);
  });
});

describe("requireSurveyEnv", () => {
  it("devuelve los valores recortados cuando está configurado", () => {
    process.env.SURVEYS_API_BASE_URL = " https://admin.example.com ";
    process.env.SURVEYS_API_TOKEN = "tok";

    expect(requireSurveyEnv("results")).toEqual({
      apiBaseUrl: "https://admin.example.com",
      apiToken: "tok",
    });
  });

  // Falla como problema de despliegue, con la variable nombrada, no como un
  // `fetch failed` opaco a mitad de un envío.
  it("lanza SurveysNotConfiguredError nombrando lo que falta", () => {
    try {
      requireSurveyEnv("create");
      expect.unreachable("debía lanzar");
    } catch (err) {
      expect(err).toBeInstanceOf(SurveysNotConfiguredError);
      expect((err as SurveysNotConfiguredError).missing).toContain("SURVEYS_SUPABASE_URL");
      expect((err as Error).message).toContain("SURVEYS_SUPABASE_URL");
    }
  });
});

describe("surveyAuthorTag", () => {
  it("usa 'capitalacademy' por defecto", () => {
    expect(surveyAuthorTag()).toBe("capitalacademy");
  });

  it("respeta la variable si está definida", () => {
    process.env.SURVEYS_CREATED_BY = "academia@capitalinteligente.cl";
    expect(surveyAuthorTag()).toBe("academia@capitalinteligente.cl");
  });
});
