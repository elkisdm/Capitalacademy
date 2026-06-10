#!/usr/bin/env node
// Genera un enlace de cobro firmado para la página /pago/cobro.
// Uso: node scripts/generate-cobro-link.mjs <monto-clp> [baseUrl]
//   node scripts/generate-cobro-link.mjs 200000
//   node scripts/generate-cobro-link.mjs 200000 https://capitalacademy.cl
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadSecret() {
  if (process.env.COBRO_SIGNING_SECRET?.trim()) {
    return process.env.COBRO_SIGNING_SECRET.trim();
  }
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const match = env.match(/^COBRO_SIGNING_SECRET=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* sin .env: cae al error de abajo */
  }
  return null;
}

const amount = Number(process.argv[2]);
const baseUrl = (
  process.argv[3] ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://capitalacademy.cl"
).replace(/\/$/, "");

if (!Number.isInteger(amount) || amount <= 0) {
  console.error("Uso: node scripts/generate-cobro-link.mjs <monto-clp> [baseUrl]");
  process.exit(1);
}

const secret = loadSecret();
if (!secret || secret.length < 16) {
  console.error(
    "Falta COBRO_SIGNING_SECRET (en el entorno o en .env, mín. 16 chars).",
  );
  process.exit(1);
}

const sig = crypto
  .createHmac("sha256", secret)
  .update(String(amount))
  .digest("hex");

console.log(`${baseUrl}/pago/cobro?monto=${amount}&sig=${sig}`);
