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

// 1) Recolectar usuarios listables (saltando páginas que revientan)
const PER = 5;
const failedPages = [];
const listed = new Map(); // id -> email
for (let page = 1; page <= 120; page++) {
  const res = await fetch(`${URL}/auth/v1/admin/users?page=${page}&per_page=${PER}`, { headers: H });
  if (!res.ok) { failedPages.push(page); continue; }
  const { users } = await res.json();
  if (!users.length) { if (page > 3) break; else continue; }
  for (const u of users) listed.set(u.id, u.email);
}
console.log(`Páginas que fallan (per_page=${PER}): [${failedPages.join(", ")}]`);
console.log(`Usuarios listables: ${listed.size}`);

// 2) Todos los profiles (id + email) vía REST
const pr = await fetch(`${URL}/rest/v1/profiles?select=id,email,created_at`, { headers: H });
const profiles = await pr.json();
console.log(`Profiles totales: ${profiles.length}`);

// 3) Profiles cuyo auth user NO aparece en el listado = sospechosos
const missing = profiles.filter((p) => !listed.has(p.id));
console.log(`\n>>> SOSPECHOSOS (profile sin aparecer en el listado de Auth): ${missing.length}`);
for (const m of missing) console.log(`   ${m.id}  ${m.email}  (profile creado ${m.created_at})`);

// 4) Intentar leer cada sospechoso por id (fetch individual)
console.log("\n--- fetch individual de cada sospechoso ---");
for (const m of missing.slice(0, 8)) {
  const r = await fetch(`${URL}/auth/v1/admin/users/${m.id}`, { headers: H });
  if (!r.ok) {
    console.log(`   ${m.email}: getUserById -> ${r.status} (también falla)`);
    continue;
  }
  const u = await r.json();
  console.log(`   ${m.email}: OK | confirmed=${!!u.email_confirmed_at} last_sign_in=${u.last_sign_in_at ?? "—"} created=${u.created_at}`);
}
