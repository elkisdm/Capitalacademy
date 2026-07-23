import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  MAX_SOUND_MARKER_RATIO,
  soundMarkerRatio,
} from "../lib/classroom/transcript-quality";

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

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("OPENAI_API_KEY no configurada en .env");
  process.exit(1);
}

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2000,
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: transcripts } = await sb
    .from("lesson_transcripts")
    .select("lesson_id, content_text, lessons!inner(id, title, video_duration_seconds)")
    .eq("status", "ready")
    .not("content_text", "is", null);

  if (!transcripts || transcripts.length === 0) {
    console.log("No hay transcripts listos.");
    return;
  }

  for (const t of transcripts) {
    const lesson = t.lessons as unknown as {
      id: string;
      title: string;
      video_duration_seconds: number;
    };
    const text = t.content_text as string;
    console.log(`\n=== ${lesson.title} (${text.length} chars) ===`);

    const markerRatio = soundMarkerRatio(text);
    if (markerRatio > MAX_SOUND_MARKER_RATIO) {
      console.log(
        `  ✗ Transcripción degradada (${Math.round(markerRatio * 100)}% marcadores de sonido), se omite.`,
      );
      continue;
    }

    // Generate summary
    console.log("  Generando resumen...");
    try {
      const summary = await callOpenAI(
        `Eres un asistente educativo especializado en el sector inmobiliario chileno. Tu tarea es generar un resumen estructurado de una clase grabada a partir de su transcripción.

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "key_points": ["punto 1", "punto 2", ...],
  "summary_text": "Resumen de 2-3 párrafos...",
  "glossary": [{"term": "término", "definition": "definición breve"}, ...]
}

Reglas:
- key_points: 3-5 puntos clave de la lección, cada uno en una oración concisa.
- summary_text: Resumen cohesivo de 2-3 párrafos que capture los temas principales, ejemplos dados, y conclusiones del profesor.
- glossary: 3-8 términos técnicos o conceptos clave mencionados en la clase, con definiciones breves.
- Escribe en español neutro latinoamericano.
- Si la transcripción parece corrupta o incoherente, responde con: {"error": "transcript_corrupted"}`,
        `Título de la lección: ${lesson.title}\n\nTranscripción:\n${text.slice(0, 25000)}`,
        2000,
      );

      if ("error" in summary) {
        console.log(`  ✗ Transcript corrupto: ${summary.error}`);
        continue;
      }

      await sb.from("lesson_summaries").upsert(
        {
          lesson_id: lesson.id,
          key_points: summary.key_points as string[],
          summary_text: summary.summary_text as string,
          glossary: summary.glossary as unknown[],
          model_used: "gpt-5.4-mini",
          prompt_version: 1,
          generation_count: 1,
          is_manually_edited: false,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id" },
      );
      console.log(`  ✓ Resumen guardado`);
    } catch (err) {
      console.error(
        `  ✗ Error resumen: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Generate chapters
    console.log("  Generando capítulos...");
    try {
      const chapters = await callOpenAI(
        `Eres un asistente que analiza transcripciones de clases para identificar cambios de tema y generar marcadores de capítulos.

Responde SIEMPRE en JSON con esta estructura:
{"chapters": [{"title": "Título corto del capítulo", "position_seconds": 120}, ...]}

Reglas:
- Genera entre 3 y 8 capítulos.
- El primer capítulo siempre empieza en position_seconds: 0.
- Los títulos deben ser concisos (máximo 6 palabras).
- position_seconds debe ser un entero válido menor que la duración total del video.
- Detecta cambios reales de tema, no fragmentes artificialmente.
- Si la transcripción es incoherente, responde: {"error": "transcript_corrupted"}`,
        `Título: ${lesson.title}\nDuración: ${lesson.video_duration_seconds}s\n\nTranscripción:\n${text.slice(0, 25000)}`,
        1000,
      );

      if ("error" in chapters) {
        console.log(`  ✗ Transcript corrupto para capítulos`);
        continue;
      }

      const chapterList = (chapters.chapters as { title: string; position_seconds: number }[])
        .filter(
          (c) =>
            c.position_seconds >= 0 &&
            c.position_seconds < lesson.video_duration_seconds,
        );

      // Delete old generated chapters
      await sb
        .from("lesson_chapters")
        .delete()
        .eq("lesson_id", lesson.id)
        .eq("is_generated", true);

      // Insert new
      if (chapterList.length > 0) {
        await sb.from("lesson_chapters").insert(
          chapterList.map((c, i) => ({
            lesson_id: lesson.id,
            position_seconds: c.position_seconds,
            title: c.title,
            sort_order: i,
            is_generated: true,
          })),
        );
      }

      console.log(`  ✓ ${chapterList.length} capítulos guardados`);
    } catch (err) {
      console.error(
        `  ✗ Error capítulos: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("\n--- Listo ---");
}

main().catch(console.error);
