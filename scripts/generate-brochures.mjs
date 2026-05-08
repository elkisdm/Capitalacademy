#!/usr/bin/env node
/**
 * Genera brochures brand-aligned por programa con gpt-image-2.
 * Inspirado en Glomacs / Petro Knowledge: foto + branding visible +
 * título grande + copy + CTA + datos clave.
 *
 * Por programa hay 2 variantes:
 *   - {id}Card  → 16:9 landscape, compacto, va en Programas.tsx
 *   - {id}Hero  → 4:5 portrait, expandido, va en DetalleProgramas.tsx
 *
 * Uso:
 *   node scripts/generate-brochures.mjs                       # 6 archivos
 *   node scripts/generate-brochures.mjs programaDiplomadoCard # solo uno
 *
 * Requiere OPENAI_API_KEY + organización verificada.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/imagery");

// --- cargar .env ---
const envPath = resolve(ROOT, ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("✘ OPENAI_API_KEY missing");
  process.exit(1);
}

// --- Brand style anchor común ---
const BRAND = `
EXACT brand palette: deep violet #5E17EB, lime green #C5F122, navy
#2A3287, lavender #D2B3F8, off-white #F3F3F3 background. Modern
editorial brochure design. Clean Swiss-style geometric layout. The
brochure must include a small "Capital Academy" wordmark at the top
left in deep violet (typeset, NOT a logo image — sans-serif clean
typography). Geometric accents: a violet semi-circle and a lime green
small circle as decorative elements. NO additional logos. NO
watermarks. High-end editorial design like a 2025 European business
school recruiting brochure.
`.replace(/\s+/g, " ").trim();

// Para cada programa, definimos la información exacta que debe aparecer
const PROGRAMS = {
  diplomado: {
    tag: "DIPLOMADO",
    title: "Ventas y Asesoría Inmobiliaria",
    subtitle: "Formación ejecutiva para vender mejor y asesorar con criterio",
    photoConcept:
      "a real estate broker (early 40s, professional smart-casual attire) showing a modern apartment to a couple, mid-explanation, sunlight, candid editorial",
  },
  liderazgo: {
    tag: "PROGRAMA",
    title: "Liderazgo y Gestión de Equipos Comerciales",
    subtitle: "Construye, lidera y sostiene equipos a la altura de grandes metas",
    photoConcept:
      "a team leader at the head of a modern meeting room facilitating a small group of 4 sales executives, hand mid-gesture, attentive team, candid editorial",
  },
  ruta: {
    tag: "PROGRAMA",
    title: "Ruta Inmobiliaria",
    subtitle: "Un nuevo camino profesional con respaldo y visión de negocio",
    photoConcept:
      "a confident professional in their 30s walking through a sunlit modern office hallway with floor-to-ceiling windows, holding a laptop bag, intentional stride, candid editorial",
  },
};

const PROMPTS = {};

for (const [id, p] of Object.entries(PROGRAMS)) {
  // CARD variant — 16:9 landscape, compacto
  PROMPTS[`programa${capitalize(id)}Card`] = {
    size: "1536x1024",
    prompt: `${BRAND}

Format: 16:9 landscape brochure card.

Layout:
- Top left: small "Capital Academy" wordmark in deep violet sans-serif typography.
- Top right: a colored geometric flag/banner (lime green for diplomado, violet for liderazgo, lavender for ruta) cutting diagonally into the corner.
- Right half (~55%): a photograph of ${p.photoConcept}. The photo is cropped inside an organic blob shape with smooth curves (NOT rectangular).
- Left half: the title "${p.title}" rendered in BOLD black sans-serif typography (the title MUST be readable and correctly spelled). Above it, a small uppercase tag label "${p.tag}" in deep violet. Below the title, a thin lime green divider line.
- Bottom left: a small uppercase "VER PROGRAMA →" call-to-action chip in deep violet outline.
- The whole composition is on an off-white background with subtle violet/lavender geometric accents.

The text in the brochure must read EXACTLY: "Capital Academy", "${p.tag}", "${p.title}", "VER PROGRAMA". Spell it correctly.`,
  };

  // HERO variant — 4:5 portrait, expandido
  PROMPTS[`programa${capitalize(id)}Hero`] = {
    size: "1024x1536",
    prompt: `${BRAND}

Format: 4:5 portrait brochure hero.

Layout:
- Top left: small "Capital Academy" wordmark in deep violet sans-serif typography.
- Top right: a colored geometric flag/banner (lime green for diplomado, violet for liderazgo, lavender for ruta) cutting diagonally into the upper-right corner with a small white circular icon overlapping it.
- Upper third: a small uppercase tag "${p.tag}" in deep violet, then the title "${p.title}" in HUGE bold black sans-serif typography occupying multiple lines. The title must be perfectly spelled and readable. Below the title, the subtitle "${p.subtitle}" in deep violet medium-weight italic.
- Middle: a photograph of ${p.photoConcept}, cropped inside an organic blob shape with smooth curves (NOT rectangular). The blob is positioned center-right.
- Lower third: a thin lime green divider line, then 3 short bullet points in dark navy: "16 SEMANAS · ONLINE EN VIVO", "DIPLOMA CERTIFICADO", "CUPOS LIMITADOS". Each bullet has a small lime green dot.
- Bottom: a violet pill button with white text "SOLICITAR INFORMACIÓN".
- Off-white background with subtle violet/lavender geometric circle accents.

The text in the brochure must read EXACTLY: "Capital Academy", "${p.tag}", "${p.title}", "${p.subtitle}", "16 SEMANAS · ONLINE EN VIVO", "DIPLOMA CERTIFICADO", "CUPOS LIMITADOS", "SOLICITAR INFORMACIÓN". Spell every word correctly.`,
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MODEL = "gpt-image-2";

async function generate(name, { prompt, size }) {
  console.log(`→ ${name} (${size})`);
  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size, quality: "high" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 600)}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json");
  const buf = Buffer.from(b64, "base64");
  const outPath = resolve(OUT_DIR, `${name}.png`);
  writeFileSync(outPath, buf);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ ${outPath} (${(buf.length / 1024).toFixed(0)} KB · ${elapsed}s)`);
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const arg = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = arg.length ? arg : Object.keys(PROMPTS);
  console.log(`Modelo: ${MODEL}\nGenerando ${targets.length} brochure(s)...\n`);
  for (const name of targets) {
    if (!PROMPTS[name]) {
      console.warn(`⚠ skip ${name}`);
      continue;
    }
    try {
      await generate(name, PROMPTS[name]);
    } catch (err) {
      console.error(`✘ ${name}:`, err.message);
    }
  }
  console.log("\n✓ done");
}

main().catch((e) => { console.error(e); process.exit(1); });
