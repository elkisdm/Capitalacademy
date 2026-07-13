import { z } from "zod";
import { cleanRut, isValidRut } from "@/lib/utils/rut";

export const DOCUMENT_TYPES = ["boleta", "factura"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Datos de facturación de empresa (lista definitiva de la clienta: razón
// social, RUT, giro, dirección, correo de contacto). Todos opcionales a nivel
// de tipo; la obligatoriedad se aplica condicionalmente cuando el documento es
// factura (ver refineInvoice). rut se limpia igual que el RUT del alumno.
export const invoiceDataSchema = z.object({
  razonSocial: z.string().trim().max(160).optional(),
  rut: z.string().trim().transform((v) => cleanRut(v)).optional(),
  giro: z.string().trim().max(160).optional(),
  direccion: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().max(160).optional(),
});

export type InvoiceData = z.infer<typeof invoiceDataSchema>;

// Campos que agrega cada schema de checkout para soportar factura.
export const invoiceExtension = {
  documentType: z.enum(DOCUMENT_TYPES).default("boleta"),
  invoice: invoiceDataSchema.optional(),
};

// Refinamiento condicional reutilizable por ambos checkouts: si es factura,
// exige los campos de empresa y valida el RUT de la empresa.
export function refineInvoice(
  val: { documentType?: DocumentType; invoice?: InvoiceData },
  ctx: z.RefinementCtx,
): void {
  if (val.documentType !== "factura") return;
  const inv = val.invoice;
  const require = (key: keyof InvoiceData, ok: boolean, message: string) => {
    if (!ok) ctx.addIssue({ code: "custom", path: ["invoice", key], message });
  };
  require("razonSocial", !!inv?.razonSocial && inv.razonSocial.length >= 2, "Razón social requerida");
  require("rut", !!inv?.rut && isValidRut(inv.rut), "RUT de empresa inválido");
  require("giro", !!inv?.giro && inv.giro.length >= 2, "Giro requerido");
  require("direccion", !!inv?.direccion && inv.direccion.length >= 2, "Dirección requerida");
  require("email", !!inv?.email && z.string().email().safeParse(inv.email).success, "Correo de contacto inválido");
}
