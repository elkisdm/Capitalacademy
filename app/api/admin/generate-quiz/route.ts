import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Eres un generador de preguntas de evaluación para un programa de educación ejecutiva en inversión inmobiliaria en Chile. Genera preguntas de opción múltiple que evalúen comprensión, NO memorización.

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "questions": [
    {
      "question_text": "...",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_option": "B",
      "explanation": "...",
      "lesson_title": "MasterClass X"
    }
  ]
}

Reglas:
- Genera entre 15 y 20 preguntas.
- Cada pregunta debe tener exactamente 4 opciones (A, B, C, D).
- correct_option debe ser una sola letra (A, B, C o D).
- explanation debe ser una oración concisa que justifique la respuesta correcta.
- lesson_title debe coincidir con el título de la lección de donde proviene la pregunta.
- Las preguntas deben evaluar comprensión de conceptos, análisis de situaciones y aplicación práctica, NO datos textuales de memoria.
- Escribe en español neutro latinoamericano.
- Distribuye las respuestas correctas de forma aproximadamente uniforme entre A, B, C y D. No concentres las respuestas correctas en una sola letra.`;

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface GeneratedQuestion {
  question_text: string;
  options: Record<string, string>;
  correct_option: string;
  explanation: string;
  lesson_title: string;
}

interface GeneratedPayload {
  questions: GeneratedQuestion[];
}

function shuffleOptions(question: GeneratedQuestion): GeneratedQuestion {
  const entries = Object.entries(question.options);
  const correctText = question.options[question.correct_option];

  // Fisher-Yates shuffle
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  const keys = ["A", "B", "C", "D"];
  const newOptions: Record<string, string> = {};
  let newCorrect = "A";

  entries.forEach(([, text], i) => {
    newOptions[keys[i]] = text;
    if (text === correctText) newCorrect = keys[i];
  });

  return {
    ...question,
    options: newOptions,
    correct_option: newCorrect,
  };
}

async function callOpenAI(transcriptBlock: string): Promise<GeneratedPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const requestBody = {
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `A partir de las siguientes transcripciones de clases, genera las preguntas de evaluación:\n\n${transcriptBlock}`,
      },
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

  return JSON.parse(content) as GeneratedPayload;
}

export async function POST(req: Request) {
  // --- Auth check: ops or admin only -----------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // --- Validate body ---------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { programId } = body as { programId?: string };
  if (!programId) {
    return NextResponse.json(
      { error: "programId es requerido" },
      { status: 422 },
    );
  }

  // --- Fetch all lesson transcripts for the program --------------------------
  const admin = createAdminClient();

  const { data: lessons, error: lessonsError } = await admin
    .from("lessons")
    .select(
      "id, title, program_modules!inner(program_id)",
    )
    .eq("program_modules.program_id", programId);

  if (lessonsError) {
    console.error("Error fetching lessons:", lessonsError);
    return NextResponse.json(
      { error: "Error al obtener lecciones del programa" },
      { status: 500 },
    );
  }

  if (!lessons || lessons.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron lecciones para este programa" },
      { status: 404 },
    );
  }

  const lessonIds = lessons.map((l) => l.id);

  const { data: transcripts, error: transcriptsError } = await admin
    .from("lesson_transcripts")
    .select("lesson_id, content_text")
    .in("lesson_id", lessonIds)
    .eq("status", "ready");

  if (transcriptsError) {
    console.error("Error fetching transcripts:", transcriptsError);
    return NextResponse.json(
      { error: "Error al obtener transcripciones" },
      { status: 500 },
    );
  }

  if (!transcripts || transcripts.length === 0) {
    return NextResponse.json(
      { error: "No hay transcripciones listas para este programa" },
      { status: 404 },
    );
  }

  // --- Build lesson title lookup and concatenate transcripts -----------------
  const lessonTitleMap = new Map<string, string>();
  const lessonIdByTitle = new Map<string, string>();
  for (const lesson of lessons) {
    lessonTitleMap.set(lesson.id, lesson.title);
    lessonIdByTitle.set(lesson.title.toLowerCase().trim(), lesson.id);
  }

  const transcriptBlock = transcripts
    .filter((t) => t.content_text)
    .map((t) => {
      const title = lessonTitleMap.get(t.lesson_id) ?? "Sin titulo";
      return `## ${title}\n\n${t.content_text}`;
    })
    .join("\n\n---\n\n");

  if (!transcriptBlock.trim()) {
    return NextResponse.json(
      { error: "Las transcripciones estan vacias" },
      { status: 422 },
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
  let parsed: GeneratedPayload;
  let attempts = 0;

  while (true) {
    attempts++;
    try {
      parsed = await callOpenAI(transcriptBlock);
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

  if (!parsed.questions || parsed.questions.length === 0) {
    return NextResponse.json(
      { error: "OpenAI no genero preguntas" },
      { status: 502 },
    );
  }

  // --- Check for incomplete quiz attempts before replacing questions ----------
  const { count: incompleteCount, error: incompleteError } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId)
    .is("completed_at", null);

  if (incompleteError) {
    console.error("Error checking incomplete attempts:", incompleteError);
    return NextResponse.json(
      { error: "Error al verificar intentos en curso" },
      { status: 500 },
    );
  }

  if (incompleteCount && incompleteCount > 0) {
    return NextResponse.json(
      {
        error: `Hay ${incompleteCount} intento(s) de quiz en curso. Espera a que terminen antes de regenerar las preguntas.`,
      },
      { status: 409 },
    );
  }

  // --- Delete existing generated questions for this program ------------------
  const { error: deleteError } = await admin
    .from("quiz_questions")
    .delete()
    .eq("program_id", programId)
    .eq("is_generated", true);

  if (deleteError) {
    console.error("Error deleting old questions:", deleteError);
    return NextResponse.json(
      { error: "Error al eliminar preguntas anteriores" },
      { status: 500 },
    );
  }

  // --- Shuffle options to eliminate LLM positional bias ----------------------
  const shuffledQuestions = parsed.questions.map(shuffleOptions);

  // --- Insert new questions, linking to lesson_id where possible -------------
  const questionsToInsert = shuffledQuestions.map((q, idx) => {
    const matchedLessonId =
      lessonIdByTitle.get(q.lesson_title.toLowerCase().trim()) ?? null;

    return {
      program_id: programId,
      lesson_id: matchedLessonId,
      question_text: q.question_text,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
      is_generated: true,
      sort_order: idx + 1,
    };
  });

  const { error: insertError } = await admin
    .from("quiz_questions")
    .insert(questionsToInsert);

  if (insertError) {
    console.error("Error inserting questions:", insertError);
    return NextResponse.json(
      { error: "Error al guardar las preguntas generadas" },
      { status: 500 },
    );
  }

  // --- Upsert quiz_configs with defaults if not exists -----------------------
  const { data: existingConfig } = await admin
    .from("quiz_configs")
    .select("id")
    .eq("program_id", programId)
    .single();

  if (!existingConfig) {
    const { error: configError } = await admin.from("quiz_configs").insert({
      program_id: programId,
      min_completion_pct: 80,
      passing_grade_pct: 70,
      questions_per_attempt: 10,
      max_attempts: 3,
      time_limit_minutes: null,
      is_active: true,
    });

    if (configError) {
      console.error("Error creating quiz_config:", configError);
      // Non-blocking: questions were already saved
    }
  }

  return NextResponse.json({
    generated: true,
    questionCount: questionsToInsert.length,
  });
}
