// Reconciliación del post-procesado de IA de las lecciones (huecos que dejó el
// fire-and-forget del webhook, ver app/api/webhooks/mux/route.ts).
//
// Recorre las lecciones con transcripción `ready` y, SOLO donde falta, regenera:
//   - corrección de la transcripción (sin transcript_segments)
//   - resumen/glosario (sin fila en lesson_summaries)
//   - capítulos (sin fila en lesson_chapters)
//
// Reusa exactamente las mismas funciones que el webhook, así que el resultado es
// idéntico al del flujo automático. No borra nada que ya exista.
//
// Uso:
//   npx tsx scripts/backfill-lesson-ai.ts          # solo rellena huecos
//   npx tsx scripts/backfill-lesson-ai.ts --force  # regenera todo, exista o no
//
// NO ejecutar sin confirmar: hace llamadas a OpenAI (costo) y escribe en la BD
// apuntada por SUPABASE_SERVICE_ROLE_KEY.

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

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY no configurada en .env");
  process.exit(1);
}
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const FORCE = process.argv.includes("--force");

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { correctTranscript } = await import(
    "@/lib/classroom/correct-transcript"
  );
  const { generateLessonSummary } = await import(
    "@/lib/classroom/generate-summary"
  );
  const { generateLessonChapters } = await import(
    "@/lib/classroom/generate-chapters"
  );

  const admin = createAdminClient();

  const { data: transcripts, error } = await admin
    .from("lesson_transcripts")
    .select("id, lesson_id, content_text, content_vtt, lessons!inner(title)")
    .eq("status", "ready");

  if (error) {
    console.error("Error consultando lesson_transcripts:", error.message);
    process.exit(1);
  }
  if (!transcripts || transcripts.length === 0) {
    console.log("No hay transcripciones listas.");
    return;
  }

  for (const t of transcripts) {
    const lessonId = t.lesson_id as string;
    const title =
      (t.lessons as unknown as { title: string } | null)?.title ?? lessonId;
    console.log(`\n=== ${title} ===`);

    // Corrección: falta si no hay transcript_segments para esta transcripción.
    if (t.content_vtt) {
      const { count } = await admin
        .from("transcript_segments")
        .select("id", { count: "exact", head: true })
        .eq("transcript_id", t.id);
      if (FORCE || (count ?? 0) === 0) {
        console.log("  Corrigiendo transcripción...");
        try {
          await correctTranscript(lessonId);
          console.log("  ✓ Transcripción corregida");
        } catch (err) {
          console.error(
            `  ✗ Corrección: ${err instanceof Error ? err.message : err}`,
          );
        }
      } else {
        console.log(`  · Transcripción ya corregida (${count} segmentos) — skip`);
      }
    }

    if (t.content_text) {
      // Resumen: falta si no hay fila en lesson_summaries.
      const { count: summaryCount } = await admin
        .from("lesson_summaries")
        .select("lesson_id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      if (FORCE || (summaryCount ?? 0) === 0) {
        console.log("  Generando resumen...");
        try {
          await generateLessonSummary(lessonId);
          console.log("  ✓ Resumen generado");
        } catch (err) {
          console.error(
            `  ✗ Resumen: ${err instanceof Error ? err.message : err}`,
          );
        }
      } else {
        console.log("  · Resumen ya existe — skip");
      }

      // Capítulos: faltan si no hay filas en lesson_chapters.
      const { count: chaptersCount } = await admin
        .from("lesson_chapters")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      if (FORCE || (chaptersCount ?? 0) === 0) {
        console.log("  Generando capítulos...");
        try {
          await generateLessonChapters(lessonId);
          console.log("  ✓ Capítulos generados");
        } catch (err) {
          console.error(
            `  ✗ Capítulos: ${err instanceof Error ? err.message : err}`,
          );
        }
      } else {
        console.log(`  · Capítulos ya existen (${chaptersCount}) — skip`);
      }
    }
  }

  console.log("\n--- Listo ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
