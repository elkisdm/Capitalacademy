import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { generateLessonSummary } from "@/lib/classroom/generate-summary";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

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

  // --- Check OPENAI_API_KEY early --------------------------------------------
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY no esta configurada en el servidor" },
      { status: 500 },
    );
  }

  // --- Generate summary --------------------------------------------------------
  try {
    const summary = await generateLessonSummary(lessonId);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("generate-summary error:", message);

    if (message.startsWith("Lesson not found")) {
      return NextResponse.json(
        { error: "Leccion no encontrada" },
        { status: 404 },
      );
    }

    if (message.startsWith("No transcript found")) {
      return NextResponse.json(
        { error: "No hay transcripcion disponible para esta leccion" },
        { status: 404 },
      );
    }

    if (message.startsWith("transcript_corrupted")) {
      return NextResponse.json(
        { error: "La transcripcion parece corrupta o incoherente" },
        { status: 422 },
      );
    }

    const isOpenAI =
      message.startsWith("OpenAI") || message.includes("OpenAI API error");
    if (isOpenAI) {
      return NextResponse.json(
        { error: "Error al comunicarse con OpenAI" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Error al guardar el resumen" },
      { status: 500 },
    );
  }
}
