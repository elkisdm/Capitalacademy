import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE = "https://capitalacademy.cl";
const COHORT = "b0000000-0000-0000-0000-000000000001";
const EMAIL = "qa.e2e.flow.20260606@test.local";

// limpiar si quedó de una corrida previa
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 5 });
// (no buscamos en todo; intentamos crear y si existe, recovery)

let { data, error } = await sb.auth.admin.generateLink({
  type: "invite", email: EMAIL, options: { redirectTo: `${BASE}/onboarding/set-password` },
});
if (error && /registered|already/i.test(error.message)) {
  ({ data, error } = await sb.auth.admin.generateLink({
    type: "recovery", email: EMAIL, options: { redirectTo: `${BASE}/onboarding/set-password` },
  }));
}
if (error) throw error;

const userId = data.user?.id;
const hashed = data.properties.hashed_token;
const type = data.properties.verification_type ?? "invite";

await sb.from("profiles").upsert(
  { id: userId, email: EMAIL, full_name: "QA E2E Flow", role: "student", phone: "+56900000000" },
  { onConflict: "id" },
);
await sb.from("enrollments").upsert(
  { cohort_id: COHORT, student_id: userId, status: "active" },
  { onConflict: "cohort_id,student_id" },
);

const confirmUrl = `${BASE}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${type}&next=${encodeURIComponent("/onboarding/set-password")}`;
console.log("TEST_USER_ID=" + userId);
console.log("TEST_EMAIL=" + EMAIL);
console.log("CONFIRM_URL=" + confirmUrl);
