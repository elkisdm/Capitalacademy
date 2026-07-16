#!/usr/bin/env node
// Dry-run de reconciliación de pagos Flow (M10). SOLO LECTURA: no escribe nada
// en la base de datos ni cambia estado en Flow. Reporta qué HARÍA el cron
// (app/api/cron/flow-reconcile/route.ts) si corriera ahora mismo, sin la
// ventana temporal (para poder revisar también los huérfanos históricos).
//
// Uso: node scripts/reconcile-dry-run.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(join(__dirname, "..", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) {
        env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* sin .env: cae a process.env */
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const FLOW_API_KEY = env.FLOW_API_KEY;
const FLOW_SECRET_KEY = env.FLOW_SECRET_KEY;
const FLOW_API_BASE = env.FLOW_API_BASE ?? "https://www.flow.cl/api";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
  console.error("Faltan FLOW_API_KEY / FLOW_SECRET_KEY.");
  process.exit(1);
}

function signFlowParams(params, secretKey) {
  const clean = {};
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    clean[key] = String(value);
  }
  const sortedKeys = Object.keys(clean).sort();
  const toSign = sortedKeys.map((k) => `${k}${clean[k]}`).join("");
  const signature = crypto.createHmac("sha256", secretKey).update(toSign).digest("hex");
  return { signature, clean };
}

async function getStatusByCommerceId(commerceId) {
  const { signature, clean } = signFlowParams(
    { apiKey: FLOW_API_KEY, commerceId },
    FLOW_SECRET_KEY,
  );
  const qs = new URLSearchParams({ ...clean, s: signature }).toString();
  const res = await fetch(`${FLOW_API_BASE}/payment/getStatusByCommerceId?${qs}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

async function getStatus(token) {
  const { signature, clean } = signFlowParams({ apiKey: FLOW_API_KEY, token }, FLOW_SECRET_KEY);
  const qs = new URLSearchParams({ ...clean, s: signature }).toString();
  const res = await fetch(`${FLOW_API_BASE}/payment/getStatus?${qs}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: await res.json() };
}

function mapFlowStatus(code) {
  switch (code) {
    case 2:
      return "succeeded";
    case 3:
      return "failed";
    case 4:
      return "refunded";
    default:
      return "pending";
  }
}

// Misma query que el cron (app/api/cron/flow-reconcile/route.ts), SIN ventana
// temporal: queremos ver también los huérfanos viejos (fuera de los 30 días
// que el cron real ignora a propósito).
const cols = [
  "id",
  "email",
  "firstname",
  "lastname",
  "amount_clp",
  "created_at",
  "flow_token",
  "commerce_order",
].join(",");

const listRes = await fetch(
  `${SUPABASE_URL}/rest/v1/payments?select=${cols}&status=eq.pending&provider=eq.flow&order=created_at.asc`,
  {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  },
);

if (!listRes.ok) {
  console.error("Error consultando payments:", listRes.status, await listRes.text());
  process.exit(1);
}

const candidates = await listRes.json();
console.log(`Candidatos pending/flow: ${candidates.length}\n`);

let wouldRecover = 0;
let wouldClose = 0;
let stillPending = 0;
let queryErrors = 0;

for (const p of candidates) {
  const result = p.commerce_order
    ? await getStatusByCommerceId(p.commerce_order)
    : p.flow_token
      ? await getStatus(p.flow_token)
      : null;

  if (!result) {
    console.log(`  [SIN LLAVE] ${p.id} ${p.email} — sin flow_token ni commerce_order, no reconciliable.`);
    continue;
  }
  if (!result.ok) {
    queryErrors++;
    console.log(`  [ERROR ${result.status}] ${p.id} ${p.email}`);
    continue;
  }

  const mapped = mapFlowStatus(result.data.status);
  if (mapped === "pending") {
    stillPending++;
    continue; // abandono real, no lo listamos (sería la mayoría)
  }

  if (mapped === "succeeded") {
    wouldRecover++;
    console.log(
      `  [RECUPERARÍA] ${p.id} ${p.email} — $${p.amount_clp} — creado ${p.created_at} — flowOrder=${result.data.flowOrder}`,
    );
  } else {
    wouldClose++;
    console.log(`  [CERRARÍA:${mapped}] ${p.id} ${p.email} — $${p.amount_clp}`);
  }
}

console.log("\n--- Resumen (dry-run, nada se escribió) ---");
console.log(`Aún pendientes en Flow (abandono):     ${stillPending}`);
console.log(`El cron RECUPERARÍA (status=2):        ${wouldRecover}`);
console.log(`El cron CERRARÍA (rechazado/anulado):  ${wouldClose}`);
console.log(`Errores de consulta a Flow:            ${queryErrors}`);
