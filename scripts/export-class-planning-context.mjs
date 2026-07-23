#!/usr/bin/env node

/**
 * Exporta un snapshot local, sanitizado y reproducible para planificación docente.
 *
 * Lectura: Supabase (service role).
 * Escritura: únicamente el directorio indicado por --out-dir.
 * No exporta transcripciones completas, IDs de alumnos ni IDs de matrículas.
 *
 * Uso:
 *   node --env-file=.env scripts/export-class-planning-context.mjs \
 *     --out-dir ../capital-context/academia/snapshots \
 *     --as-of 2026-07-21
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const PAGE_SIZE = 1000;
const SCHEMA_VERSION = "1.0.0";

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const asOf = readArg("--as-of", new Date().toISOString().slice(0, 10));
const outDir = path.resolve(readArg("--out-dir", "../capital-context/academia/snapshots"));

if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  throw new Error("--as-of debe tener formato YYYY-MM-DD");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll(table, selection, { optional = false } = {}) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(selection)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (optional) return { rows: [], warning: `${table}: ${error.message}` };
      throw new Error(`${table}: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, warning: null };
}

function byPositionThenTitle(a, b) {
  return (
    (a.position ?? 0) - (b.position ?? 0) ||
    String(a.title ?? a.name).localeCompare(String(b.title ?? b.name), "es")
  );
}

function compactText(value, limit = 280) {
  if (!value) return "";
  const clean = String(value)
    .replace(/https?:\/\/\S+/gi, "[enlace omitido]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[correo omitido]")
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}-[0-9kK]\b/g, "[RUT omitido]")
    .replace(/\b(?:\+?56[\s.-]?)?9(?:[\s.-]?\d){8}\b/g, "[teléfono omitido]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function wordCount(text) {
  return compactText(text, Number.MAX_SAFE_INTEGER).split(/\s+/).filter(Boolean).length;
}

function secondsToTimestamp(seconds = 0) {
  const rounded = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return hours > 0
    ? [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

function timestampToSeconds(value) {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function parseVtt(vtt) {
  if (!vtt) return [];
  const cues = [];
  const blocks = String(vtt)
    .replace(/^WEBVTT[^\n]*\n/i, "")
    .split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [start, end] = lines[timingIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const text = compactText(
      lines
        .slice(timingIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, ""),
      320,
    );
    if (text)
      cues.push({
        startSeconds: timestampToSeconds(start),
        endSeconds: timestampToSeconds(end),
        text,
      });
  }
  return cues;
}

function evidenceFromChapters(chapters, vtt, limit = 6) {
  const cues = parseVtt(vtt);
  if (!cues.length) return [];
  return chapters.slice(0, limit).map((chapter) => {
    const start = Number(chapter.position_seconds) || 0;
    let index = cues.findIndex((cue) => cue.endSeconds >= start);
    if (index < 0) index = Math.max(0, cues.length - 1);
    const useful = cues.slice(index).filter((cue) => {
      const spoken = cue.text
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\([^\)]+\)/g, "")
        .trim();
      return spoken.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").length >= 24;
    });
    const firstCue = useful[0] ?? cues[index];
    const excerpt = compactText(
      useful
        .slice(0, 3)
        .map((cue) => cue.text)
        .join(" ") || firstCue.text,
      280,
    );
    return {
      timestamp: secondsToTimestamp(firstCue.startSeconds),
      seconds: firstCue.startSeconds,
      topic: compactText(chapter.title, 100),
      excerpt,
      note: "Fragmento automático para localización; verificar audio antes de citar textualmente.",
    };
  });
}

function questionLike(text) {
  return /\?|\b(c[oó]mo|cu[aá]l|por qu[eé]|d[oó]nde|cu[aá]ndo|no entiendo|duda|alguien sabe|qu[eé] significa)\b/i.test(
    text ?? "",
  );
}

function average(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  return numeric.length
    ? Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(1))
    : null;
}

function percentage(trueCount, total) {
  return total ? Number(((trueCount / total) * 100).toFixed(1)) : null;
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function mdCell(value) {
  return String(value ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function summaryKeyPoints(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    compactText(
      typeof item === "string" ? item : (item?.text ?? item?.title ?? JSON.stringify(item)),
      220,
    ),
  );
}

const results = await Promise.all([
  fetchAll("programs", "id,code,name,description,total_modules,is_active"),
  fetchAll("program_modules", "id,program_id,position,code,title,description"),
  fetchAll(
    "lessons",
    "id,module_id,position,title,description,kind,duration_minutes,video_duration_seconds,mux_asset_id",
  ),
  fetchAll(
    "lesson_transcripts",
    "id,lesson_id,status,language,generated_at,content_text,content_vtt,corrected_text,corrected_vtt,correction_status,segments_needing_review",
  ),
  fetchAll(
    "lesson_summaries",
    "lesson_id,key_points,summary_text,glossary,model_used,prompt_version,is_manually_edited,generated_at",
  ),
  fetchAll("lesson_chapters", "lesson_id,position_seconds,title,sort_order,is_generated"),
  fetchAll("lesson_comments", "lesson_id,parent_id,content,created_at", { optional: true }),
  fetchAll("video_progress", "lesson_id,watch_percentage,completed,last_watched_at", {
    optional: true,
  }),
  fetchAll(
    "quiz_attempts",
    "program_id,evaluation_id,questions_presented,answers,score_pct,passed,completed_at",
    { optional: true },
  ),
  fetchAll(
    "evaluations",
    "id,program_id,scope,module_id,lesson_id,title,passing_grade_pct,is_active",
    { optional: true },
  ),
  fetchAll("evaluation_grades", "evaluation_id,grade,score_pct,published_at", { optional: true }),
  fetchAll(
    "quiz_questions",
    "id,program_id,evaluation_id,lesson_id,question_text,question_type,correct_option,correct_answer",
    { optional: true },
  ),
]);

const [
  programResult,
  moduleResult,
  lessonResult,
  transcriptResult,
  summaryResult,
  chapterResult,
  commentResult,
  progressResult,
  attemptResult,
  evaluationResult,
  gradeResult,
  questionResult,
] = results;
const warnings = results.map((result) => result.warning).filter(Boolean);

const modulesByProgram = groupBy(moduleResult.rows, "program_id");
const lessonsByModule = groupBy(lessonResult.rows, "module_id");
const transcriptsByLesson = new Map(transcriptResult.rows.map((row) => [row.lesson_id, row]));
const summariesByLesson = new Map(summaryResult.rows.map((row) => [row.lesson_id, row]));
const chaptersByLesson = groupBy(
  chapterResult.rows.sort((a, b) => a.sort_order - b.sort_order),
  "lesson_id",
);
const commentsByLesson = groupBy(commentResult.rows, "lesson_id");
const progressByLesson = groupBy(progressResult.rows, "lesson_id");
const attemptsByProgram = groupBy(
  attemptResult.rows.filter((row) => row.completed_at),
  "program_id",
);
const attemptsByEvaluation = groupBy(
  attemptResult.rows.filter((row) => row.completed_at),
  "evaluation_id",
);
const evaluationsById = new Map(evaluationResult.rows.map((row) => [row.id, row]));
const gradesByEvaluation = groupBy(
  gradeResult.rows.filter((row) => row.published_at),
  "evaluation_id",
);
const questionsByProgram = groupBy(questionResult.rows, "program_id");

function canonicalAnswer(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].map(String).sort());
  if (value === null || value === undefined) return "";
  return String(value).trim().toLocaleLowerCase("es");
}

function frequentErrors(programId) {
  const questions = questionsByProgram.get(programId) ?? [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const stats = new Map();
  for (const attempt of attemptsByProgram.get(programId) ?? []) {
    for (const questionId of attempt.questions_presented ?? []) {
      const question = questionById.get(questionId);
      if (!question) continue;
      const expected = question.correct_answer ?? question.correct_option;
      const given = attempt.answers?.[questionId];
      const current = stats.get(questionId) ?? { attempts: 0, correct: 0, question };
      current.attempts += 1;
      if (canonicalAnswer(given) === canonicalAnswer(expected)) current.correct += 1;
      stats.set(questionId, current);
    }
  }
  return [...stats.values()]
    .filter((item) => item.attempts >= 3)
    .map((item) => ({
      question: compactText(item.question.question_text, 280),
      sampleSize: item.attempts,
      correctRatePercentage: percentage(item.correct, item.attempts),
      evaluation: evaluationsById.get(item.question.evaluation_id)?.title ?? null,
      lessonSourceKey:
        item.question.lesson_id ??
        evaluationsById.get(item.question.evaluation_id)?.lesson_id ??
        null,
      interpretation:
        "Error observado en respuestas de quiz; no demuestra por sí solo la causa conceptual.",
    }))
    .sort(
      (a, b) => a.correctRatePercentage - b.correctRatePercentage || b.sampleSize - a.sampleSize,
    )
    .slice(0, 12);
}

const programs = programResult.rows
  .sort((a, b) => a.name.localeCompare(b.name, "es"))
  .map((program) => ({
    code: program.code,
    name: program.name,
    description: compactText(program.description, 500),
    active: program.is_active,
    modules: (modulesByProgram.get(program.id) ?? []).sort(byPositionThenTitle).map((module) => ({
      position: module.position,
      code: module.code,
      title: module.title,
      description: compactText(module.description, 500),
      lessons: (lessonsByModule.get(module.id) ?? []).sort(byPositionThenTitle).map((lesson) => {
        const transcript = transcriptsByLesson.get(lesson.id);
        const summary = summariesByLesson.get(lesson.id);
        const chapters = chaptersByLesson.get(lesson.id) ?? [];
        const progress = progressByLesson.get(lesson.id) ?? [];
        const questions = (commentsByLesson.get(lesson.id) ?? [])
          .filter((comment) => questionLike(comment.content))
          .slice(0, 12)
          .map((comment) => ({
            question: compactText(comment.content, 280),
            kind: comment.parent_id ? "reply" : "root",
            date: comment.created_at?.slice(0, 10) ?? null,
          }));
        const preferredText = transcript?.corrected_text || transcript?.content_text || "";
        const preferredVtt = transcript?.corrected_vtt || transcript?.content_vtt || "";

        return {
          sourceKey: lesson.id,
          position: lesson.position,
          title: lesson.title,
          description: compactText(lesson.description, 500),
          kind: lesson.kind,
          durationMinutes:
            lesson.duration_minutes ??
            (lesson.video_duration_seconds ? Math.round(lesson.video_duration_seconds / 60) : null),
          hasMuxVideo: Boolean(lesson.mux_asset_id),
          transcript: transcript
            ? {
                status: transcript.status,
                language: transcript.language,
                generatedAt: transcript.generated_at,
                wordCount: wordCount(preferredText),
                correctionStatus: transcript.correction_status,
                segmentsNeedingReview: transcript.segments_needing_review ?? 0,
                sourceUsed: transcript.corrected_text ? "corrected" : "raw",
              }
            : null,
          summary: summary
            ? {
                text: compactText(summary.summary_text, 1400),
                keyPoints: summaryKeyPoints(summary.key_points),
                glossary: Array.isArray(summary.glossary) ? summary.glossary.slice(0, 20) : [],
                model: summary.model_used,
                promptVersion: summary.prompt_version,
                manuallyEdited: summary.is_manually_edited,
                generatedAt: summary.generated_at,
              }
            : null,
          chapters: chapters.map((chapter) => ({
            timestamp: secondsToTimestamp(chapter.position_seconds),
            seconds: chapter.position_seconds,
            title: chapter.title,
          })),
          evidence: evidenceFromChapters(chapters, preferredVtt),
          observedQuestions: questions,
          learningSignals: {
            videoProgress: progress.length
              ? {
                  sampleSize: progress.length,
                  averageWatchPercentage: average(progress.map((row) => row.watch_percentage)),
                  completionRatePercentage: percentage(
                    progress.filter((row) => row.completed).length,
                    progress.length,
                  ),
                  caveat:
                    "Mide registros de progreso, no atención, comprensión ni abandono por minuto.",
                }
              : null,
            questionCommentCount: questions.length,
          },
        };
      }),
    })),
    assessmentSignals: (() => {
      const attempts = attemptsByProgram.get(program.id) ?? [];
      const evaluations = evaluationResult.rows.filter((row) => row.program_id === program.id);
      const publishedGrades = evaluations.flatMap(
        (evaluation) => gradesByEvaluation.get(evaluation.id) ?? [],
      );
      return {
        completedQuizAttempts: attempts.length
          ? {
              sampleSize: attempts.length,
              averageScorePercentage: average(attempts.map((row) => row.score_pct)),
              passRatePercentage: percentage(
                attempts.filter((row) => row.passed).length,
                attempts.length,
              ),
              caveat:
                "Puede incluir varios intentos de una misma persona; no equivale a una muestra independiente.",
            }
          : null,
        publishedEvaluationGrades: publishedGrades.length
          ? {
              sampleSize: publishedGrades.length,
              averageGrade: average(publishedGrades.map((row) => row.grade)),
              averageScorePercentage: average(publishedGrades.map((row) => row.score_pct)),
            }
          : null,
        evaluations: evaluations.map((evaluation) => ({
          ...(() => {
            const attempts = attemptsByEvaluation.get(evaluation.id) ?? [];
            const grades = gradesByEvaluation.get(evaluation.id) ?? [];
            return {
              completedAttemptCount: attempts.length,
              averageAttemptScorePercentage: average(attempts.map((row) => row.score_pct)),
              attemptPassRatePercentage: percentage(
                attempts.filter((row) => row.passed).length,
                attempts.length,
              ),
              averagePublishedGrade: average(grades.map((row) => row.grade)),
              averagePublishedScorePercentage: average(grades.map((row) => row.score_pct)),
            };
          })(),
          title: evaluation.title,
          scope: evaluation.scope,
          active: evaluation.is_active,
          passingGradePercentage: evaluation.passing_grade_pct,
          publishedGradeCount: (gradesByEvaluation.get(evaluation.id) ?? []).length,
        })),
        frequentQuizErrors: frequentErrors(program.id),
      };
    })(),
  }));

const allLessons = programs.flatMap((program) =>
  program.modules.flatMap((module) => module.lessons),
);
const transcribedLessons = allLessons.filter((lesson) => lesson.transcript?.status === "ready");

const snapshot = {
  schemaVersion: SCHEMA_VERSION,
  asOf,
  generatedAt: new Date().toISOString(),
  source: {
    system: "CapitalAcademy / Supabase",
    purpose: "Planificación docente cross-repo",
    extractionMode: "read-only",
  },
  privacy: {
    rawTranscriptsIncluded: false,
    studentIdentifiersIncluded: false,
    enrollmentIdentifiersIncluded: false,
    commentAuthorIdentifiersIncluded: false,
    sanitization: "Correos, teléfonos, RUT y enlaces se redactan en fragmentos exportados.",
  },
  limitations: [
    "Las transcripciones muestran lo dicho en clase; no demuestran comprensión del alumno.",
    "Los resúmenes son generados por IA y deben contrastarse con los fragmentos y el audio.",
    "El progreso de video no mide atención ni comprensión.",
    "Comentarios y evaluaciones pueden ser escasos y sufrir sesgo de selección.",
    "Los fragmentos automáticos sirven para localizar evidencia, no para publicar citas textuales.",
  ],
  warnings,
  metrics: {
    programs: programs.length,
    modules: programs.reduce((sum, program) => sum + program.modules.length, 0),
    lessons: allLessons.length,
    lessonsWithMuxVideo: allLessons.filter((lesson) => lesson.hasMuxVideo).length,
    readyTranscripts: transcribedLessons.length,
    transcriptWords: transcribedLessons.reduce(
      (sum, lesson) => sum + (lesson.transcript?.wordCount ?? 0),
      0,
    ),
    correctedTranscripts: transcribedLessons.filter(
      (lesson) => lesson.transcript?.sourceUsed === "corrected",
    ).length,
    transcriptsPendingCorrection: transcribedLessons.filter(
      (lesson) => lesson.transcript?.correctionStatus !== "corrected",
    ).length,
    segmentsNeedingReview: transcribedLessons.reduce(
      (sum, lesson) => sum + (lesson.transcript?.segmentsNeedingReview ?? 0),
      0,
    ),
    observedQuestionComments: allLessons.reduce(
      (sum, lesson) => sum + lesson.observedQuestions.length,
      0,
    ),
  },
  programs,
};

function renderMarkdown(data) {
  const lines = [
    `# Snapshot CapitalAcademy para planificación docente`,
    "",
    `**Corte:** ${data.asOf}  `,
    `**Esquema:** ${data.schemaVersion}  `,
    `**Fuente:** ${data.source.system} (lectura solamente)`,
    "",
    "## Alcance y privacidad",
    "",
    "Este snapshot conserva el mapa curricular, resúmenes, fragmentos localizables y señales agregadas. No contiene transcripciones completas ni identificadores de alumnos o matrículas.",
    "",
    "## Métricas del corpus",
    "",
    "| Métrica | Valor |",
    "|---|---:|",
    ...Object.entries(data.metrics).map(([key, value]) => `| ${mdCell(key)} | ${mdCell(value)} |`),
    "",
    "## Límites de interpretación",
    "",
    ...data.limitations.map((item) => `- ${item}`),
    "",
  ];

  for (const program of data.programs) {
    lines.push(`# ${program.name}`, "", program.description || "Sin descripción.", "");
    for (const module of program.modules) {
      lines.push(`## M${module.position}. ${module.title}`, "");
      if (module.description) lines.push(module.description, "");
      for (const lesson of module.lessons) {
        lines.push(`### ${module.position}.${lesson.position} ${lesson.title}`, "");
        lines.push(`- Duración: ${lesson.durationMinutes ?? "sin dato"} min`);
        lines.push(
          `- Transcripción: ${lesson.transcript ? `${lesson.transcript.wordCount.toLocaleString("es-CL")} palabras; ${lesson.transcript.sourceUsed}; ${lesson.transcript.segmentsNeedingReview} segmentos por revisar` : "no disponible"}`,
        );
        if (lesson.summary?.text) lines.push(`- Resumen: ${lesson.summary.text}`);
        if (lesson.summary?.keyPoints.length) {
          lines.push("- Puntos clave:", ...lesson.summary.keyPoints.map((point) => `  - ${point}`));
        }
        if (lesson.evidence.length) {
          lines.push(
            "- Fragmentos localizables:",
            ...lesson.evidence.map(
              (item) => `  - **${item.timestamp} — ${item.topic}:** ${item.excerpt}`,
            ),
          );
        }
        if (lesson.observedQuestions.length) {
          lines.push(
            "- Preguntas observadas en comentarios:",
            ...lesson.observedQuestions.map((item) => `  - ${item.question}`),
          );
        }
        const progress = lesson.learningSignals.videoProgress;
        if (progress)
          lines.push(
            `- Progreso de video (n=${progress.sampleSize}): promedio ${progress.averageWatchPercentage}%; completitud ${progress.completionRatePercentage}%.`,
          );
        lines.push("");
      }
    }
  }

  if (data.warnings.length)
    lines.push(
      "## Advertencias de extracción",
      "",
      ...data.warnings.map((warning) => `- ${warning}`),
      "",
    );
  lines.push(
    "---",
    "",
    "Generado por `scripts/export-class-planning-context.mjs`. Los fragmentos deben verificarse contra el audio antes de citarlos.",
    "",
  );
  return lines.join("\n");
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

await mkdir(outDir, { recursive: true });
const baseName = `${asOf}-capitalacademy`;
const jsonPath = path.join(outDir, `${baseName}.json`);
const markdownPath = path.join(outDir, `${baseName}.md`);
await atomicWrite(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await atomicWrite(markdownPath, renderMarkdown(snapshot));

console.log(
  JSON.stringify({ jsonPath, markdownPath, metrics: snapshot.metrics, warnings }, null, 2),
);
