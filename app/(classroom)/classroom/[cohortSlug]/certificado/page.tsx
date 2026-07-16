import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getEnrollmentForUser, getCohortWithProgram } from "@/lib/classroom/queries";
import { getCertificateSignedUrl } from "@/lib/certificates/get-certificate-url";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { CertView } from "@/components/classroom/cert-view";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: "Tu certificado",
};

export default async function CertificadoPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;

  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const supabase = await createClient();
  const { data: { user } } = await getAuthUser();
  if (!user) redirect("/login");

  const enrollment = await getEnrollmentForUser(user.id, cohortId);
  if (!enrollment) notFound();

  const cohort = await getCohortWithProgram(cohortId);
  if (!cohort) notFound();

  const program = cohort.programs as {
    id: string;
    name: string;
    code: string;
    description: string | null;
    total_modules: number | null;
  };

  // Fetch certificate for this enrollment
  const { data: certificate } = await supabase
    .from("certificates")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .single();

  // No certificate yet — ¿aprobó el EXAMEN FINAL? (no un quiz formativo, que
  // comparte program_id pero no habilita certificado). Acotamos a scope='final'.
  if (!certificate) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: finalEval } = await createAdminClient()
      .from("evaluations")
      .select("id")
      .eq("program_id", program.id)
      .eq("scope", "final")
      .eq("is_active", true)
      .maybeSingle();

    const { data: passedAttempt } = finalEval
      ? await supabase
          .from("quiz_attempts")
          .select("id")
          .eq("enrollment_id", enrollment.id)
          .eq("evaluation_id", finalEval.id)
          .eq("passed", true)
          .maybeSingle()
      : { data: null };

    const quizPassed = !!passedAttempt;

    return (
      <div className="ca-fade-up mx-auto flex w-full max-w-[800px] flex-col items-center gap-6 px-4 py-16 text-center md:px-8">
        <div
          className="shape-circle grid h-20 w-20 place-items-center"
          style={{ background: "var(--color-ca-violet-mist)" }}
        >
          <svg
            width={36}
            height={36}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-ca-violet)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <h1 className="text-[28px] font-black tracking-tight text-ca-ink">
          {quizPassed ? "Certificado pendiente" : "No tienes certificado aún"}
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ca-ink-soft">
          {quizPassed
            ? "Aprobaste el quiz pero tu certificado aún no se ha generado. Puedes intentar generarlo ahora."
            : <>Para obtener tu certificado ejecutivo de <strong>{program.name}</strong>, necesitas completar el programa y aprobar el quiz final.</>
          }
        </p>
        {quizPassed ? (
          <RetryButton programId={program.id} />
        ) : (
          <Link
            href={`/classroom/${cohortSlug}`}
            className="ca-btn-lime inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver al programa
          </Link>
        )}
      </div>
    );
  }

  // Resolve score from linked quiz attempt
  let scorePct = 0;
  if (certificate.quiz_attempt_id) {
    const { data: attempt } = await supabase
      .from("quiz_attempts")
      .select("score_pct")
      .eq("id", certificate.quiz_attempt_id)
      .single();
    scorePct = Number(attempt?.score_pct) || 0;
  }

  return (
    <CertView
      studentName={certificate.student_name}
      programTitle={program.name}
      cohortName={`${cohort.name} · ${new Date(cohort.start_date).getFullYear()}`}
      verificationCode={certificate.verification_code}
      issuedAt={certificate.issued_at}
      scorePct={scorePct}
      pdfUrl={(await getCertificateSignedUrl(certificate.pdf_storage_path)) ?? "#"}
    />
  );
}
