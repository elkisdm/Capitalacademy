#!/usr/bin/env node
/**
 * Genera mockups de productos físicos (diplomas) con gpt-image-2.
 *
 * Reemplaza las cards abstractas de programas por diplomas certificados
 * — el producto tangible que el alumno se lleva.
 *
 * Uso:
 *   node scripts/generate-mockups.mjs                 # genera todos
 *   node scripts/generate-mockups.mjs programaRuta    # solo uno
 *
 * Output: public/imagery/{name}.png (sobreescribe)
 *
 * Requiere OPENAI_API_KEY + organización verificada para gpt-image-2.
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

const STYLE = `
Premium product photography mockup. Top-down or 3/4 angle of a high-end
academic diploma certificate on a clean modern surface. Cotton paper
texture with subtle embossed seal, matte finish, fine typography
hierarchy. Soft directional natural light from upper-left, shallow
depth of field. Subtle violet/lavender ambient bokeh in background.
A clean color palette dominated by off-white paper with deep violet
ink details and a small lime-green accent (ribbon, foil seal, or
stamp). Includes the visible brand mark "Capital Academy" elegantly
typeset on the diploma. NO additional logos. NO photographic of people.
Editorial product shot, high-end luxury stationery brand aesthetic
(like a Moleskine or Rhodia campaign). Magazine-cover quality.
`.replace(/\s+/g, " ").trim();

const PROMPTS = {
  programaDiplomado: {
    size: "1536x1024",
    prompt: `${STYLE}
Concept: a Diploma in "Ventas y Asesoría Inmobiliaria" issued by
Capital Academy. The diploma is the hero of the shot, slightly tilted
on a desk. Beside it, a thin lime green silk ribbon and a small dark
violet wax-like stamp. Spanish-language text on the diploma includes
the words "Diploma" and "Capital Academy". Ambient: a corner of a
notebook visible blurred in the background.`,
  },
  programaLiderazgo: {
    size: "1536x1024",
    prompt: `${STYLE}
Concept: a Diploma in "Liderazgo y Gestión de Equipos Comerciales"
issued by Capital Academy. The diploma rests on a deep navy leather
desk pad, slight 3/4 angle, with a violet ribbon detail. A subtle
embossed circular seal in the bottom corner. Spanish-language text on
the diploma includes "Programa" and "Capital Academy". Mood: serious,
authoritative, leadership-grade.`,
  },
  programaRuta: {
    size: "1536x1024",
    prompt: `${STYLE}
Concept: a Diploma in "Ruta Inmobiliaria" issued by Capital Academy.
The diploma is photographed mid-flat-lay on a soft lavender-toned
neutral surface, accompanied by a small lime-green geometric paperweight
shape and a discrete dark violet pen. Spanish-language text on the
diploma includes "Programa" and "Capital Academy". Mood: a new
beginning, fresh chapter, optimistic.`,
  },
};

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
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 500)}`);
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
  console.log(`Modelo: ${MODEL}\nGenerando ${targets.length} mockup(s)...\n`);
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
