import { describe, it, expect } from "vitest";
import {
  LEAD_EXPORT_HEADERS,
  LEAD_EXPORT_WIDTHS,
  buildLeadsSheet,
  formatLeadDateForSheet,
  leadToSheetRow,
  leadsFileName,
} from "@/lib/admin/leads-export";
import type { LeadRow } from "@/lib/admin/leads-queries";

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "l-1",
    created_at: "2026-08-26T19:31:00Z",
    full_name: "Carol Martinez",
    email: "carol@agmpropiedades.cl",
    phone: "+56990921417",
    role: "Jefa comercial",
    company: "AGM Propiedades",
    program_interest: "liderazgo",
    message: null,
    source: "landing-liderazgo",
    utm_source: "ig",
    utm_medium: "paid",
    utm_campaign: "liderazgo-ago",
    utm_content: "video-1",
    lidera_equipo: "Sí",
    personas_a_cargo: "6 a 10",
    desafios: ["Motivar al equipo", "Cerrar más ventas"],
    ...overrides,
  };
}

describe("formatLeadDateForSheet", () => {
  it("usa hora de Chile, no UTC", () => {
    // 19:31 UTC = 15:31 en Chile (UTC-4 en agosto).
    expect(formatLeadDateForSheet("2026-08-26T19:31:00Z")).toBe("26-08-2026 15:31");
  });

  it("devuelve vacío si la fecha no parsea, sin romper la planilla", () => {
    expect(formatLeadDateForSheet("no-es-fecha")).toBe("");
  });
});

describe("leadToSheetRow", () => {
  it("tiene exactamente una celda por encabezado", () => {
    expect(leadToSheetRow(lead())).toHaveLength(LEAD_EXPORT_HEADERS.length);
  });

  it("traduce el programa a su etiqueta legible", () => {
    expect(leadToSheetRow(lead())[6]).toBe("Liderazgo");
  });

  it("deja el valor crudo si el programa no tiene etiqueta conocida", () => {
    expect(leadToSheetRow(lead({ program_interest: "otro-programa" }))[6]).toBe("otro-programa");
  });

  it("aplana los desafíos en una sola celda", () => {
    expect(leadToSheetRow(lead())[10]).toBe("Motivar al equipo · Cerrar más ventas");
  });

  it("convierte los nulos en celdas vacías, no en 'null'", () => {
    const row = leadToSheetRow(
      lead({ role: null, company: null, message: null, desafios: null, utm_source: null }),
    );
    expect(row).not.toContain(null);
    expect(row[4]).toBe("");
    expect(row[10]).toBe("");
  });
});

describe("buildLeadsSheet", () => {
  it("pone los encabezados en la primera fila", () => {
    const sheet = buildLeadsSheet([lead()]);
    expect(sheet[0]).toEqual([...LEAD_EXPORT_HEADERS]);
    expect(sheet).toHaveLength(2);
  });

  it("sin leads deja solo los encabezados", () => {
    expect(buildLeadsSheet([])).toEqual([[...LEAD_EXPORT_HEADERS]]);
  });

  it("declara un ancho por columna", () => {
    expect(LEAD_EXPORT_WIDTHS).toHaveLength(LEAD_EXPORT_HEADERS.length);
  });
});

describe("leadsFileName", () => {
  it("incluye el filtro activo para que dos descargas no se pisen", () => {
    expect(leadsFileName("liderazgo", new Date("2026-08-26T19:31:00Z"))).toBe(
      "leads-liderazgo-2026-08-26.xlsx",
    );
  });

  it("omite el sufijo cuando se bajan todos", () => {
    expect(leadsFileName("todos", new Date("2026-08-26T19:31:00Z"))).toBe("leads-2026-08-26.xlsx");
  });

  it("fecha el archivo en Chile y no en UTC", () => {
    // 02:30 UTC del 27 es todavía el 26 en Chile.
    expect(leadsFileName("todos", new Date("2026-08-27T02:30:00Z"))).toBe("leads-2026-08-26.xlsx");
  });
});
