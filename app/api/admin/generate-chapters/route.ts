import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { generateLessonChapters } from "@/lib/classroom/generate-chapters";

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

  // --- Generate chapters -------------------------------------------------------
  try {
    const chapters = await generateLessonChapters(lessonId);
    return NextResponse.json({ chapters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("generate-chapters error:", message);

    if (message.startsWith("Lesson not found")) {
      return NextResponse.json(
        { error: "Leccion no encontrada" },
        { status: 404 },
      );
    }

    if (message.includes("no video duration")) {
      return NextResponse.json(
        { error: "La leccion no tiene duracion de video registrada" },
        { status: 422 },
      );
    }

    if (message.startsWith("No transcript found")) {
      return NextResponse.json(
        { error: "No hay transcripcion disponible para esta leccion" },
        { status: 404 },
      );
    }

    if (message === "transcript_corrupted") {
      return NextResponse.json(
        { error: "La transcripcion parece corrupta o incoherente" },
        { status: 422 },
      );
    }

    if (message.startsWith("transcript_degraded")) {
      return NextResponse.json(
        {
          error:
            "La transcripcion automatica quedo incompleta: gran parte son marcadores de sonido ([Musica]) en vez del audio de la clase. Hay que regenerarla antes de crear capitulos.",
        },
        { status: 422 },
      );
    }

    if (message.includes("no genero capitulos validos")) {
      return NextResponse.json(
        { error: "OpenAI no genero capitulos validos" },
        { status: 502 },
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
      { error: "Error al guardar los capitulos" },
      { status: 500 },
    );
  }
}
