/**
 * Borra de auth.users las cuentas de QA que la migración 0104 sacó de
 * public.profiles.
 *
 * Por qué existe este script y no va dentro de la migración: `public.profiles`
 * NO tiene FK hacia `auth.users` (verificado el 2026-08-26). Borrar el perfil
 * deja la cuenta de login viva y huérfana — capaz de autenticarse sin tener
 * perfil, que es justo el estado que rompe el aula. El borrado de auth va por
 * la Admin API, no por SQL.
 *
 * Corre en seco por defecto. Para borrar de verdad:
 *   node scripts/borrar-cuentas-qa.mjs --confirmar
 *
 * ADR-0037 · spec docs/specs/cuentas-internas-y-alerta-recurrente.md
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// La MISMA lista literal de la migración 0104, a propósito: si alguien agrega
// una cuenta allá y no acá, el script no la borra y queda huérfana — es
// preferible a un patrón que un día barra una cuenta real.
const CUENTAS_QA = [
  "ana.validate.qa@test.local",
  "carlos.validate.qa@test.local",
  "diego.validate.qa@test.local",
  "maria.import.qa@test.local",
  "pedro.import.qa@test.local",
  "sofia.import.qa@test.local",
  "onboarding.test@ejemplo.cl",
  "qa.audit3.unique@test.local",
  "qa.audit4.unique@test.local",
  "qa.auditor.unique@test.local",
  "reg.test.two.qa@test.local",
];

const confirmar = process.argv.includes("--confirmar");

// La Admin API no busca por email, así que se pagina y se cruza en memoria.
const porEmail = new Map();
for (let page = 1; page <= 200; page++) {
  const res = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
  if (!res.ok) {
    console.error(`Error listando usuarios (página ${page}): ${res.status}`);
    process.exit(1);
  }
  const { users } = await res.json();
  if (!users.length) break;
  for (const u of users) if (u.email) porEmail.set(u.email.toLowerCase(), u.id);
}

const encontradas = [];
const ausentes = [];
for (const email of CUENTAS_QA) {
  const id = porEmail.get(email.toLowerCase());
  if (id) encontradas.push({ email, id });
  else ausentes.push(email);
}

console.log(`Cuentas de QA en auth.users: ${encontradas.length} de ${CUENTAS_QA.length}`);
for (const { email, id } of encontradas) console.log(`  - ${email} (${id})`);
if (ausentes.length) {
  console.log(`Ya no estaban (nada que hacer): ${ausentes.length}`);
  for (const email of ausentes) console.log(`  - ${email}`);
}

// Guardia: si aparece una cuenta que NO está en la lista literal, algo cambió
// bajo los pies. Preferimos abortar antes que borrar de más.
const inesperadas = encontradas.filter((c) => !CUENTAS_QA.includes(c.email));
if (inesperadas.length) {
  console.error("ABORTA: cuentas fuera de la lista literal", inesperadas);
  process.exit(1);
}

if (!confirmar) {
  console.log("\nCorrida en seco. Nada se borró. Repite con --confirmar para ejecutar.");
  process.exit(0);
}

let borradas = 0;
for (const { email, id } of encontradas) {
  const res = await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H });
  if (res.ok) {
    borradas++;
    console.log(`borrada ${email}`);
  } else {
    console.error(`FALLÓ ${email}: ${res.status} ${await res.text()}`);
  }
}
console.log(`\nListo: ${borradas} de ${encontradas.length} cuentas borradas de auth.users.`);
