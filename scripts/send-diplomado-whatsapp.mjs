/**
 * Envío masivo de la plantilla MARKETING `diplomado_4ta_gen_captacion` a la base externa
 * del Diplomado 4ª gen, vía WhatsApp Cloud API (número +56966227368, WABA Capital Inteligente).
 *
 * La plantilla debe estar APPROVED en Meta antes de correr esto
 * (ver scripts/whatsapp-submit-template.mjs --list).
 *
 * - Lee docs/marketing/telefonos-bd-externa.csv (solo filas estado=ok).
 * - Header DOCUMENT = brochure (URL pública), Body {{1}} = primer nombre.
 * - Throttle conservador (~1 msg/seg) para no gatillar antifraude.
 * - Idempotente: guarda resultados en docs/marketing/whatsapp-envio-resultados.json;
 *   re-ejecutar saltea los que ya salieron OK.
 *
 * Uso:
 *   node --env-file=.env scripts/send-diplomado-whatsapp.mjs                 # DRY-RUN (no envía)
 *   node --env-file=.env scripts/send-diplomado-whatsapp.mjs --only=+56999... # prueba a 1 número
 *   node --env-file=.env scripts/send-diplomado-whatsapp.mjs --send --limit=5 # envía solo 5 (prueba)
 *   node --env-file=.env scripts/send-diplomado-whatsapp.mjs --send           # envío real completo
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v21.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ENABLED = process.env.WHATSAPP_CLOUD_ENABLED === "true";

const TEMPLATE_NAME = "diplomado_4ta_gen_captacion";
const LANG = "es";
const BROCHURE_URL =
  "https://igatsyghbadccbrjiurl.supabase.co/storage/v1/object/public/marketing/brochure-diplomado-4ta-gen.pdf";
const BROCHURE_FILENAME = "Brochure Diplomado 4ta Generacion.pdf";

const CSV = "docs/marketing/telefonos-bd-externa.csv";
const RESULTS = "docs/marketing/whatsapp-envio-resultados.json";
const THROTTLE_MS = 1100;

// --- args ---
const args = process.argv.slice(2);
const SEND = args.includes("--send");
const limitArg = args.find((a) => a.startsWith("--limit="));
const onlyArg = args.find((a) => a.startsWith("--only="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const ONLY = onlyArg ? onlyArg.split("=")[1].trim() : null;

function parseCsv(text) {
  // CSV simple (sin comas embebidas en los campos que usamos).
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (cells[i] ?? "").trim()]));
  });
}

function firstName(nombre) {
  const t = (nombre || "").trim().split(/\s+/)[0] || "";
  // Capitaliza para que "Hola juan" → "Hola Juan".
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}

function loadResults() {
  if (existsSync(RESULTS)) {
    try {
      return JSON.parse(readFileSync(RESULTS, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function buildPayload(to, name) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: LANG },
      components: [
        {
          type: "header",
          parameters: [
            { type: "document", document: { link: BROCHURE_URL, filename: BROCHURE_FILENAME } },
          ],
        },
        { type: "body", parameters: [{ type: "text", text: name }] },
      ],
      // Los 2 botones son URL estáticas → no requieren parámetros al enviar.
    },
  };
}

async function sendOne(e164, name) {
  const to = e164.replace(/^\+/, ""); // Cloud API espera el número sin '+'
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(buildPayload(to, name)),
    });
  } catch (err) {
    return { ok: false, error: `Network: ${err?.message ?? err}` };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    return { ok: false, error: `${json.error?.code ?? res.status}: ${json.error?.message ?? "HTTP " + res.status}` };
  }
  return { ok: true, messageId: json.messages?.[0]?.id };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let rows = parseCsv(readFileSync(CSV, "utf-8")).filter((r) => r.estado === "ok");
  if (ONLY) {
    const match = rows.filter((r) => r.e164 === ONLY);
    // Si el número no está en la base (ej. un número de prueba propio), lo sintetizamos.
    rows = match.length ? match : [{ e164: ONLY, nombre: "Elkis", estado: "ok" }];
  }
  if (rows.length === 0) {
    console.error("✗ No hay filas que enviar.");
    process.exit(1);
  }

  const results = loadResults();
  const pendientes = rows.filter((r) => !(results[r.e164]?.ok));
  const yaEnviados = rows.length - pendientes.length;
  const aEnviar = pendientes.slice(0, LIMIT);

  console.log("═══ Envío WhatsApp — Diplomado 4ª gen ═══");
  console.log(`  Plantilla:    ${TEMPLATE_NAME} (${LANG})`);
  console.log(`  Emisor:       phone_number_id ${PHONE_NUMBER_ID ? "…" + PHONE_NUMBER_ID.slice(-4) : "(MISSING)"}`);
  console.log(`  Brochure:     ${BROCHURE_FILENAME}`);
  console.log(`  CSV total OK: ${rows.length}`);
  console.log(`  Ya enviados:  ${yaEnviados} (idempotencia)`);
  console.log(`  A enviar:     ${aEnviar.length}${LIMIT !== Infinity ? ` (limitado a ${LIMIT})` : ""}`);
  console.log(`  Modo:         ${SEND ? "ENVÍO REAL" : "DRY-RUN (no envía)"}`);
  console.log("─────────────────────────────────────────");

  if (!SEND) {
    for (const r of aEnviar.slice(0, 10)) {
      console.log(`  [dry] ${r.e164}  Hola ${firstName(r.nombre)}…`);
    }
    if (aEnviar.length > 10) console.log(`  … y ${aEnviar.length - 10} más`);
    console.log("\nPara enviar de verdad: agrega --send (prueba primero con --send --limit=3).");
    return;
  }

  if (!ENABLED) {
    console.error("✗ WHATSAPP_CLOUD_ENABLED != true. Aborto por seguridad.");
    process.exit(1);
  }
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.error("✗ Faltan WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID.");
    process.exit(1);
  }

  let ok = 0, fail = 0;
  for (let i = 0; i < aEnviar.length; i++) {
    const r = aEnviar[i];
    const name = firstName(r.nombre);
    const out = await sendOne(r.e164, name);
    results[r.e164] = { ...out, nombre: r.nombre, at: new Date().toISOString() };
    writeFileSync(RESULTS, JSON.stringify(results, null, 2));
    if (out.ok) {
      ok++;
      console.log(`  ✓ ${i + 1}/${aEnviar.length} ${r.e164} (${name}) → ${out.messageId?.slice(0, 18)}…`);
    } else {
      fail++;
      console.log(`  ✗ ${i + 1}/${aEnviar.length} ${r.e164} (${name}) → ${out.error}`);
    }
    if (i < aEnviar.length - 1) await sleep(THROTTLE_MS);
  }

  console.log("─────────────────────────────────────────");
  console.log(`  OK: ${ok} · Fallos: ${fail}`);
  console.log(`  Resultados en ${RESULTS}`);
}

await main();
