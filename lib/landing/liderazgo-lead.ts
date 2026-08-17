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
    website: input.website ?? "",
    source: LIDERAZGO_LEAD_SOURCE,
    utm_source: input.utms?.utm_source ?? "",
    utm_medium: input.utms?.utm_medium ?? "",
    utm_campaign: input.utms?.utm_campaign ?? "",
    utm_content: input.utms?.utm_content ?? "",
    utm_term: input.utms?.utm_term ?? "",
  };
}
