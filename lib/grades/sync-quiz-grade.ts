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
 * NUNCA pisa una nota que no sea de origen quiz (`source='manual'` o
 * `'import'`, ej. el Excel de notas reales de la profe): si ya existe una fila
 * con otro origen para este par evaluación/matrícula, se omite en silencio
 * (R7 del brief, espejado del guard del script de backfill — corrección M2).
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

    const { data: program } = await admin
      .from("programs")
      .select("grade_exigencia_pct")
      .eq("id", programId)
      .single();
    const exigencia = program?.grade_exigencia_pct ?? DEFAULT_EXIGENCIA_PCT;

    const grade = pctToGrade(best.score_pct, exigencia);
    const publishedAt = new Date().toISOString();

    // Update-donde-source='quiz' + insert-si-falta, en vez de upsert ciego
    // (corrección M3 de la revisión): un upsert por `onConflict` pisa
    // cualquier fila existente sin mirar su `source`, así que una nota manual
    // guardada entre nuestra lectura y nuestra escritura se perdía. El UPDATE
    // acotado a `source='quiz'` nunca toca una fila 'manual'/'import'; si no
    // actualiza ninguna fila (no existe aún, o existe con otro source), se
    // intenta el INSERT — que si choca con el unique (evaluation_id,
    // enrollment_id) porque alguien acaba de crear una fila 'manual'/'import'
    // en el medio, falla con 23505 y se descarta en silencio (mismo resultado
    // que "nunca pisar" — R7/M2).
    const { data: updated } = await admin
      .from("evaluation_grades")
      .update({
        grade,
        score_pct: best.score_pct,
        quiz_attempt_id: best.id,
        published_at: publishedAt,
      })
      .eq("evaluation_id", evaluationId)
      .eq("enrollment_id", enrollmentId)
      .eq("source", "quiz")
      .select("id");

    if (!updated || updated.length === 0) {
      const { error: insertError } = await admin.from("evaluation_grades").insert({
        evaluation_id: evaluationId,
        enrollment_id: enrollmentId,
        grade,
        score_pct: best.score_pct,
        source: "quiz",
        quiz_attempt_id: best.id,
        published_at: publishedAt,
      });
      // 23505 = unique_violation: alguien creó una fila 'manual'/'import' para
      // este par justo ahora — es el resultado correcto (no pisarla), no una falla.
      if (insertError && insertError.code !== "23505") throw insertError;
    }
  } catch (err) {
    console.error("syncQuizGrade falló (best-effort, no bloquea el submit):", err);
  }
}
