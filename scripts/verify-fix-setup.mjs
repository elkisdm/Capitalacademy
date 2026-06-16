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
const COHORT = "b0000000-0000-0000-0000-000000000001";
const EMAIL = "qa.verify.fix@test.local";
const PASSWORD = "QaVerify2026!fix";
const action = process.argv[2];

if (action === "cleanup") {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 20 });
  const u = (data?.users || []).find((x) => x.email === EMAIL);
  if (u) { await sb.auth.admin.deleteUser(u.id); console.log("cleanup: borrado", EMAIL); }
  else console.log("cleanup: no estaba");
  process.exit(0);
}

if (action === "check-progress") {
  // ¿se creó video_progress para este user?
  const { data: prof } = await sb.from("profiles").select("id").eq("email", EMAIL).single();
  const { data: enr } = await sb.from("enrollments").select("id").eq("student_id", prof.id).eq("cohort_id", COHORT).single();
  const { data: vp } = await sb.from("video_progress").select("lesson_id,playback_position_seconds,watch_percentage,last_watched_at").eq("enrollment_id", enr.id);
  console.log("video_progress rows para el test user:", (vp || []).length);
  for (const r of vp || []) console.log("  ", r.lesson_id, "pos", r.playback_position_seconds, "s", r.watch_percentage + "%");
  process.exit(0);
}

// default: setup
const { data: created, error: cErr } = await sb.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
});
let userId = created?.user?.id;
if (cErr && /registered|already/i.test(cErr.message)) {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 20 });
  userId = (data.users.find((u) => u.email === EMAIL) || {}).id;
  await sb.auth.admin.updateUserById(userId, { password: PASSWORD });
} else if (cErr) throw cErr;

await sb.from("profiles").upsert(
  { id: userId, email: EMAIL, full_name: "QA Verify Fix", role: "student", phone: "+56900000001", rut: "11.111.111-1", onboarding_completed_at: new Date().toISOString() },
  { onConflict: "id" },
);
await sb.from("enrollments").upsert(
  { cohort_id: COHORT, student_id: userId, status: "active" }, { onConflict: "cohort_id,student_id" },
);
console.log("SETUP OK");
console.log("EMAIL=" + EMAIL);
console.log("PASSWORD=" + PASSWORD);
console.log("USER_ID=" + userId);
