import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getTeacherGradableEvaluations } from "@/lib/docente/queries";
import { NotasDocenteClient } from "./notas-docente-client";

export const metadata = { title: "Calificar · Panel del profesor" };

/**
 * Panel de calificación del docente: notas 1-7 de sus propias cohortes.
 * Reusa `EvaluationGrades` (mismo componente que el admin), gateado por
 * `requireEvaluationStaff` en las APIs — el docente real vive en
 * `cohort_roles`, no en `system_role` (fix §0.7 del brief).
 */
export default async function DocenteNotasPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const evaluations = await getTeacherGradableEvaluations(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-5">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Panel del profesor
        </div>
        <h1 className="mt-1 text-[28px] font-black tracking-[-0.025em] text-ca-ink md:text-[34px]">Calificar</h1>
        <p className="mt-1 text-[14px] text-ca-ink-soft">
          Notas 1-7 de tus cohortes: quizzes y evaluaciones manuales (roleplay, guión de venta, etc).
        </p>
      </div>

      <NotasDocenteClient evaluations={evaluations} />
    </div>
  );
}
