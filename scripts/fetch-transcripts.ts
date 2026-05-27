import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const scriptDir = new URL(".", import.meta.url).pathname;
const envPath = resolve(scriptDir, "..", ".env");
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: lessons } = await sb
    .from("lessons")
    .select("id, title, mux_playback_id, mux_track_id")
    .not("mux_track_id", "is", null);

  if (!lessons || lessons.length === 0) {
    console.log("No hay lecciones con track_id.");
    return;
  }

  for (const l of lessons) {
    const pid = l.mux_playback_id as string;
    const tid = l.mux_track_id as string;

    const [txtR, vttR] = await Promise.all([
      fetch(`https://stream.mux.com/${pid}/text/${tid}.txt`),
      fetch(`https://stream.mux.com/${pid}/text/${tid}.vtt`),
    ]);

    if (!txtR.ok) {
      console.log(`[${l.title}] NOT READY (${txtR.status})`);
      continue;
    }

    const [txt, vtt] = await Promise.all([txtR.text(), vttR.text()]);

    await sb.from("lesson_transcripts").upsert(
      {
        lesson_id: l.id,
        content_text: txt,
        content_vtt: vtt,
        language: "es",
        status: "ready",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,language" },
    );

    console.log(`[${l.title}] SAVED (${txt.length} chars)`);
  }
}

main().catch(console.error);
