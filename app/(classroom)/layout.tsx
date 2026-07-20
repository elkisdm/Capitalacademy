import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { ClassroomSidebar } from "@/components/classroom/sidebar";
import { getActiveEnv, getEnvOptions, getViewMode, type EnvOption, type ViewMode } from "@/lib/admin/active-env";
import { getActiveEnvCohortSlug } from "@/lib/classroom/staff-preview";
import {
  getCohortWithProgram,
  getActiveEnrollmentsForUser,
  getTeachingCohortsForUser,
  type ActiveEnrollmentProgram,
} from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { isEvaluationOpen } from "@/lib/classroom/evaluation-window";

export const metadata = {
  title: "Classroom",
};

export default async function ClassroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getViewerProfile(user.id);

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";

  if (profile && !profile.onboarding_completed_at && !isStaff) {
    redirect("/onboarding/complete-profile");
  }

  const name = profile?.full_name ?? user.email ?? "Alumno";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Entorno activo del switcher (solo staff). Se resuelve antes que el cohorte
  // para que la vista de alumno del staff siga el entorno elegido, no su matrícula.
  const activeEnv: string | null = isStaff ? await getActiveEnv() : null;

  // Resolve cohort slug + program name for the sidebar.
  // Prioridad: ruta URL > (staff) entorno activo > matrícula más reciente.
  let cohortSlug: string | undefined;
  let cohortLabel: string | undefined;
  let programId: string | undefined;

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const parts = pathname.split("/").filter(Boolean); // ['classroom', '<slug>', ...]
  // Sub-rutas que NO son slugs de cohorte: el sidebar debe seguir mostrando la
  // cohorte real del alumno (resuelta por su matrícula), no estas palabras.
  const RESERVED_SUBPATHS = new Set(["profile", "guia", "quiz"]);
  const cohortSlugFromPath =
    parts[0] === "classroom" && parts[1] && !RESERVED_SUBPATHS.has(parts[1])
      ? parts[1]
      : undefined;

  if (cohortSlugFromPath) {
    const resolvedCohortId = await resolveCohortSlug(cohortSlugFromPath);
    const cohortRow = resolvedCohortId
      ? await getCohortWithProgram(resolvedCohortId)
      : null;
    cohortSlug = cohortRow?.slug ?? cohortSlugFromPath;
    cohortLabel =
      (cohortRow?.programs as { name: string } | null)?.name ?? undefined;
    programId = cohortRow?.program_id ?? undefined;
  } else {
    // Sin slug en la ruta (dashboard /classroom): staff sigue el entorno activo;
    // el alumno (o staff sin entorno) cae a su matrícula más reciente.
    const previewSlug = await getActiveEnvCohortSlug(activeEnv);
    const { data: enrollment } = previewSlug
      ? { data: null }
      : await supabase
          .from("enrollments")
          .select("cohort_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .order("enrolled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    const target = previewSlug ?? enrollment?.cohort_id;
    if (target) {
      const { data: cohortRow } = await supabase
        .from("cohorts")
        .select("slug, program_id, programs(name)")
        .or(`slug.eq.${target},id.eq.${target}`)
        .maybeSingle();
      cohortSlug = cohortRow?.slug ?? target;
      cohortLabel =
        (cohortRow?.programs as { name: string } | null)?.name ?? undefined;
      programId = cohortRow?.program_id ?? undefined;
    }
  }

  // Evaluación final publicada Y dentro de ventana para el programa de la
  // cohorte activa: oculta el item "Quiz final" del sidebar cuando no hay
  // ninguna disponible (evita llevar a la pantalla "Próximamente"). Misma
  // condición que /api/classroom/quiz (pasos 4 y 5 van juntos).
  let hasFinalEvaluation = false;
  if (programId) {
    const { data: finalEval } = await supabase
      .from("evaluations")
      .select("id, is_active, opens_at, closes_at")
      .eq("program_id", programId)
      .eq("scope", "final")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    hasFinalEvaluation = !!finalEval && isEvaluationOpen(finalEval);
  }

  // Controles de staff (selector de entorno + modo de vista). Solo se cargan
  // para staff; un alumno puro no los ve.
  let envOptions: EnvOption[] = [];
  let viewMode: ViewMode = "admin";
  if (isStaff) {
    [envOptions, viewMode] = await Promise.all([
      getEnvOptions(),
      getViewMode(),
    ]);
  }

  // Docente/asistente (cohort_roles), para mostrar el link "Panel docente" en
  // el sidebar. El staff ya tiene su propia nav (admin), no necesita este check.
  let isTeacher = false;
  let teachingCohorts: ActiveEnrollmentProgram[] = [];
  if (!isStaff) {
    teachingCohorts = await getTeachingCohortsForUser(user.id);
    isTeacher = teachingCohorts.length > 0;
  }

  // "Mis programas" solo se muestra al alumno si tiene más de una matrícula
  // activa (staff siempre lo ve, vía la condición en el sidebar). Reutiliza la
  // misma fuente de verdad que /classroom usa para decidir si hay algo que elegir.
  let hasMultiplePrograms = false;
  // Mapa por-matrícula (slug/id → {label, hasFinalEvaluation}) para que el sidebar
  // resuelva label y "Quiz final" según la cohorte de la RUTA y no quede pegado a
  // la del primer render (el layout no se re-renderiza en navegación client-side).
  const cohortMap: Record<string, { label: string; hasFinalEvaluation: boolean }> = {};
  if (!isStaff) {
    const enrollments = await getActiveEnrollmentsForUser(user.id);
    const enrolledIds = new Set(enrollments.map((e) => e.cohortId));
    const extraTeaching = teachingCohorts.filter((t) => !enrolledIds.has(t.cohortId));
    hasMultiplePrograms = enrollments.length + extraTeaching.length > 1;

    // Evaluaciones finales activas y dentro de ventana de todos sus programas,
    // en una sola consulta.
    const programIds = [...new Set(enrollments.map((e) => e.programId))];
    const finalSet = new Set<string>();
    if (programIds.length > 0) {
      const { data: finals } = await supabase
        .from("evaluations")
        .select("program_id, is_active, opens_at, closes_at")
        .in("program_id", programIds)
        .eq("scope", "final")
        .eq("is_active", true);
      for (const f of finals ?? []) {
        if (isEvaluationOpen(f)) finalSet.add(f.program_id as string);
      }
    }

    for (const e of enrollments) {
      const info = { label: e.programName, hasFinalEvaluation: finalSet.has(e.programId) };
      // Se indexa por slug y por id: la URL puede traer cualquiera (compat legacy).
      if (e.cohortSlug) cohortMap[e.cohortSlug] = info;
      cohortMap[e.cohortId] = info;
    }

    for (const t of extraTeaching) {
      const info = { label: t.programName, hasFinalEvaluation: false };
      if (t.cohortSlug) cohortMap[t.cohortSlug] = info;
      cohortMap[t.cohortId] = info;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row md:h-screen" style={{ background: "var(--color-ca-bg)" }}>
      <ClassroomSidebar
        userInitials={initials}
        userName={name}
        userRole={sysRole ?? "user"}
        userAvatarUrl={profile?.avatar_url ?? null}
        cohortId={cohortSlug}
        cohortLabel={cohortLabel}
        showOps={isStaff}
        viewMode={viewMode}
        envOptions={envOptions}
        activeEnv={activeEnv}
        viewerId={user.id}
        isTeacher={isTeacher}
        hasFinalEvaluation={hasFinalEvaluation}
        hasMultiplePrograms={hasMultiplePrograms}
        cohortMap={cohortMap}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
