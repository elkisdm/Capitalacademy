import { createAdminClient } from "@/lib/supabase/admin";

const PROMPT_VERSION = 1;
const MODEL = "gpt-5.4-mini";

const SYSTEM_PROMPT = `Eres un asistente educativo especializado en el sector inmobiliario chileno. Tu tarea es generar un resumen estructurado de una clase grabada a partir de su transcripcion.

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "key_points": ["punto 1", "punto 2", ...],
  "summary_text": "Resumen de 2-3 parrafos...",
  "glossary": [{"term": "termino", "definition": "definicion breve"}, ...]
}

Reglas:
- key_points: 3-5 puntos clave de la leccion, cada uno en una oracion concisa.
- summary_text: Resumen cohesivo de 2-3 parrafos que capture los temas principales, ejemplos dados, y conclusiones del profesor.
- glossary: 3-8 terminos tecnicos o conceptos clave mencionados en la clase, con definiciones breves. Incluye anglicismos comunes del sector inmobiliario chileno.
- Escribe en espanol neutro latinoamericano.
- Si la transcripcion parece corrupta o incoherente, responde con: {"error": "transcript_corrupted"}`;

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface SummaryPayload {
  key_points: string[];
  summary_text: string;
  glossary: Array<{ term: string; definition: string }>;
}

export interface LessonSummaryRow {
  lesson_id: string;
  key_points: string[];
  summary_text: string;
  glossary: Array<{ term: string; definition: string }>;
  model_used: string;
  prompt_version: number;
  generation_count: number;
  is_manually_edited: boolean;
  generated_at: string;
}

async function callOpenAI(
  lessonTitle: string,
  transcriptText: string,
): Promise<SummaryPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const userMessage = `Titulo de la leccion: ${lessonTitle}\n\nTranscripcion:\n${transcriptText}`;

  const requestBody = {
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
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

  return JSON.parse(content) as SummaryPayload;
}

/**
 * Genera (o regenera) el resumen estructurado (puntos clave, resumen,
 * glosario) de una lección a partir de su transcripción y lo guarda en
 * `lesson_summaries`. Usado tanto por el endpoint admin de regeneración
 * manual (`/api/admin/generate-summary`) como por el webhook de Mux
 * (auto-generación tras `video.asset.track.ready`). Aplica por igual a
 * lecciones pregrabadas y a la lección-repetición de una clase en vivo.
 */
export async function generateLessonSummary(
  lessonId: string,
): Promise<LessonSummaryRow> {
  const admin = createAdminClient();

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, title")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    throw new Error(`Lesson not found: ${lessonId}`);
  }

  const { data: transcript } = await admin
    .from("lesson_transcripts")
    .select("content_text")
    .eq("lesson_id", lessonId)
    .eq("status", "ready")
    .single();

  if (!transcript?.content_text) {
    throw new Error(`No transcript found for lesson ${lessonId}`);
  }

  let parsed: SummaryPayload | { error: string };
  let attempts = 0;

  while (true) {
    attempts++;
    try {
      parsed = await callOpenAI(lesson.title, transcript.content_text);
      break;
    } catch (err) {
      const isParseError =
        err instanceof SyntaxError ||
        (err instanceof Error && err.message.includes("empty content"));
      const isOpenAIError =
        err instanceof Error && err.message.startsWith("OpenAI API error");

      if (isOpenAIError) throw err;
      if (isParseError && attempts < 2) continue;
      throw err;
    }
  }

  if ("error" in parsed) {
    throw new Error(`transcript_corrupted: ${parsed.error}`);
  }

  const summary = parsed as SummaryPayload;

  const { data: existing } = await admin
    .from("lesson_summaries")
    .select("generation_count")
    .eq("lesson_id", lessonId)
    .single();

  const generationCount = (existing?.generation_count ?? 0) + 1;

  const { data: upserted, error: upsertError } = await admin
    .from("lesson_summaries")
    .upsert(
      {
        lesson_id: lessonId,
        key_points: summary.key_points,
        summary_text: summary.summary_text,
        glossary: summary.glossary,
        model_used: MODEL,
        prompt_version: PROMPT_VERSION,
        generation_count: generationCount,
        is_manually_edited: false,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id" },
    )
    .select()
    .single();

  if (upsertError) {
    throw new Error(`Failed to upsert lesson_summaries: ${upsertError.message}`);
  }

  return upserted as unknown as LessonSummaryRow;
}
