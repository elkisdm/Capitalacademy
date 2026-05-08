#!/usr/bin/env node
/**
 * Genera fotos editorial de personas con gpt-image-2 (OpenAI).
 *
 * Diferenciado del script de imágenes abstractas (Flux): este script
 * cubre las secciones donde el contenido es humano y la abstracción
 * se siente fría (qué es, por qué CA, comunidad, detalle de programas).
 *
 * Uso:
 *   node scripts/generate-people-photos.mjs            # genera todas
 *   node scripts/generate-people-photos.mjs cierre     # solo "cierre"
 *
 * Output: public/imagery/{name}.png
 *
 * Requiere OPENAI_API_KEY en .env
 * Requiere organización verificada para gpt-image-2.
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
  console.error("✘ OPENAI_API_KEY no está en .env");
  process.exit(1);
}

// --- Style anchor para mantener consistencia editorial entre fotos ---
const STYLE = `
Editorial professional photography, magazine cover quality, warm natural
light, shallow depth of field, modern Latin American business setting,
candid documentary style, slightly desaturated film color grading with
subtle violet/lavender highlights to harmonize with brand. Diverse
Chilean and Latin American professionals (mixed gender, mixed ages
30-55, varied ethnicities). Real corporate attire — smart-casual to
business. Modern coworking, glass office, classroom or networking event
setting. NO text overlays, NO logos, NO watermarks. Authentic, present,
confident expressions. NEVER stiff stock-photo poses. The shot should
feel real and observed, not staged.
`.replace(/\s+/g, " ").trim();

const PROMPTS = {
  queEs: {
    size: "1024x1536",
    prompt: `${STYLE}
A small group (3 people) gathered around a table in a modern bright
classroom or executive workshop. They are taking notes, leaning in,
visibly engaged in learning. Mid-shot from chest up, slight 3/4 angle.
Warm but professional atmosphere. Subtle violet accents in the
environment. Mood: focused, growing, professional.`,
  },
  porQueElegir: {
    size: "1024x1536",
    prompt: `${STYLE}
A confident professional standing in a modern, glass-walled office or
coworking space, looking off-camera with a thoughtful purposeful
expression. They are well-dressed in smart business attire. Out of
focus colleagues working in the background. Composition leaves negative
space on the right for editorial layout. Mood: standard, presence,
quiet authority.`,
  },
  cierre: {
    size: "1024x1024",
    prompt: `${STYLE}
A networking moment at a Capital Academy event: 4-5 professionals in a
loose conversational circle, two of them mid-laughter, one listening
intently. Modern event venue with soft warm lighting and out-of-focus
purple/lavender bokeh in the background. Mid-shot, slight 3/4 angle.
Mood: community, belonging, energy.`,
  },
  detalleDiplomado: {
    size: "1024x1536",
    prompt: `${STYLE}
A real estate broker (early 40s, professional attire) showing a modern
apartment to a couple. The broker is mid-explanation, gesturing toward
a window with city light. Sunlight floods the room. Composition from
slightly behind the broker, partial 3/4. Mood: professional advisory,
expertise, trust.`,
  },
  detalleLiderazgo: {
    size: "1024x1536",
    prompt: `${STYLE}
A team leader standing at the head of a modern meeting room facilitating
a small group of 4 sales executives. The leader is standing, looking
at the team with focused intent, hand mid-gesture. The team members are
seated, attentive, taking notes. Whiteboards or screens out-of-focus
behind. Mood: structured leadership, sharp execution.`,
  },
  detalleRuta: {
    size: "1024x1536",
    prompt: `${STYLE}
A professional at a turning point in their career: confidently walking
through a sunlit modern office hallway with floor-to-ceiling windows,
holding a laptop bag. Slight smile, intentional stride, looking forward.
Composition shows warmth and possibility. Mood: new beginning,
deliberate transition, optimism.`,
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
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size,
      quality: "high",
    }),
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
  console.log(`Modelo: ${MODEL}\nGenerando ${targets.length} foto(s)...\n`);
  for (const name of targets) {
    if (!PROMPTS[name]) {
      console.warn(`⚠ skip ${name} — not in catalog`);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
