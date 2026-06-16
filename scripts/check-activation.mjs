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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Admin API pagina de a 20 (50+ revienta GoTrue). Una página falla por un
// registro corrupto en auth.users -> la salto y sigo, para no perder el resto.
const PER = 10;
const MAX_PAGE = 60;
let all = [], skipped = 0, emptyStreak = 0;
for (let page = 1; page <= MAX_PAGE; page++) {
  const res = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=${PER}`, { headers: H });
  if (!res.ok) { skipped++; continue; }
  const { users } = await res.json();
  all = all.concat(users);
  if (users.length < PER) { emptyStreak++; if (emptyStreak >= 2) break; } else { emptyStreak = 0; }
}
if (skipped) console.log(`(aviso: ${skipped} página(s) de ~${PER} usuarios saltadas por registro corrupto en Auth)\n`);

const signedIn = all.filter((u) => u.last_sign_in_at);
const confirmed = all.filter((u) => u.email_confirmed_at);
const invitedNoSignin = all.filter((u) => u.invited_at && !u.last_sign_in_at);

console.log(`Total auth.users         : ${all.length}`);
console.log(`Confirmados (email)      : ${confirmed.length}`);
console.log(`ACTIVADOS (han ingresado): ${signedIn.length}`);
console.log(`Invitados sin ingresar   : ${invitedNoSignin.length}`);

const byDay = {};
for (const u of signedIn) {
  const d = u.last_sign_in_at.slice(0, 10);
  byDay[d] = (byDay[d] || 0) + 1;
}
console.log("\nIngresos por día (last_sign_in_at):");
for (const d of Object.keys(byDay).sort()) console.log(`  ${d}: ${byDay[d]}`);

// onboarding completado (señal del schema público)
const r = await fetch(`${URL}/rest/v1/profiles?select=id&onboarding_completed_at=not.is.null`, {
  headers: { ...H, Prefer: "count=exact", Range: "0-0" },
});
const cr = r.headers.get("content-range");
console.log(`\nProfiles con onboarding COMPLETADO: ${cr ? cr.split("/")[1] : "?"}`);

console.log("\nÚltimos ingresos (hasta 12):");
signedIn
  .sort((a, b) => b.last_sign_in_at.localeCompare(a.last_sign_in_at))
  .slice(0, 12)
  .forEach((u) => console.log(`  ${u.last_sign_in_at}  ${u.email}`));
