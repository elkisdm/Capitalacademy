import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

const PROMPT_VERSION = 1;

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
    model: "gpt-5.4-mini",
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

  // --- Fetch lesson ----------------------------------------------------------
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json(
      { error: "Leccion no encontrada" },
      { status: 404 },
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

      if (isOpenAIError) {
        console.error("OpenAI API error:", (err as Error).message);
        return NextResponse.json(
          { error: "Error al comunicarse con OpenAI" },
          { status: 502 },
        );
      }

      if (isParseError && attempts < 2) {
        // Retry once on invalid JSON
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

  const summary = parsed as SummaryPayload;

  // --- Upsert into lesson_summaries using admin client -----------------------
  const admin = createAdminClient();

  // Check existing record to increment generation_count
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
        model_used: "gpt-5.4-mini",
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
    console.error("lesson_summaries upsert error:", upsertError);
    return NextResponse.json(
      { error: "Error al guardar el resumen" },
      { status: 500 },
    );
  }

  return NextResponse.json(upserted);
}
