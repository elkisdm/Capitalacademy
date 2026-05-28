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

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("OPENAI_API_KEY no configurada");
  process.exit(1);
}

interface VTTSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

function parseVTTSimple(vtt: string): VTTSegment[] {
  const segments: VTTSegment[] = [];
  const blocks = vtt.replace(/\r\n/g, "\n").split("\n\n");
  let idx = 0;

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!text) continue;

    const parseTime = (t: string) => {
      const parts = t.split(":");
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    };

    segments.push({
      index: idx++,
      startSeconds: parseTime(startStr),
      endSeconds: parseTime(endStr),
      text,
    });
  }

  return segments;
}

async function correctBatch(segments: VTTSegment[]): Promise<Array<{ index: number; corrected: string; needs_review: boolean; review_reason: string | null }>> {
  const segmentList = segments.map((s) => `[${s.index}] ${s.text}`).join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 4000,
      messages: [
        {
          role: "system",
          content: `Eres un corrector de transcripciones automáticas en español. Corrige errores de reconocimiento de voz, puntuación y mayúsculas. Responde en JSON:
{"corrections": [{"index": 0, "corrected": "texto corregido", "needs_review": false, "review_reason": null}, ...]}

Reglas:
- Mantén el significado original exacto
- Corrige solo errores evidentes de ASR (speech-to-text)
- needs_review=true solo si el segmento es incoherente o ambiguo
- NO traduzcas ni reformules
- Incluye TODOS los índices recibidos`,
        },
        { role: "user", content: segmentList },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content).corrections;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: transcripts } = await sb
    .from("lesson_transcripts")
    .select("id, lesson_id, content_vtt, lessons!inner(id, title)")
    .eq("status", "ready")
    .not("content_vtt", "is", null);

  if (!transcripts?.length) {
    console.log("No hay transcripts para corregir.");
    return;
  }

  // Check which already have segments
  for (const t of transcripts) {
    const lesson = t.lessons as unknown as { id: string; title: string };
    const { count } = await sb
      .from("transcript_segments")
      .select("id", { count: "exact", head: true })
      .eq("transcript_id", t.id);

    if ((count ?? 0) > 0) {
      console.log(`[${lesson.title}] Ya tiene ${count} segmentos corregidos — skip`);
      continue;
    }

    console.log(`\n[${lesson.title}] Corrigiendo...`);
    const segments = parseVTTSimple(t.content_vtt as string);
    console.log(`  ${segments.length} segmentos del VTT`);

    const BATCH_SIZE = 40;
    const allCorrections: Array<{ index: number; corrected: string; needs_review: boolean; review_reason: string | null }> = [];

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(segments.length / BATCH_SIZE)}...`);
      try {
        const corrections = await correctBatch(batch);
        allCorrections.push(...corrections);
      } catch (err) {
        console.error(`  Error en batch: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Batch upsert all segments (deduplicate by index — OpenAI may return dupes)
    if (allCorrections.length > 0) {
      const deduped = new Map<number, typeof allCorrections[0]>();
      for (const c of allCorrections) deduped.set(c.index, c);

      const rows = Array.from(deduped.values()).map((c) => {
        const seg = segments[c.index];
        return {
          transcript_id: t.id,
          segment_index: c.index,
          start_seconds: seg?.startSeconds ?? 0,
          end_seconds: seg?.endSeconds ?? 0,
          original_text: seg?.text ?? "",
          corrected_text: c.corrected,
          needs_review: c.needs_review,
          review_reason: c.review_reason,
        };
      });

      const { error } = await sb
        .from("transcript_segments")
        .upsert(rows, { onConflict: "transcript_id,segment_index" });

      if (error) {
        console.error(`  Error guardando: ${error.message}`);
      } else {
        console.log(`  ✓ ${rows.length} segmentos corregidos guardados`);
      }
    }
  }

  console.log("\n--- Listo ---");
}

main().catch(console.error);
