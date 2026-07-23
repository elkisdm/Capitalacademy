import { createAdminClient } from "@/lib/supabase/admin";
import { parseVTT, type TranscriptSegment } from "@/lib/classroom/parse-vtt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CorrectionItem {
  index: number;
  corrected: string;
  changed: boolean;
  needs_review: boolean;
  review_reason: string | null;
}

interface OpenAICorrectionResponse {
  corrections: CorrectionItem[];
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface CorrectionResult {
  corrected: boolean;
  totalSegments: number;
  changedSegments: number;
  needsReview: number;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un corrector de transcripciones automáticas (Whisper) de clases grabadas sobre inversión inmobiliaria en Chile. Tu trabajo es:

1. Corregir errores ortográficos y gramaticales evidentes del speech-to-text
2. Reemplazar palabras mal transcritas por las más probables según el contexto (ej: "Opramos" → "Compramos", "hicimo" → "hicimos", "onze" → "once")
3. Mantener el estilo oral/hablado — NO formalizar ni reescribir
4. Marcar segmentos donde NO tienes confianza en la corrección

Responde en JSON:
{
  "corrections": [
    {
      "index": 0,
      "corrected": "texto corregido",
      "changed": true,
      "needs_review": false,
      "review_reason": null
    },
    {
      "index": 1,
      "corrected": "texto posiblemente corregido",
      "changed": true,
      "needs_review": true,
      "review_reason": "Palabra ininteligible — usé la más probable según contexto"
    }
  ]
}

Reglas:
- "changed": true solo si modificaste el texto
- "needs_review": true cuando no estés seguro de la corrección (baja confianza)
- "review_reason": breve explicación de por qué necesita revisión humana
- NO cambies nombres propios, marcas o términos técnicos que suenen correctos
- Respeta los chilenismos comunes (po, cachai, etc) — son intencionales
- Si un segmento está bien, devuélvelo con changed: false`;

// ---------------------------------------------------------------------------
// OpenAI call
// ---------------------------------------------------------------------------

async function callOpenAI(
  segments: Array<{ index: number; text: string }>,
): Promise<CorrectionItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const requestBody = {
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(segments) },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "unknown error");
    throw new Error(`OpenAI API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty content");
  }

  const parsed = JSON.parse(content) as OpenAICorrectionResponse;
  return parsed.corrections;
}

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

async function callOpenAIBatched(
  segments: TranscriptSegment[],
): Promise<CorrectionItem[]> {
  const input = segments.map((s) => ({ index: s.index, text: s.text }));

  if (input.length <= BATCH_SIZE) {
    return callOpenAI(input);
  }

  // Split into batches of BATCH_SIZE and process sequentially to avoid
  // rate-limit issues with large transcripts.
  const allCorrections: CorrectionItem[] = [];

  for (let i = 0; i < input.length; i += BATCH_SIZE) {
    const batch = input.slice(i, i + BATCH_SIZE);
    const batchCorrections = await callOpenAI(batch);
    allCorrections.push(...batchCorrections);
  }

  return allCorrections;
}

// ---------------------------------------------------------------------------
// VTT rebuilder
// ---------------------------------------------------------------------------

