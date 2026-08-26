/**
 * Armado de la planilla de leads (`/admin/leads` → "Descargar XLSX").
 *
 * Puro y sin dependencias de red ni de SheetJS: acá se decide QUÉ va en el
 * archivo y cómo se ve cada celda; el panel se encarga de convertirlo a xlsx.
 * Así el contenido se puede testear sin montar un libro de Excel.
 */

import { TZ_CHILE } from "@/lib/time";
import { PROGRAM_LABELS, formatLeadOrigin } from "@/lib/admin/leads-format";
import type { LeadRow } from "@/lib/admin/leads-queries";

export const LEAD_EXPORT_HEADERS = [
  "Fecha",
  "Nombre",
  "Correo",
  "Teléfono",
  "Cargo",
  "Empresa",
  "Programa",
  "Origen",
  "¿Lidera equipo?",
  "Personas a cargo",
  "Desafíos",
  "Mensaje",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

/** Ancho de cada columna, en caracteres. Mismo orden que los encabezados. */
export const LEAD_EXPORT_WIDTHS = [
  18, 26, 30, 18, 22, 24, 14, 26, 16, 18, 40, 40, 16, 16, 22, 22,
];

const sheetDateFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Fecha para la planilla: "26-08-2026 15:31", hora de Chile.
 *
 * Va como TEXTO y no como fecha de Excel a propósito: una fecha nativa se
 * reinterpreta en la zona horaria de quien abre el archivo, y este reporte lo
 * lee gente en Chile que necesita ver la hora a la que llegó el lead, no la
 * hora local de su máquina.
 */
export function formatLeadDateForSheet(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return sheetDateFormatter.format(d).replace(",", "");
}

/** Una fila de la planilla por lead, en el orden de LEAD_EXPORT_HEADERS. */
export function leadToSheetRow(lead: LeadRow): (string | number)[] {
  return [
    formatLeadDateForSheet(lead.created_at),
    lead.full_name,
    lead.email,
    lead.phone,
    lead.role ?? "",
    lead.company ?? "",
    PROGRAM_LABELS[lead.program_interest] ?? lead.program_interest,
    formatLeadOrigin(lead),
    lead.lidera_equipo ?? "",
    lead.personas_a_cargo ?? "",
    // Es una casilla de selección múltiple: se aplana para que quepa en una celda.
    (lead.desafios ?? []).join(" · "),
    lead.message ?? "",
    lead.utm_source ?? "",
    lead.utm_medium ?? "",
    lead.utm_campaign ?? "",
    lead.utm_content ?? "",
  ];
}

/** Encabezados + una fila por lead, listo para `aoa_to_sheet`. */
export function buildLeadsSheet(leads: LeadRow[]): (string | number)[][] {
  return [[...LEAD_EXPORT_HEADERS], ...leads.map(leadToSheetRow)];
}

/**
 * Nombre del archivo: `leads-liderazgo-2026-08-26.xlsx`.
 *
 * Lleva el filtro activo porque la descarga baja lo que está en pantalla; sin
 * eso, dos descargas distintas se pisan en la carpeta de descargas con el
 * mismo nombre y no hay forma de saber cuál es cuál.
 */
export function leadsFileName(chip: string, now: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const alcance = chip && chip !== "todos" ? `-${chip}` : "";
  return `leads${alcance}-${fecha}.xlsx`;
}
