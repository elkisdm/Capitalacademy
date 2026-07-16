import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { getStudentGrades } from "@/lib/grades/queries";
import { GradesView } from "@/components/classroom/grades/grades-view";

export const metadata: Metadata = {
  title: "Notas · Capital Academy",
};

export default async function NotasPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();
  const program = cohort.programs as { id: string; name: string };

  const data = access.isStaff
    ? { groups: [], attendance: { pct: null, meetsRequirement: null } }
    : await getStudentGrades(cohortId, user.id);

  return (
    <div className="ca-fade-up mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-7">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
          <BarChart3 className="h-3.5 w-3.5" />
          Notas
        </div>
        <h1 className="text-[28px] font-black leading-tight tracking-tight text-ca-ink md:text-[34px]">
          Tus notas de {program.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
          Consolidado de las evaluaciones que tu profesor ya calificó y publicó.
        </p>
      </div>

      {access.isStaff ? (
        <div className="ca-card flex flex-col items-center justify-center p-8 text-center md:p-16">
          <p className="text-[14px] font-bold text-ca-ink">Vista de alumno</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Esta pantalla muestra las notas del alumno matriculado; el staff no tiene notas propias aquí.
          </p>
        </div>
      ) : (
        <GradesView data={data} />
      )}
    </div>
  );
}
