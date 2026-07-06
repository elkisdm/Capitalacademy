import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEvaluationAccess } from "@/lib/classroom/evaluation-access";
import { EvaluationRunner } from "@/components/classroom/evaluation/evaluation-runner";

export const metadata: Metadata = { title: "Evaluación" };

const SCOPE_LABEL: Record<string, string> = {
  final: "Evaluación final",
  module: "Evaluación de módulo",
  lesson: "Evaluación de clase",
};

/**
 * Página standalone de una evaluación, accesible por enlace/QR compartible
 * (`/classroom/quiz/<evaluationId>`). El proxy ya exige sesión y vuelve aquí
 * tras el login (`?next=`). Reusa el mismo guard de acceso que los endpoints
 * del alumno (evaluación activa + matrícula activa) y monta el runner formativo.
 */
export default async function SharedQuizPage(
  props: { params: Promise<{ evaluationId: string }> },
) {
  const { evaluationId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect(`/login?next=/classroom/quiz/${evaluationId}`);

  const admin = createAdminClient();
  const access = await resolveEvaluationAccess(supabase, admin, user.id, evaluationId);

  if (!access.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 md:px-8">
        <div className="ca-card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h1 className="mt-4 text-[20px] font-black tracking-tight text-ca-ink">
            Evaluación no disponible
          </h1>
          <p className="mt-1 text-[14px] text-ca-ink-soft">
            {access.status === 403
              ? "No tienes una inscripción activa en este programa."
              : "Esta evaluación no existe o aún no está disponible para los alumnos."}
          </p>
          <Link
            href="/classroom"
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors"
            style={{ background: "var(--color-ca-bg-soft)" }}
          >
            Ir al aula
          </Link>
        </div>
      </div>
    );
  }

  const ev = access.evaluation;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Link
        href="/classroom"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft hover:text-ca-ink"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Aula
      </Link>
      <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
        {SCOPE_LABEL[ev.scope] ?? "Evaluación"}
      </p>
      <div className="mt-3">
        <EvaluationRunner evaluationId={ev.id} title={ev.title} />
      </div>
    </div>
  );
}
