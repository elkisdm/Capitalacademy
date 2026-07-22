/**
 * Genera la guía del profesor en PDF a partir de `articlesByAudience("teacher")`.
 * Fuente única: no existe copia del texto ni PDF versionado — si se edita un
 * artículo de `articles/teacher.tsx`, la próxima descarga ya sale distinta.
 *
 * `pdf-lib` con `StandardFonts` (sin `fontkit`, sin leer archivos del repo):
 * a diferencia de `lib/certificates/generate-pdf.ts` (que hace `readFile` de
 * un `.ttf` del repo), aquí la fuente va incrustada en el estándar PDF y no
 * hay ningún archivo que trace o falte en la función de Netlify.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Article } from "./types";
import { TEACHER_CATEGORIES } from "./categories";
import { formatChile } from "@/lib/time";

const INK = rgb(0.078, 0.086, 0.227); // #14163A
const VIOLET = rgb(0.369, 0.09, 0.922); // #5E17EB
const GRAY = rgb(0.239, 0.259, 0.4); // #3D4266
const WHITE = rgb(1, 1, 1);

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * Helvetica (StandardFonts) usa WinAnsiEncoding: `drawText` lanza excepción
 * ante cualquier carácter fuera de ese set. Se normalizan los signos
 * tipográficos conocidos y se descarta el resto, para que un emoji agregado
 * a futuro en un artículo NO rompa la descarga de la guía.
 */
function toWinAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E¡-ÿ]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildGuidePdf(articles: Article[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage;
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 0;

  function drawFooter(p: PDFPage) {
    pageNum += 1;
    const label = String(pageNum);
    p.drawText("capitalacademy.cl", { x: MARGIN, y: MARGIN - 28, size: 8, font: regular, color: GRAY });
    const w = regular.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: PAGE_WIDTH - MARGIN - w, y: MARGIN - 28, size: 8, font: regular, color: GRAY });
  }

  function newPage(): PDFPage {
    const p = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawFooter(p);
    y = PAGE_HEIGHT - MARGIN;
    return p;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 40) page = newPage();
  }

  function drawWrapped(
    text: string,
    opts: { font: PDFFont; size: number; color: ReturnType<typeof rgb>; lineHeight: number; x?: number; maxWidth?: number },
  ) {
    const x = opts.x ?? MARGIN;
    const lines = wrapText(text, opts.font, opts.size, opts.maxWidth ?? TEXT_WIDTH - (x - MARGIN));
    for (const line of lines) {
      ensureSpace(opts.lineHeight);
      page.drawText(line, { x, y, size: opts.size, font: opts.font, color: opts.color });
      y -= opts.lineHeight;
    }
  }

  // --- Portada (sin footer, sin numerar) -----------------------------------
  page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: INK });
  page.drawCircle({ x: PAGE_WIDTH - 90, y: PAGE_HEIGHT - 90, size: 130, color: VIOLET, opacity: 0.35 });
  page.drawText("CAPITAL ACADEMY", { x: MARGIN, y: PAGE_HEIGHT - 150, size: 12, font: bold, color: WHITE });
  page.drawText("Guía del profesor", { x: MARGIN, y: PAGE_HEIGHT - 210, size: 34, font: bold, color: WHITE });
  page.drawText("Centro de ayuda de Capital Academy", {
    x: MARGIN,
    y: PAGE_HEIGHT - 236,
    size: 13,
    font: regular,
    color: rgb(0.82, 0.78, 0.98),
  });
  const generatedAt = `Generada el ${formatChile(new Date().toISOString(), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}`;
  page.drawText(generatedAt, { x: MARGIN, y: MARGIN, size: 10, font: regular, color: rgb(0.82, 0.78, 0.98) });

  // Orden compartido entre índice y artículos: por categoría del profesor.
  const ordered = TEACHER_CATEGORIES.flatMap((cat) => articles.filter((a) => a.category === cat));

  // --- Índice ---------------------------------------------------------------
  page = newPage();
  page.drawText("Índice", { x: MARGIN, y, size: 22, font: bold, color: INK });
  y -= 36;
  let n = 0;
  for (const cat of TEACHER_CATEGORIES) {
    const items = ordered.filter((a) => a.category === cat);
    if (items.length === 0) continue;
    ensureSpace(20);
    page.drawText(toWinAnsi(cat), { x: MARGIN, y, size: 12, font: bold, color: VIOLET });
    y -= 18;
    for (const a of items) {
      n += 1;
      ensureSpace(16);
      page.drawText(`${n}. ${toWinAnsi(a.title)}`, { x: MARGIN, y, size: 10.5, font: regular, color: INK });
      y -= 16;
    }
    y -= 10;
  }

  // --- Un artículo por página -------------------------------------------------
  for (const article of ordered) {
    page = newPage();

    page.drawText(toWinAnsi(article.category).toUpperCase(), {
      x: MARGIN,
      y,
      size: 8,
      font: bold,
      color: VIOLET,
    });
    y -= 22;

    drawWrapped(article.title, { font: bold, size: 16, color: INK, lineHeight: 20 });
    y -= 8;

    drawWrapped(article.overview, { font: regular, size: 10.5, color: INK, lineHeight: 15 });
    y -= 12;

    if (article.steps.length > 0) {
      ensureSpace(16);
      page.drawText("Paso a paso", { x: MARGIN, y, size: 11, font: bold, color: INK });
      y -= 18;
      article.steps.forEach((step, i) => {
        const prefix = `${i + 1}. `;
        const indent = bold.widthOfTextAtSize(prefix, 10.5);
        const lines = wrapText(step, regular, 10.5, TEXT_WIDTH - indent);
        lines.forEach((line, li) => {
          ensureSpace(15);
          if (li === 0) page.drawText(prefix, { x: MARGIN, y, size: 10.5, font: bold, color: INK });
          page.drawText(line, { x: MARGIN + indent, y, size: 10.5, font: regular, color: INK });
          y -= 15;
        });
      });
      y -= 6;
    }

    if (article.tips && article.tips.length > 0) {
      ensureSpace(16);
      page.drawText("Buenos a saber", { x: MARGIN, y, size: 11, font: bold, color: INK });
      y -= 18;
      for (const tip of article.tips) {
        const indent = regular.widthOfTextAtSize("- ", 10.5);
        const lines = wrapText(tip, regular, 10.5, TEXT_WIDTH - indent);
        lines.forEach((line, li) => {
          ensureSpace(15);
          if (li === 0) page.drawText("-", { x: MARGIN, y, size: 10.5, font: regular, color: GRAY });
          page.drawText(line, { x: MARGIN + indent, y, size: 10.5, font: regular, color: GRAY });
          y -= 15;
        });
      }
      y -= 6;
    }

    if (article.faqs && article.faqs.length > 0) {
      ensureSpace(16);
      page.drawText("Preguntas frecuentes", { x: MARGIN, y, size: 11, font: bold, color: INK });
      y -= 18;
      for (const faq of article.faqs) {
        drawWrapped(faq.q, { font: bold, size: 10.5, color: INK, lineHeight: 15 });
        drawWrapped(faq.a, { font: regular, size: 10.5, color: GRAY, lineHeight: 15 });
        y -= 8;
      }
    }
  }

  return doc.save();
}
