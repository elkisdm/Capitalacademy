/**
 * Backfill de `evaluation_grades` (source='quiz') desde los intentos de quiz
 * ya rendidos, para evaluaciones existentes ANTES de esta migración.
 *
 * Uso:
 *   npx tsx scripts/backfill-quiz-grades.mts --dry-run   (solo reporta, no escribe)
 *   npx tsx scripts/backfill-quiz-grades.mts             (escribe)
 *
 * Reglas (brief docs/briefs/evaluaciones-y-notas-1-7.md, Paso 5 / R7 / A6):
 *   - Vale el MEJOR intento COMPLETADO por (evaluation_id, enrollment_id) — B4.
 *   - Idempotente: se puede re-correr sin duplicar (upsert por unique
 *     (evaluation_id, enrollment_id)).
 *   - NUNCA pisa una nota `source='manual'` ya cargada por el profe (R7).
 *   - Auto-publica (las notas de quiz no pasan por borrador — B3).
 *   - PRECONDICIÓN BLOQUEANTE (A6): antes de correr esto en un entorno con
 *     datos reales, confirmar que el quiz "dominio de crédito" (R13 del
 *     brief) fue corregido — este script convierte `score_pct` históricos en
 *     notas 1-7 oficiales y publicadas. Si no hay confirmación, NO correr sin
 *     --dry-run primero y revisar el reporte con criterio.
 *
 * Rollback: `delete from evaluation_grades where source = 'quiz';`
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const scriptDir = new URL(".", import.meta.url).pathname;
const envPath = resolve(scriptDir, "..", ".env");
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env ausente: se asume que las env vars ya están en el entorno (CI, shell).
}

const DEFAULT_EXIGENCIA_PCT = 60;

function pctToGrade(pct: number, exigenciaPct: number = DEFAULT_EXIGENCIA_PCT): number {
  const p = Math.min(100, Math.max(0, pct));
  const e = exigenciaPct;
  const grade = p < e ? 1 + 3 * (p / e) : 4 + 3 * ((p - e) / (100 - e));
  return Math.round(Math.min(7, Math.max(1, grade)) * 10) / 10;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log(dryRun ? "=== DRY RUN (no se escribe nada) ===\n" : "=== Backfill de notas de quiz ===\n");

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("id, evaluation_id, enrollment_id, score_pct")
    .not("evaluation_id", "is", null)
    .not("completed_at", "is", null)
    .not("score_pct", "is", null);

  if (attemptsError) {
    console.error("Error obteniendo intentos:", attemptsError.message);
    process.exit(1);
  }
  if (!attempts || attempts.length === 0) {
    console.log("No hay intentos completados para procesar.");
    return;
  }

  // Mejor intento por (evaluation_id, enrollment_id) — B4.
  type Best = { attemptId: string; scorePct: number };
  const bestByKey = new Map<string, Best>();
  for (const a of attempts) {
    const key = `${a.evaluation_id}::${a.enrollment_id}`;
    const current = bestByKey.get(key);
    if (!current || (a.score_pct as number) > current.scorePct) {
      bestByKey.set(key, { attemptId: a.id, scorePct: a.score_pct as number });
    }
  }

  console.log(`${bestByKey.size} pares evaluación/matrícula con intento completado.\n`);

  // Programas → exigencia, cacheado.
  const exigenciaByProgram = new Map<string, number>();
  async function getExigencia(evaluationId: string): Promise<number | null> {
    const { data: evaluation } = await supabase
      .from("evaluations")
      .select("program_id")
      .eq("id", evaluationId)
      .maybeSingle();
    if (!evaluation) return null;
    if (!exigenciaByProgram.has(evaluation.program_id)) {
      const { data: program } = await supabase
        .from("programs")
        .select("grade_exigencia_pct")
        .eq("id", evaluation.program_id)
        .maybeSingle();
      exigenciaByProgram.set(evaluation.program_id, program?.grade_exigencia_pct ?? DEFAULT_EXIGENCIA_PCT);
    }
    return exigenciaByProgram.get(evaluation.program_id)!;
  }

  let created = 0;
  let updated = 0;
  let skippedManual = 0;
  let skippedNoEvaluation = 0;

  for (const [key, best] of bestByKey) {
    const [evaluationId, enrollmentId] = key.split("::");

    const { data: existing } = await supabase
      .from("evaluation_grades")
      .select("id, source")
      .eq("evaluation_id", evaluationId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();

    if (existing && existing.source === "manual") {
      skippedManual++;
      continue;
    }

    const exigencia = await getExigencia(evaluationId);
    if (exigencia == null) {
      skippedNoEvaluation++;
      continue;
    }

    const grade = pctToGrade(best.scorePct, exigencia);
    const isNew = !existing;

    console.log(
      `${isNew ? "[crear]" : "[actualizar]"} evaluation=${evaluationId} enrollment=${enrollmentId} score_pct=${best.scorePct} → nota=${grade}`,
    );

    if (!dryRun) {
      const { error: upsertError } = await supabase.from("evaluation_grades").upsert(
        {
          evaluation_id: evaluationId,
          enrollment_id: enrollmentId,
          grade,
          score_pct: best.scorePct,
          source: "quiz",
          quiz_attempt_id: best.attemptId,
          published_at: new Date().toISOString(),
        },
        { onConflict: "evaluation_id,enrollment_id" },
      );
      if (upsertError) {
        console.error(`  Error: ${upsertError.message}`);
        continue;
      }
    }

    if (isNew) created++;
    else updated++;
  }

  console.log("\n=== Resumen ===");
  console.log(`Creadas:  ${created}`);
  console.log(`Actualizadas: ${updated}`);
  console.log(`Omitidas (nota manual existente): ${skippedManual}`);
  console.log(`Omitidas (evaluación no encontrada): ${skippedNoEvaluation}`);
  if (dryRun) console.log("\n(Dry run — nada se escribió. Vuelve a correr sin --dry-run para aplicar.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
