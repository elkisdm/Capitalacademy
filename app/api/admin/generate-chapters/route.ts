import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  // --- Validate body ---------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { lessonId } = body as { lessonId?: string };
  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido" },
      { status: 422 },
    );
  }

  // --- Fetch lesson with duration --------------------------------------------
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, video_duration_seconds")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json(
      { error: "Leccion no encontrada" },
      { status: 404 },
    );
  }

  if (!lesson.video_duration_seconds) {
    return NextResponse.json(
      { error: "La leccion no tiene duracion de video registrada" },
      { status: 422 },
    );
  }

  // --- Fetch transcript ------------------------------------------------------
  const { data: transcript } = await supabase
    .from("lesson_transcripts")
    .select("content_text")
    .eq("lesson_id", lessonId)
    .eq("status", "ready")
    .single();

  if (!transcript?.content_text) {
    return NextResponse.json(
      { error: "No hay transcripcion disponible para esta leccion" },
      { status: 404 },
    );
  }

  // --- Check OPENAI_API_KEY early --------------------------------------------
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY no esta configurada en el servidor" },
      { status: 500 },
    );
  }

  // --- Call OpenAI (with one retry on JSON parse failure) ---------------------
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

      if (isOpenAIError) {
        console.error("OpenAI API error:", (err as Error).message);
        return NextResponse.json(
          { error: "Error al comunicarse con OpenAI" },
          { status: 502 },
        );
      }

      if (isParseError && attempts < 2) {
        continue;
      }

      console.error("OpenAI response parse error:", err);
      return NextResponse.json(
        { error: "OpenAI devolvio una respuesta invalida" },
        { status: 502 },
      );
    }
  }

  // --- Handle corrupted transcript -------------------------------------------
  if ("error" in parsed && parsed.error === "transcript_corrupted") {
    return NextResponse.json(
      { error: "La transcripcion parece corrupta o incoherente" },
      { status: 422 },
    );
  }

  const { chapters } = parsed as ChaptersPayload;

  // --- Validate chapter positions --------------------------------------------
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
    return NextResponse.json(
      { error: "OpenAI no genero capitulos validos" },
      { status: 502 },
    );
  }

  // --- Delete existing generated chapters and insert new ones ----------------
  const admin = createAdminClient();

  const { error: deleteError } = await admin
    .from("lesson_chapters")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("is_generated", true);

  if (deleteError) {
    console.error("lesson_chapters delete error:", deleteError);
    return NextResponse.json(
      { error: "Error al eliminar capitulos anteriores" },
      { status: 500 },
    );
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
    console.error("lesson_chapters insert error:", insertError);
    return NextResponse.json(
      { error: "Error al guardar los capitulos" },
      { status: 500 },
    );
  }

  return NextResponse.json({ chapters: inserted });
}
