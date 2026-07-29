/**
 * Los tres contratos contra el motor de encuestas de Capital Inteligente.
 *
 * 1. CREAR   — insert directo en `surveys` del Supabase compartido con
 *              service_role. No hay endpoint server-to-server para crear: la API
 *              del panel de capital-admin exige sesión OTP de `panel_members`,
 *              que un servicio no puede tener. Es el mismo camino que se usó a
 *              mano el 2026-07-23 para la encuesta de feedback de la clase de IA.
 * 2. ENROLAR — POST al endpoint de ingesta de hclp. hclp emite un token por
 *              persona Y despacha correo + WhatsApp con su dedup de 30 días;
 *              Capital Academy no duplica esa infraestructura, la invoca.
 * 3. LEER    — GET a la API externa de capital-admin con Bearer token.
 *
 * Todo lo que sale de aquí está tipado de forma defensiva: son contratos de otro
 * repo que puede cambiar sin avisarnos.
 */

import { createClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils/slug";
import { requireSurveyEnv, surveyAuthorTag } from "@/lib/surveys/config";
import { toRemoteQuestions, type SurveyQuestion } from "@/lib/surveys/questions";

export type SurveyMode = "anonymous" | "identified";

export type CreatedRemoteSurvey = {
  id: string;
  slug: string;
  url: string;
};

/** Sufijo corto para que dos encuestas con el mismo título no colisionen. */
function slugSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Crea y PUBLICA la encuesta en el motor remoto.
 *
 * El anonimato del modo `anonymous` se sostiene en tres capas simultáneas, tal
 * como se configuró a mano el 23-jul: `access_mode: 'open'` (sin token por
 * persona), `audience: 'public'` y `collect*: false` (el formulario ni siquiera
 * pide correo). Quitar cualquiera de las tres rompe la promesa.
 */
export async function createRemoteSurvey(input: {
  title: string;
  description?: string | null;
  questions: SurveyQuestion[];
  mode: SurveyMode;
  closesAt?: string | null;
}): Promise<CreatedRemoteSurvey> {
  const env = requireSurveyEnv("create");
  const anonymous = input.mode === "anonymous";

  const client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const slug = `${slugify(input.title) || "encuesta"}-${slugSuffix()}`;
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("surveys")
    .insert({
      slug,
      title: input.title,
      description: input.description ?? null,
      status: "published",
      questions: toRemoteQuestions(input.questions),
      audience: anonymous ? "public" : "internal",
      access_mode: anonymous ? "open" : "gated",
      settings: {
        collectEmail: false,
        collectName: false,
        collectPhone: false,
        showProgressBar: true,
        oneResponsePerSession: anonymous,
      },
      branding: { source: "capitalacademy" },
      created_by: surveyAuthorTag(),
      published_at: nowIso,
      closes_at: input.closesAt ?? null,
    })
    .select("id, slug")
    .single();

  if (error) {
    throw new Error(`El motor de encuestas rechazó la creación: ${error.message}`);
  }

  return {
    id: String(data.id),
    slug: String(data.slug),
    url: publicSurveyUrl(env.publicBaseUrl, String(data.slug)),
  };
}

export function publicSurveyUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${slug}`;
}

export type EnrollClient = {
  email: string;
  name?: string | null;
  phone?: string | null;
  rut?: string | null;
};

export type EnrollOutcome = {
  /** Resultado por correo y canal, tal como lo reportó hclp. */
  notified: Array<{ email: string; email_status: string; whatsapp_status: string }>;
};

/**
 * Enrola destinatarios en una encuesta GATED. hclp devuelve un token por
 * persona y se encarga del despacho (correo + WhatsApp).
 *
 * Solo para modo identificado: llamar a esto con una encuesta anónima crearía
 * un enlace único por persona y rompería el anonimato.
 */
export async function enrollRemoteRecipients(
  slug: string,
  clients: EnrollClient[],
): Promise<EnrollOutcome> {
  const env = requireSurveyEnv("enroll");
  const endpoint = `${env.publicBaseUrl.replace(/\/+$/, "")}/api/surveys/${encodeURIComponent(slug)}/recipients`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-secret": env.ingestSecret,
    },
    body: JSON.stringify({
      source: "admin",
      notify: true,
      clients: clients.map((c) => ({
        email: c.email,
        // hclp valida con Zod `.nullish()`: mandar null explícito es correcto,
        // mandar undefined omite la clave. Se normaliza a null.
        name: c.name ?? null,
        phone: c.phone ?? null,
        rut: c.rut ?? null,
      })),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `El servicio de encuestas rechazó el enrolamiento (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await res.json().catch(() => ({}))) as {
    recipients?: Array<{ token?: string }>;
    notified?: Record<string, { email?: string; whatsapp?: string }>;
  };

  // `notified` viene indexado por token; se re-indexa por correo usando el
  // orden de `recipients`, que hclp devuelve alineado con el request.
  const tokens = (payload.recipients ?? []).map((r) => r.token ?? "");

  // Si esa alineación no se cumple, atribuiríamos el resultado de una persona a
  // otra y la bitácora quedaría mintiendo sobre a quién le llegó. Ante un
  // desalineo se corta: hclp deduplica 30 días, así que reintentar no spamea.
  if (payload.notified && tokens.length !== clients.length) {
    throw new Error(
      `El servicio de encuestas devolvió ${tokens.length} destinatarios para ${clients.length} enviados: no se puede atribuir el resultado con certeza`,
    );
  }

  const notified = clients.map((client, index) => {
    const status = payload.notified?.[tokens[index] ?? ""] ?? {};
    return {
      email: client.email,
      email_status: status.email ?? "unknown",
      whatsapp_status: status.whatsapp ?? "disabled",
    };
  });

  return { notified };
}

export type RemoteResults = {
  survey: { id: string; title: string; slug: string };
  questions: Array<{ key: string; type: string; title: string }>;
  submissions: Array<Record<string, unknown>>;
  exported_at?: string;
};

/** Resultados agregados de una encuesta ya creada. */
export async function fetchRemoteResults(surveyId: string): Promise<RemoteResults> {
  const env = requireSurveyEnv("results");
  const endpoint = `${env.apiBaseUrl.replace(/\/+$/, "")}/api/external/surveys/${encodeURIComponent(surveyId)}/results`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${env.apiToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `No se pudieron leer los resultados (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await res.json()) as RemoteResults;
}
