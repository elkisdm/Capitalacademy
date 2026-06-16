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
const get = async (path) => (await fetch(`${URL}/rest/v1/${path}`, { headers: H })).json();

const [vp, lessons, enrolls, profiles] = await Promise.all([
  get("video_progress?select=*&order=last_watched_at.desc"),
  get("lessons?select=id,title"),
  get("enrollments?select=id,student_id"),
  get("profiles?select=id,email"),
]);

const lessonName = Object.fromEntries(lessons.map((l) => [l.id, l.title]));
const enrToStudent = Object.fromEntries(enrolls.map((e) => [e.id, e.student_id]));
const email = Object.fromEntries(profiles.map((p) => [p.id, p.email]));

console.log(`Filas video_progress: ${vp.length}\n`);
console.log("Quién | Clase | %visto | completado | última vez");
console.log("-".repeat(90));
const watchers = new Set();
for (const r of vp) {
  const who = email[enrToStudent[r.enrollment_id]] ?? `enrollment ${r.enrollment_id?.slice(0, 8)}`;
  watchers.add(who);
  console.log(`${who} | ${lessonName[r.lesson_id] ?? r.lesson_id} | ${r.watch_percentage}% | ${r.completed ? "sí" : "no"} | ${r.last_watched_at}`);
}
console.log("-".repeat(90));
console.log(`\nPersonas distintas que han reproducido algo: ${watchers.size}`);
console.log([...watchers].map((w) => "  - " + w).join("\n"));

// ¿alguna reproducción de hoy 06-jun (= compradores nuevos)?
const hoy = vp.filter((r) => (r.last_watched_at || "").startsWith("2026-06-06"));
console.log(`\nReproducciones de HOY (06-jun): ${hoy.length}`);
