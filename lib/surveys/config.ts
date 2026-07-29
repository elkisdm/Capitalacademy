/**
 * Credenciales del motor de encuestas FEDERADO (ADR-0026).
 *
 * Capital Academy no aloja encuestas: las aloja el stack de Capital Inteligente
 * (capital-admin + hclp) sobre un Supabase distinto del nuestro. Este módulo
 * concentra las variables de ese cruce para que un despliegue sin configurar
 * falle con un mensaje que nombra la variable exacta, en vez de con un stack
 * trace de `fetch failed` o un cliente Supabase apuntando a undefined.
 *
 * Tres superficies, tres secretos independientes — es el patrón de la empresa
 * (un secreto por superficie, rotable por separado; nada de un token maestro):
 *
 *   Crear encuesta   → SURVEYS_SUPABASE_URL + SURVEYS_SUPABASE_SERVICE_ROLE_KEY
 *   Enrolar personas → SURVEYS_PUBLIC_BASE_URL + SURVEY_RECIPIENTS_INGEST_SECRET
 *   Leer resultados  → SURVEYS_API_BASE_URL + SURVEYS_API_TOKEN
 */

export const SURVEY_ENV_KEYS = {
  supabaseUrl: "SURVEYS_SUPABASE_URL",
  supabaseServiceKey: "SURVEYS_SUPABASE_SERVICE_ROLE_KEY",
  publicBaseUrl: "SURVEYS_PUBLIC_BASE_URL",
  ingestSecret: "SURVEY_RECIPIENTS_INGEST_SECRET",
  apiBaseUrl: "SURVEYS_API_BASE_URL",
  apiToken: "SURVEYS_API_TOKEN",
} as const;

export type SurveyEnvKey = keyof typeof SURVEY_ENV_KEYS;

/** Qué variables necesita cada operación. */
export const SURVEY_CAPABILITIES = {
  create: ["supabaseUrl", "supabaseServiceKey", "publicBaseUrl"],
  enroll: ["publicBaseUrl", "ingestSecret"],
  results: ["apiBaseUrl", "apiToken"],
} as const satisfies Record<string, readonly SurveyEnvKey[]>;

export type SurveyCapability = keyof typeof SURVEY_CAPABILITIES;

/**
 * Error de configuración, no de ejecución. La API lo traduce a 503 con la lista
 * de variables faltantes: es un problema de despliegue que alguien debe ir a
 * arreglar, no un fallo que reintentar.
 */
export class SurveysNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `El módulo de encuestas no está configurado. Faltan variables de entorno: ${missing.join(", ")}`,
    );
    this.name = "SurveysNotConfiguredError";
    this.missing = missing;
  }
}

function readEnv(key: SurveyEnvKey): string | null {
  const value = process.env[SURVEY_ENV_KEYS[key]];
  return value && value.trim() ? value.trim() : null;
}

/** Variables faltantes para una capacidad. Vacío = lista para usar. */
export function missingFor(capability: SurveyCapability): string[] {
  return SURVEY_CAPABILITIES[capability]
    .filter((key) => readEnv(key) === null)
    .map((key) => SURVEY_ENV_KEYS[key]);
}

/** Estado por capacidad, para que la UI explique qué se puede y qué no. */
export function surveysConfigStatus(): Record<SurveyCapability, { ready: boolean; missing: string[] }> {
  const capabilities = Object.keys(SURVEY_CAPABILITIES) as SurveyCapability[];
  return capabilities.reduce(
    (acc, capability) => {
      const missing = missingFor(capability);
      acc[capability] = { ready: missing.length === 0, missing };
      return acc;
    },
    {} as Record<SurveyCapability, { ready: boolean; missing: string[] }>,
  );
}

/** Lee las variables de una capacidad o lanza `SurveysNotConfiguredError`. */
export function requireSurveyEnv<K extends SurveyEnvKey>(
  capability: SurveyCapability,
): Record<K, string> {
  const missing = missingFor(capability);
  if (missing.length > 0) throw new SurveysNotConfiguredError(missing);

  return SURVEY_CAPABILITIES[capability].reduce(
    (acc, key) => {
      acc[key as K] = readEnv(key) as string;
      return acc;
    },
    {} as Record<K, string>,
  );
}

/** Quién figura como autor en el motor remoto. */
export function surveyAuthorTag(): string {
  return process.env.SURVEYS_CREATED_BY?.trim() || "capitalacademy";
}
