import { createAdminClient } from "@/lib/supabase/admin";

const SYSTEM_PROMPT = `Eres un asistente que analiza transcripciones de clases para identificar cambios de tema y generar marcadores de capitulos.

Responde SIEMPRE en JSON con esta estructura:
{"chapters": [{"title": "Titulo corto del capitulo", "position_seconds": 120}, ...]}

Reglas:
- Genera entre 3 y 8 capitulos.
- El primer capitulo siempre empieza en position_seconds: 0.
- Los titulos deben ser concisos (maximo 6 palabras).
- position_seconds debe ser un entero valido menor que la duracion total del video.
- Detecta cambios reales de tema, no fragmentes artificialmente.
- Si la transcripcion es incoherente, responde: {"error": "transcript_corrupted"}`;

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ChapterEntry {
  title: string;
  position_seconds: number;
}

interface ChaptersPayload {
  chapters: ChapterEntry[];
}

export interface LessonChapterRow {
  id: string;
  lesson_id: string;
  title: string;
  position_seconds: number;
  sort_order: number;
  is_generated: boolean;
}

async function callOpenAI(
  lessonTitle: string,
  durationSeconds: number,
  transcriptText: string,
): Promise<ChaptersPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const userMessage = `Titulo: ${lessonTitle}\nDuracion: ${durationSeconds}s\n\nTranscripcion:\n${transcriptText}`;

  const requestBody = {
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_completion_tokens: 1000,
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

  return JSON.parse(content) as ChaptersPayload;
}

/**
 * Genera (o regenera) los capítulos de una lección a partir de su
 * transcripción y su duración, y los guarda en `lesson_chapters`. Usado
 * tanto por el endpoint admin de regeneración manual
 * (`/api/admin/generate-chapters`) como por el webhook de Mux
 * (auto-generación tras `video.asset.track.ready`). Aplica por igual a
 * lecciones pregrabadas y a la lección-repetición de una clase en vivo.
 */
export async function generateLessonChapters(
  lessonId: string,
): Promise<LessonChapterRow[]> {
  const admin = createAdminClient();

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, title, video_duration_seconds")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    throw new Error(`Lesson not found: ${lessonId}`);
  }

  if (lesson.video_duration_seconds === null || lesson.video_duration_seconds === undefined) {
    throw new Error(`Lesson ${lessonId} has no video duration`);
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

  let parsed: ChaptersPayload | { error: string };
  let attempts = 0;

  while (true) {
    attempts++;
    try {
      parsed = await callOpenAI(
        lesson.title,
        lesson.video_duration_seconds,
        transcript.content_text,
      );
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
    if (parsed.error === "transcript_corrupted") {
      throw new Error("transcript_corrupted");
    }
    throw new Error(`OpenAI reporto un error al generar capitulos: ${parsed.error}`);
  }

  if (!("chapters" in parsed) || !Array.isArray(parsed.chapters)) {
    throw new Error("OpenAI no devolvio la clave 'chapters' esperada");
  }

  const { chapters } = parsed;
  const duration = lesson.video_duration_seconds;

  const validChapters = chapters.filter(
    (ch) =>
      typeof ch.position_seconds === "number" &&
      Number.isInteger(ch.position_seconds) &&
      ch.position_seconds >= 0 &&
      ch.position_seconds < duration &&
      typeof ch.title === "string" &&
      ch.title.trim().length > 0,
  );

  if (validChapters.length === 0) {
    throw new Error("OpenAI no genero capitulos validos");
  }

  const { error: deleteError } = await admin
    .from("lesson_chapters")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("is_generated", true);

  if (deleteError) {
    throw new Error(`Failed to delete old lesson_chapters: ${deleteError.message}`);
  }

  const rows = validChapters.map((ch, idx) => ({
    lesson_id: lessonId,
    title: ch.title.trim(),
    position_seconds: ch.position_seconds,
    sort_order: idx,
    is_generated: true,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("lesson_chapters")
    .insert(rows)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert lesson_chapters: ${insertError.message}`);
  }

  return inserted as LessonChapterRow[];
}
