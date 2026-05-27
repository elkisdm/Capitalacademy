import { NextResponse } from "next/server";
import { correctTranscript } from "@/lib/classroom/correct-transcript";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

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

  // --- Correct transcript ----------------------------------------------------
  try {
    const result = await correctTranscript(lessonId);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error desconocido";
    console.error("correct-transcript error:", message);

    const isNotFound =
      message.includes("No transcript found") ||
      message.includes("has no VTT content") ||
      message.includes("Parsed 0 segments");

    if (isNotFound) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    const isOpenAI = message.includes("OpenAI");
    if (isOpenAI) {
      return NextResponse.json(
        { error: "Error al comunicarse con OpenAI" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Error al corregir la transcripcion" },
      { status: 500 },
    );
  }
}
