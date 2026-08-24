/**
 * Helpers puros del panel de leads (`/admin/leads`): etiquetas y formateo de
 * presentación. Separados de la query para poder testearlos sin tocar
 * Supabase.
 */

import { TZ_CHILE } from "@/lib/time";

export const PROGRAM_LABELS: Record<string, string> = {
  diplomado: "Diplomado",
  liderazgo: "Liderazgo",
  ruta: "Ruta del Inversionista",
  indeciso: "Indeciso",
};

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  day: "2-digit",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fullDateFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "21 ago, 15:31" en hora de Chile; string vacío si la fecha no parsea. */
export function formatLeadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // es-CL entrega "21-ago"; el guion se cambia por espacio para la tabla.
  return `${dateFormatter.format(d).replace("-", " ")}, ${timeFormatter.format(d)}`;
}

/** "viernes, 21 de agosto de 2026, 15:31" para el detalle. */
export function formatLeadDateFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return fullDateFormatter.format(d);
}

/** Resume el origen del lead: la campaña con su fuente si vino de ads,
    o el `source` interno (landing, calculadora) si llegó orgánico. */
export function formatLeadOrigin(lead: {
  source: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
}): string {
  if (lead.utm_campaign) {
    const via = lead.utm_source ? ` (${lead.utm_source})` : "";
    return `${lead.utm_campaign}${via}`;
  }
  if (lead.utm_source) return lead.utm_source;
  return lead.source ?? "directo";
}

/** Iniciales para el avatar, mismo criterio que el layout admin. */
export function leadInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Un lead se marca "Nuevo" durante sus primeras 48 horas. */
export function isNewLead(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return now.getTime() - d.getTime() < 48 * 60 * 60 * 1000;
}

/** Teléfono en dígitos para el enlace de WhatsApp (wa.me/569…). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}
