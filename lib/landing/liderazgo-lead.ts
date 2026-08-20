/**
 * Arma el payload que la landing de Liderazgo envía a POST /api/leads.
 * Puro para poder testearlo sin DOM: recibe los valores ya leídos del form.
 */

export type LiderazgoLeadInput = {
  full_name: string;
  email: string;
  phone: string;
  role?: string;
  company?: string;
  message?: string;
  /** Respuestas de calificación del formulario (ver migración 0103). */
  lidera_equipo?: string;
  personas_a_cargo?: string;
  /** Casillas: varias. Si eligió "Otro", su texto entra como un valor más. */
  desafios?: string[];
  desafio_otro?: string;
  /** Honeypot anti-bot: si viene con contenido, no se envía nada. */
  website?: string;
  utms?: Partial<
    Record<
      "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term",
      string
    >
  >;
};

export const LIDERAZGO_LEAD_SOURCE = "landing-liderazgo";

export function buildLiderazgoLeadPayload(input: LiderazgoLeadInput) {
  return {
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    role: input.role?.trim() ?? "",
    company: input.company?.trim() ?? "",
    program_interest: "liderazgo" as const,
    message: input.message?.trim() ?? "",
    lidera_equipo: input.lidera_equipo?.trim() ?? "",
    personas_a_cargo: input.personas_a_cargo?.trim() ?? "",
    desafios: normalizarDesafios(input.desafios, input.desafio_otro),
    website: input.website ?? "",
    source: LIDERAZGO_LEAD_SOURCE,
    utm_source: input.utms?.utm_source ?? "",
    utm_medium: input.utms?.utm_medium ?? "",
    utm_campaign: input.utms?.utm_campaign ?? "",
    utm_content: input.utms?.utm_content ?? "",
    utm_term: input.utms?.utm_term ?? "",
  };
}

/**
 * Une los desafíos marcados con el texto de "Otro", si lo escribió.
 *
 * "Otro" se descarta como etiqueta: guardar la palabra "Otro" no dice nada, y
 * dejarla junto al texto real haría que contar cuál desafío pesa más arroje un
 * "Otro" inflado que no corresponde a ningún desafío concreto. Si marcó "Otro"
 * y no escribió nada, no se guarda nada por esa opción.
 */
export function normalizarDesafios(
  marcados: string[] | undefined,
  otro: string | undefined,
): string[] {
  const base = (marcados ?? []).map((d) => d.trim()).filter((d) => d && d !== "Otro");
  const libre = otro?.trim();
  if (libre) base.push(libre);
  // Sin duplicados: si el texto libre repite una opción ya marcada, contarla
  // dos veces distorsionaría el conteo.
  return [...new Set(base)];
}
