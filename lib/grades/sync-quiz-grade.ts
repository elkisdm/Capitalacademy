import type { createAdminClient } from "@/lib/supabase/admin";
import { pctToGrade, DEFAULT_EXIGENCIA_PCT } from "@/lib/grades/scale";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Sincroniza `evaluation_grades` desde los intentos de quiz de un alumno tras
 * cerrar un intento (submit). B4 del brief: vale el MEJOR intento completado.
 * Auto-publica (las notas de quiz no pasan por borrador — B3).
 *
 * Best-effort: si algo falla, se registra en consola pero NO revienta el
 * submit del alumno (la nota de registro académico es secundaria al puntaje
 * del intento, que ya quedó guardado en `quiz_attempts`).
 *
 * NUNCA pisa una nota cargada manualmente por el profe (`source='manual'`):
 * si ya existe una fila con ese origen para este par evaluación/matrícula, se
 * omite en silencio (R7 del brief, espejado del guard del script de backfill).
 */
export async function syncQuizGrade(
  admin: AdminClient,
  params: { evaluationId: string; programId: string; enrollmentId: string },
): Promise<void> {
  const { evaluationId, programId, enrollmentId } = params;

  try {
    const { data: attempts } = await admin
      .from("quiz_attempts")
      .select("id, score_pct")
      .eq("evaluation_id", evaluationId)
      .eq("enrollment_id", enrollmentId)
      .not("completed_at", "is", null)
      .not("score_pct", "is", null);

    if (!attempts || attempts.length === 0) return;

    const best = attempts.reduce((a, b) => ((b.score_pct ?? -1) > (a.score_pct ?? -1) ? b : a));
    if (best.score_pct == null) return;

    const { data: existing } = await admin
      .from("evaluation_grades")
      .select("source")
      .eq("evaluation_id", evaluationId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    if (existing && existing.source === "manual") return;

    const { data: program } = await admin
      .from("programs")
      .select("grade_exigencia_pct")
      .eq("id", programId)
      .single();
    const exigencia = program?.grade_exigencia_pct ?? DEFAULT_EXIGENCIA_PCT;

    const grade = pctToGrade(best.score_pct, exigencia);

    await admin.from("evaluation_grades").upsert(
      {
        evaluation_id: evaluationId,
        enrollment_id: enrollmentId,
        grade,
        score_pct: best.score_pct,
        source: "quiz",
        quiz_attempt_id: best.id,
        published_at: new Date().toISOString(),
      },
      { onConflict: "evaluation_id,enrollment_id" },
    );
  } catch (err) {
    console.error("syncQuizGrade falló (best-effort, no bloquea el submit):", err);
  }
}
