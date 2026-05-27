// Genera un PDF de certificado personalizado superponiendo el nombre del
// estudiante sobre la plantilla PNG configurada en certificate_templates.
//
// Ported from encuentrosmart/scripts/lib/certificate-pdf.mts — generalizado
// para aceptar configuración dinámica desde la tabla certificate_templates.

import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// ---------------------------------------------------------------------------
// Config interface — maps to certificate_templates table columns
// ---------------------------------------------------------------------------

export interface CertificateConfig {
  templatePngPath: string; // local file path OR http(s) URL (Supabase Storage)
  fontPath: string; // local file path to .ttf/.otf
  nameCenterX: number;
  nameBaselineY: number;
  defaultFontSize: number;
  minFontSize: number;
  maxNameWidth: number;
  nameColorHex: string; // e.g. "#000000"
}

// ---------------------------------------------------------------------------
// Name normalizer
// ---------------------------------------------------------------------------

// Capitaliza un nombre respetando conectores ("de", "del", "la", "von"...).
// "martin travella" → "Martin Travella"
// "Rosicela del Valle Fernandez" → "Rosicela del Valle Fernandez"
// Idempotente: si ya viene capitalizado, no rompe acentos ni mayúsculas.
const CONNECTORS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "da",
  "do",
  "dos",
  "das",
  "von",
  "van",
  "della",
  "di",
  "le",
]);

export function normalizeName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && CONNECTORS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Hex color parser
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

// ---------------------------------------------------------------------------
// Template loader — supports local paths and HTTP URLs
// ---------------------------------------------------------------------------

async function loadTemplateBytes(path: string): Promise<Uint8Array> {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`Failed to fetch template: ${res.status} ${res.statusText}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  return await readFile(path);
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

export async function generateCertificatePdf(
  fullName: string,
  config: CertificateConfig,
): Promise<Uint8Array> {
  const templateBytes = await loadTemplateBytes(config.templatePngPath);
  const fontBytes = await readFile(config.fontPath);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const embeddedFont = await pdfDoc.embedFont(fontBytes, { subset: false });
  const pngImage = await pdfDoc.embedPng(templateBytes);

  const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pngImage.width,
    height: pngImage.height,
  });

  const name = normalizeName(fullName);
  if (!name) throw new Error("fullName vacío");

  let fontSize = config.defaultFontSize;
  let textWidth = embeddedFont.widthOfTextAtSize(name, fontSize);
  while (textWidth > config.maxNameWidth && fontSize > config.minFontSize) {
    fontSize -= 4;
    textWidth = embeddedFont.widthOfTextAtSize(name, fontSize);
  }

  const { r, g, b } = hexToRgb(config.nameColorHex);

  page.drawText(name, {
    x: config.nameCenterX - textWidth / 2,
    y: config.nameBaselineY,
    size: fontSize,
    font: embeddedFont,
    color: rgb(r, g, b),
  });

  return await pdfDoc.save();
}
