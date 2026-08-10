import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { getValorUF } from "@/lib/indicadores/uf";
import { EvaluacionFinanciera } from "@/components/evaluacion/EvaluacionFinanciera";

export const metadata: Metadata = {
  title: "Evaluación Financiera · Capital Academy",
};

// El valor de la UF se cachea 12h dentro de `getValorUF`; la página sigue el
// mismo ritmo para no reconstruirse en cada visita.
export const revalidate = 43200;

/**
 * Motor de Evaluación Financiera — Paso 7 de la metodología comercial (ADR-0032).
 *
 * Va TRAS LOGIN y no en la superficie pública: la calculadora pública captura
 * los datos de quien la usa, y esta captura los de un tercero —el cliente del
 * asesor— que no aceptó ningún término.
 */
export default async function EvaluacionPage(props: {
  params: Promise<{ cohortSlug: string }>;
}) {
  const { cohortSlug } = await props.params;
  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const access = await getClassroomAccess(user.id, cohortId);
  if (!access) notFound();

  const valorUF = await getValorUF();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-7 max-w-2xl">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-ca-violet">
          Paso 7 · Metodología comercial
        </p>
        <h1 className="text-2xl font-black leading-tight tracking-[-0.02em] text-ca-ink sm:text-3xl">
          Evaluación Financiera
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ca-ink-soft">
          Levanta la situación financiera de tu cliente y obtén, en la misma reunión, hasta
          qué valor de propiedad puede evaluar hoy — con su perfil, el pie que necesita y
          qué variable mover para mejorarlo.
        </p>
      </header>

      <EvaluacionFinanciera valorUF={valorUF} />
    </div>
  );
}