function rebuildVTT(
  originalVtt: string,
  segments: TranscriptSegment[],
  correctionMap: Map<number, string>,
): string {
  const normalized = originalVtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = normalized.replace(/^﻿/, "");
  const blocks = cleaned.split(/\n\n+/);

  const TIMESTAMP_RE = /^[\d:.]+\s*-->\s*[\d:.]+/;
  const HTML_TAG_RE = /<[^>]+>/g;
  let segmentIdx = 0;
  const result: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");

    let timeLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (TIMESTAMP_RE.test(lines[i].trim())) {
        timeLine = i;
        break;
      }
    }

    if (timeLine === -1) {
      // Header block (e.g. "WEBVTT") — keep as-is
      result.push(block);
      continue;
    }

    // Replicar el mismo filtro de texto vacío que usa parseVTT: un cue cuyo
    // único contenido es una etiqueta HTML (ej. '<i></i>') no genera segmento
    // ahí, así que tampoco debe consumir un índice de `segments` acá.
    const textLines = lines
      .slice(timeLine + 1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const text = textLines.join(" ").replace(HTML_TAG_RE, "").trim();

    if (text.length === 0) {
      result.push(block);
      continue;
    }

    // This is a cue block — find the matching segment
    const seg = segments[segmentIdx];
    if (seg !== undefined) {
      const correctedText = correctionMap.get(seg.index) ?? seg.text;
      const headerLines = lines.slice(0, timeLine + 1);
      result.push([...headerLines, correctedText].join("\n"));
      segmentIdx++;
    } else {
      result.push(block);
    }
  }

  return result.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function correctTranscript(
  lessonId: string,
): Promise<CorrectionResult> {
  const admin = createAdminClient();

  // 1. Fetch transcript
  const { data: transcript, error: fetchError } = await admin
    .from("lesson_transcripts")
    .select("id, content_vtt, content_text")
    .eq("lesson_id", lessonId)
    .eq("status", "ready")
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    throw new Error(
      `Failed to fetch transcript for lesson ${lessonId}: ${fetchError.message}`,
    );
  }

  if (!transcript) {
    throw new Error(`No transcript found for lesson ${lessonId}`);
  }

  if (!transcript.content_vtt) {
    throw new Error(`Transcript for lesson ${lessonId} has no VTT content`);
  }

  // 2. Parse VTT into segments
  const segments = parseVTT(transcript.content_vtt);

  if (segments.length === 0) {
    throw new Error(`Parsed 0 segments from VTT for lesson ${lessonId}`);
  }

  // 3. Fetch existing segments that were manually edited (don't overwrite)
  const { data: existingSegments, error: editedError } = await admin
    .from("transcript_segments")
    .select("segment_index")
    .eq("transcript_id", transcript.id)
    .eq("manually_edited", true);

  if (editedError) {
    throw new Error(
      `Failed to fetch manually edited segments: ${editedError.message}`,
    );
  }

  const manuallyEditedIndices = new Set(
    (existingSegments ?? []).map((s) => s.segment_index),
  );

  // 4. Call OpenAI
  const corrections = await callOpenAIBatched(segments);

  // Build a correction lookup by index
  const correctionByIndex = new Map<number, CorrectionItem>();
  for (const c of corrections) {
    correctionByIndex.set(c.index, c);
  }

  // 5. Collect segments for batch upsert and build corrected text map
  const correctedTextMap = new Map<number, string>();
  let changedCount = 0;
  let reviewCount = 0;

  const segmentsToUpsert: Array<{
    transcript_id: string;
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    original_text: string;
    corrected_text: string | null;
    needs_review: boolean;
    review_reason: string | null;
  }> = [];

  for (const seg of segments) {
    const correction = correctionByIndex.get(seg.index);
    if (!correction) continue;

    if (correction.changed) {
      if (manuallyEditedIndices.has(seg.index)) {
        continue;
      }

      correctedTextMap.set(seg.index, correction.corrected);
      changedCount++;

      if (correction.needs_review) {
        reviewCount++;
      }

      segmentsToUpsert.push({
        transcript_id: transcript.id,
        segment_index: seg.index,
        start_seconds: seg.start,
        end_seconds: seg.end,
        original_text: seg.text,
        corrected_text: correction.corrected,
        needs_review: correction.needs_review,
        review_reason: correction.review_reason,
      });
    } else {
      if (!manuallyEditedIndices.has(seg.index)) {
        segmentsToUpsert.push({
          transcript_id: transcript.id,
          segment_index: seg.index,
          start_seconds: seg.start,
          end_seconds: seg.end,
          original_text: seg.text,
          corrected_text: null,
          needs_review: false,
          review_reason: null,
        });
      }
    }
  }

  // Batch upsert all segments in a single query
  if (segmentsToUpsert.length > 0) {
    const { error: upsertError } = await admin
      .from("transcript_segments")
      .upsert(segmentsToUpsert, { onConflict: "transcript_id,segment_index" });

    if (upsertError) {
      throw new Error(
        `Failed to batch upsert transcript_segments: ${upsertError.message}`,
      );
    }
  }

  // 6. Build corrected VTT
  const correctedVtt = rebuildVTT(
    transcript.content_vtt,
    segments,
    correctedTextMap,
  );

  // 7. Build corrected plain text
  const correctedText = segments
    .map((seg) => correctedTextMap.get(seg.index) ?? seg.text)
    .join(" ");

  // 8. Update lesson_transcripts
  const { error: updateError } = await admin
    .from("lesson_transcripts")
    .update({
      corrected_text: correctedText,
      corrected_vtt: correctedVtt,
      correction_status: "corrected",
      segments_needing_review: reviewCount,
    })
    .eq("id", transcript.id);

  if (updateError) {
    throw new Error(
      `Failed to update lesson_transcripts: ${updateError.message}`,
    );
  }

  return {
    corrected: true,
    totalSegments: segments.length,
    changedSegments: changedCount,
    needsReview: reviewCount,
  };
}
