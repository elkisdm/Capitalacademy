import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getEnrollmentForUser,
  getCohortWithProgram,
  getModulesWithLessons,
} from "@/lib/classroom/queries";
import { calculateModuleProgress, getLessonStatus } from "@/lib/classroom/progress";
import {
  BrandShapes,
  StatusPill,
  ProgressBar,
  Avatar,
} from "@/components/classroom/primitives";
import type { ModuleWithLessons, LessonWithProgress } from "@/lib/classroom/types";

function fmtUnlock(iso: string) {
  const d = new Date(iso);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function ModuleCard({ mod, cohortId }: { mod: ModuleWithLessons; cohortId: string }) {
  const progress = calculateModuleProgress(mod.lessons);
  const isLocked = mod.lessons.length > 0 && mod.lessons.every((l) => l.unlock_at && new Date(l.unlock_at) > new Date());
  const hasProgress = progress.percentage > 0;
  const isCompleted = progress.percentage === 100 && progress.total_with_video > 0;
  const status = isCompleted ? "completed" : hasProgress ? "in_progress" : isLocked ? "locked" : "available";

  const thumb = mod.position % 3 === 1 ? "thumb-diplomado" : mod.position % 3 === 2 ? "thumb-liderazgo" : "thumb-ruta";

  return (
    <Link
      href={isLocked ? "#" : `/classroom/${cohortId}/${mod.id}`}
      className={`ca-card ca-card-hoverable group relative overflow-hidden ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
      aria-disabled={isLocked}
      tabIndex={isLocked ? -1 : undefined}
    >
      <BrandShapes variant="corner-violet" />
      <div className="relative grid gap-5 p-5 md:grid-cols-[200px_1fr] md:p-6">
        <div className="relative">
          <div
            className={`relative aspect-video w-full overflow-hidden ${thumb}`}
            style={{ borderRadius: 16, filter: isLocked ? "grayscale(0.6) brightness(0.7)" : "none" }}
          >
            <div className="shape-circle absolute -right-6 -top-6 h-20 w-20 bg-white/30" />
            <div className="shape-circle absolute -bottom-4 -left-4 h-16 w-16 bg-ca-lime opacity-85" />
            <div className="shape-circle absolute bottom-4 right-4 h-3 w-3 bg-white" />
            <div className="absolute inset-0 flex items-end p-4">
              <div className="font-black leading-none text-white" style={{ fontSize: 56, letterSpacing: "-0.04em", textShadow: "0 4px 24px rgba(0,0,0,0.25)" }}>
                {String(mod.position).padStart(2, "0")}
              </div>
            </div>
            {isLocked && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                <span>Módulo {String(mod.position).padStart(2, "0")}</span>
                <span className="opacity-40">·</span>
                <span>{mod.lessons.length} lecciones</span>
              </div>
              <h3 className="text-[20px] font-extrabold leading-tight tracking-tight text-ca-ink">
                {mod.title}
              </h3>
              {mod.description && (
                <p className="mt-1 text-[13px] leading-snug text-ca-ink-soft">
                  {mod.description}
                </p>
              )}
            </div>
            <StatusPill status={status} />
          </div>

          {mod.teacher?.full_name && (
            <div className="flex items-center gap-2.5 border-t border-ca-ink/[0.08] pt-3">
              <Avatar
                initials={mod.teacher.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                size={32}
              />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[12px] font-bold text-ca-ink">{mod.teacher.full_name}</div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">Profesor</div>
              </div>
            </div>
          )}

          <div className="mt-auto">
            {isLocked ? (
              <div className="flex items-center gap-2 rounded-xl bg-ca-bg-soft p-3 text-[12px] font-semibold text-ca-ink-soft">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
                Se desbloquea el <span className="text-ca-ink">{fmtUnlock(mod.lessons[0]?.unlock_at ?? "")}</span>
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-ca-ink-soft">
                  <span>{progress.completed_lessons} de {progress.total_lessons} lecciones</span>
                  <span className={`font-mono font-bold ${isCompleted ? "text-[#3f5a05]" : "text-ca-ink"}`}>
                    {progress.percentage}%
                  </span>
                </div>
                <ProgressBar value={progress.percentage} completed={isCompleted} />
              </div>
            )}

            {!isLocked && (
              <span className={`mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] ${isCompleted ? "text-ca-ink-soft" : "text-ca-violet"}`}>
                {isCompleted ? "Repasar módulo" : hasProgress ? "Continuar" : "Comenzar"}
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function CohortDashboardPage(
  props: { params: Promise<{ cohortId: string }> },
) {
  const { cohortId } = await props.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const enrollment = await getEnrollmentForUser(user.id, cohortId);
  if (!enrollment) notFound();

  const cohort = await getCohortWithProgram(cohortId);
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string; code: string; description: string | null; total_modules: number | null };
  const modules = await getModulesWithLessons(program.id, enrollment.id);

  const totalModules = modules.length;
  const completedModules = modules.filter((m) => {
    const p = calculateModuleProgress(m.lessons);
    return p.percentage === 100 && p.total_with_video > 0;
  }).length;
  const overallPct = totalModules > 0
    ? Math.round(modules.reduce((s, m) => s + calculateModuleProgress(m.lessons).percentage, 0) / totalModules)
    : 0;

  const currentModule = modules.find((m) => {
    const p = calculateModuleProgress(m.lessons);
    return p.percentage > 0 && p.percentage < 100;
  });
  const currentLesson = currentModule?.lessons.find((l) => {
    const st = getLessonStatus(l);
    return st === "in_progress";
  });

  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-8">
      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, var(--color-ca-navy-ink) 0%, var(--color-ca-navy-deep) 70%, var(--color-ca-violet-deep) 100%)",
          borderRadius: 28,
        }}
      >
        <BrandShapes variant="hero" />
        <div className="relative grid gap-6 px-5 py-6 md:gap-10 md:px-10 md:py-10 md:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur">
              <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-lime" />
              {program.code} · {cohort.name}
            </div>
            <h1 className="text-[28px] font-black leading-[0.95] tracking-[-0.035em] md:text-[44px] lg:text-[56px]">
              {program.name}
            </h1>
            {program.description && (
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/75">
                {program.description}
              </p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {currentModule && currentLesson && (
                <Link
                  href={`/classroom/${cohortId}/${currentModule.id}/${currentLesson.id}`}
                  className="ca-btn-lime inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
                >
                  <svg width={16} height={16} viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>
                  Continuar viendo
                </Link>
              )}
            </div>
          </div>

          <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/65">Tu progreso</div>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-ca-lime)" strokeWidth="8"
                    strokeDasharray={`${overallPct * 2.764} 1000`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-[26px] font-black leading-none">
                    {overallPct}<span className="text-[14px] opacity-70">%</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[24px] font-black leading-tight">
                  {completedModules} <span className="opacity-50">/ {totalModules}</span>
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">módulos</div>
              </div>
            </div>
            <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalModules}, 1fr)` }}>
              {modules.map((m) => {
                const p = calculateModuleProgress(m.lessons);
                return (
                  <div key={m.id} className="flex flex-col items-center gap-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${p.percentage}%`,
                          background: p.percentage === 100 ? "var(--color-ca-lime)" : p.percentage > 0 ? "#fff" : "transparent",
                        }}
                      />
                    </div>
                    <div className="font-mono text-[10px] font-medium text-white/55">
                      {String(m.position).padStart(2, "0")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Up Next Strip */}
      {currentModule && currentLesson && (
        <section className="ca-card relative overflow-hidden" style={{ background: "var(--color-ca-ink)", borderColor: "transparent" }}>
          <div className="shape-circle absolute -right-10 -top-10 h-40 w-40 bg-ca-violet opacity-50" />
          <div className="shape-circle absolute right-24 top-8 h-3 w-3 bg-ca-lime" />
          <div className="relative grid gap-6 px-7 py-6 text-white md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">
                <span className="shape-circle ca-pulse h-1.5 w-1.5 bg-ca-lime" />
                Retomar donde lo dejaste
              </div>
              <h3 className="text-[22px] font-black leading-tight tracking-tight">
                {currentLesson.title}
              </h3>
              <div className="mt-1.5 text-[13px] font-semibold text-white/70">
                Módulo {currentModule.position} · {currentModule.title}
                {currentModule.teacher?.full_name && ` · con ${currentModule.teacher.full_name}`}
              </div>
              {currentLesson.video_progress && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="max-w-xs flex-1">
                    <ProgressBar
                      value={currentLesson.video_progress.watch_percentage}
                      track="bg-white/15"
                      color="bg-ca-lime"
                    />
                  </div>
                  <span className="font-mono text-[11px] font-bold text-white/85">
                    {Math.round(currentLesson.video_progress.watch_percentage)}%
                  </span>
                </div>
              )}
            </div>
            <Link
              href={`/classroom/${cohortId}/${currentModule.id}/${currentLesson.id}`}
              className="ca-btn-lime inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
            >
              <svg width={16} height={16} viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>
              Reanudar
            </Link>
          </div>
        </section>
      )}

      {/* Section header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            {totalModules === 1 ? "El módulo" : `Los ${totalModules} módulos`}
          </div>
          <h2 className="mt-1 text-[26px] font-black tracking-tight text-ca-ink">
            Tu ruta de aprendizaje
          </h2>
        </div>
      </div>

      {/* Module cards grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} mod={mod} cohortId={cohortId} />
        ))}
      </div>

      {/* Certificate band */}
      <div className="relative mt-4 overflow-hidden rounded-3xl bg-ca-lime px-8 py-10">
        <div className="shape-circle absolute -left-12 -top-12 h-40 w-40 bg-ca-violet" />
        <div className="shape-circle absolute right-8 top-1/2 h-12 w-12 -translate-y-1/2 bg-ca-ink" />
        <div className="relative max-w-2xl">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink">Tu certificado</div>
          <h3 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-ca-ink">
            {totalModules === 1
              ? "Completa el módulo y recibe tu certificado ejecutivo Capital Academy."
              : `Completa los ${totalModules} módulos y recibe tu certificado ejecutivo Capital Academy.`}
          </h3>
          <div className="mt-4 text-[13px] font-semibold text-ca-ink">
            {totalModules - completedModules === 1
              ? "Te queda 1 módulo"
              : `Te quedan ${totalModules - completedModules} módulos`}
          </div>
        </div>
      </div>
    </div>
  );
}
