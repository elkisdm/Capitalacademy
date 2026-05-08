#!/usr/bin/env node
/**
 * Genera imágenes brand-aligned con Recraft V4 Pro (Replicate).
 *
 * Recraft V4 Pro es lo mejor en taste de diseño + control de paleta +
 * estilo vector flat. Perfecto para replicar el manual gráfico de
 * Capital Academy.
 *
 * Uso:
 *   node scripts/generate-brand-images.mjs           # genera todas
 *   node scripts/generate-brand-images.mjs cierre    # genera solo "cierre"
 *
 * Output: public/imagery/{name}.png
 *
 * Requiere REPLICATE_API_TOKEN en .env
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public/imagery");

// --- cargar .env mínimal ---
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

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error("✘ REPLICATE_API_TOKEN no está en .env");
  process.exit(1);
}

// --- Style anchor compartido para consistencia ---
const STYLE = `
Premium editorial poster composition. Geometric abstract artwork.
Strict brand palette only: deep violet 5E17EB, lime green C5F122,
navy blue 2A3287, lavender D2B3F8, off-white F3F3F3 background.
NO text, NO logos, NO words, NO letters, NO numbers, NO people, NO faces.
Pure flat geometric shapes — circles, semicircles, arcs, organic
flowing wavy lines, smooth bold curves. Generous negative space, crisp
edges. Swiss design + contemporary editorial branding aesthetic.
Confident, modern, calm, professional. Magazine cover quality.
`.replace(/\s+/g, " ").trim();

// --- Prompts por imagen ---
const PROMPTS = {
  queEs: {
    size: "4:5",
    prompt: `${STYLE}
Concept: a school of business taking shape. A large half-circle in
deep violet on the right intersecting a smaller lime green full circle.
A delicate organic wavy line passes through them representing learning
trajectory. Soft lavender accents. The composition feels like a
knowledge ecosystem opening up.`,
  },
  programaDiplomado: {
    size: "16:9",
    prompt: `${STYLE}
Concept: ascending growth and sales mastery. A bold lime green
ascending stair-stepped column rising diagonally from bottom-left to
top-right, intersected by a deep violet semicircle on the right and
a small navy circle. Off-white background. Conveys upward commercial
momentum, professionalization, confidence.`,
  },
  programaLiderazgo: {
    size: "16:9",
    prompt: `${STYLE}
Concept: a leader at the center, the team around. Concentric circles —
solid deep violet inner core, lavender middle ring, thin violet outer
ring outline — perfectly centered on the right side. A few smaller lime
accent dots float around at varying distances. Suggests gravity,
leadership, structured teams.`,
  },
  programaRuta: {
    size: "16:9",
    prompt: `${STYLE}
Concept: a new professional path. A small navy dot on the left connects
through a flowing organic wavy line traveling horizontally across the
canvas, ending in a large lime green circle on the right. Subtle
lavender shape blocks. The waveline pattern explicitly replicates a
trajectory metaphor from a brand graphic manual. Conveys movement,
reinvention, possibility.`,
  },
  porQueElegir: {
    size: "4:5",
    prompt: `${STYLE}
Concept: a higher professional standard. Vertical composition: a large
deep violet half-circle on the left and a smaller lime green circle
floating on the upper right intersecting it. A clean horizontal navy
line crosses the lower third. Lavender accent shapes. Background
off-white. Architectural, premium, certain.`,
  },
  cierre: {
    size: "1:1",
    prompt: `${STYLE}
Concept: a community of learners as a constellation. Multiple circles
of varying sizes (deep violet, lime green, lavender, navy) connected
by thin curving lines forming a network. Some intersect, some stand
alone but linked. Off-white background. Warm, inviting, structured —
like a constellation of professionals in motion.`,
  },
  detalleDiplomado: {
    size: "4:5",
    prompt: `${STYLE}
Concept: KPIs and measurable growth. Vertical composition with a large
lime green ascending stepped column on the right, a deep violet
half-circle on the left. Thin diagonal navy lines suggest data trends
rising. Off-white background. Reads measurable, applied, professional
sales discipline.`,
  },
  detalleLiderazgo: {
    size: "4:5",
    prompt: `${STYLE}
Concept: structure and team architecture. Vertical composition with
stacked deep violet circles of decreasing size from bottom to top
forming a tower silhouette, beside a single lavender semicircle arching
outward. Subtle lime accent dot. Solid hierarchical intentional
leadership.`,
  },
  detalleRuta: {
    size: "4:5",
    prompt: `${STYLE}
Concept: a new horizon, a new chapter. A large lavender arc spans the
top of the canvas like an opening doorway. Below, a winding organic
line travels from the center toward a lime green circle at the
bottom-right edge — a path forward. Soft navy line accents. Calm,
optimistic, deliberately new.`,
  },
};

const MODEL = "black-forest-labs/flux-1.1-pro-ultra";

async function generate(name, { prompt, size }) {
  console.log(`→ ${name} (${size})`);
  const start = Date.now();

  // 1) Crear prediction con retry on 429.
  let createRes;
  for (let attempt = 0; attempt < 6; attempt++) {
    createRes = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: size,
          output_format: "png",
          raw: false,
          safety_tolerance: 2,
        },
      }),
    });
    if (createRes.status !== 429) break;
    const ra = parseInt(createRes.headers.get("retry-after") ?? "15", 10);
    console.log(`  ⏳ rate-limited, esperando ${ra}s...`);
    await new Promise((r) => setTimeout(r, (ra + 1) * 1000));
  }

  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Replicate ${createRes.status}: ${txt.slice(0, 500)}`);
  }

  let json = await createRes.json();

  // 2) Si todavía no está, polleo cada 2s hasta 4 min total.
  const deadline = Date.now() + 240_000;
  while (
    json.status !== "succeeded" &&
    json.status !== "failed" &&
    json.status !== "canceled" &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(json.urls.get, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!pollRes.ok) throw new Error(`Poll ${pollRes.status}`);
    json = await pollRes.json();
  }

  if (json.status !== "succeeded") {
    throw new Error(`Prediction ${json.status}: ${json.error ?? "timeout"}`);
  }

  const url = Array.isArray(json.output) ? json.output[0] : json.output;
  if (!url || typeof url !== "string") {
    throw new Error(`No output URL`);
  }

  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Image download ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  const outPath = resolve(OUT_DIR, `${name}.png`);
  writeFileSync(outPath, buf);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ✓ ${outPath} (${(buf.length / 1024).toFixed(0)} KB · ${elapsed}s)`);
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const arg = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = arg.length ? arg : Object.keys(PROMPTS);

  console.log(`Modelo: ${MODEL}`);
  console.log(`Generando ${targets.length} imagen(es)...\n`);

  for (const name of targets) {
    if (!PROMPTS[name]) {
      console.warn(`⚠ skip ${name} — not in PROMPTS catalog`);
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
