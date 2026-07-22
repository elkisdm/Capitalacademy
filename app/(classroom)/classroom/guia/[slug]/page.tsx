import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Lightbulb, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { getTeacherCohorts, isTeacherUser } from "@/lib/docente/queries";
import { visibleAudiences } from "@/lib/guide/audience";
import { SupportCard } from "@/components/classroom/guide/support-card";
import {
  getArticle,
  articlesByAudience,
  type GuideCtx,
} from "@/lib/guide/content";

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await props.params;
  const article = getArticle(slug);
  return {
    title: article ? `${article.title} · Ayuda · Capital Academy` : "Centro de ayuda · Capital Academy",
  };
}

export default async function GuideArticlePage(
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const article = getArticle(slug);
  if (!article) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const profile = await getViewerProfile(user.id);

  const sysRole = profile?.system_role ?? profile?.role;
  const isStaff = sysRole === "admin" || sysRole === "ops";
  const isTeacher = isStaff ? false : await isTeacherUser(user.id);
  const audiences = visibleAudiences({ isStaff, isTeacher });

  if (!audiences.includes(article.audience)) notFound();

  // Contexto para resolver el enlace directo a la pantalla.
  let ctx: GuideCtx = { cohortSlug: null, adminCohortId: null };
  if (article.route) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let cohortSlug: string | null = null;
    if (enrollment?.cohort_id) {
      const { data: cohort } = await supabase
        .from("cohorts")
        .select("slug, id")
        .eq("id", enrollment.cohort_id)
        .single();
      cohortSlug = cohort?.slug ?? cohort?.id ?? null;
    }

    // Fallback para docentes sin matrícula: la primera cohorte donde dicta.
    if (!cohortSlug && isTeacher) {
      const teacherCohorts = await getTeacherCohorts(user.id);
      const first = teacherCohorts[0];
      cohortSlug = first ? (first.cohortSlug ?? first.cohortId) : null;
    }

    let adminCohortId: string | null = null;
    if (isStaff) {
      const { data: anyCohort } = await supabase
        .from("cohorts")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      adminCohortId = anyCohort?.id ?? null;
    }
    ctx = { cohortSlug, adminCohortId };
  }

  const href = article.route ? article.route(ctx) : null;
  const Icon = article.icon;

  // Artículos relacionados: misma categoría y audiencia, excepto este.
  const related = articlesByAudience(article.audience)
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-10">
      {/* Breadcrumb */}
      <Link
        href="/classroom/guia"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ca-ink-soft transition-colors hover:text-ca-violet"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Centro de ayuda
      </Link>

      {/* Encabezado */}
      <div className="mt-4 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ca-violet/[0.08] text-ca-violet">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
            {article.category}
          </div>
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-ca-ink md:text-[32px]">
            {article.title}
          </h1>
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-ca-ink-soft">{article.overview}</p>

      {/* CTA a la pantalla */}
      {href && (
        <Link
          href={href}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-ca-violet px-5 py-3 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90"
        >
          {article.routeLabel ?? "Ir a la pantalla"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      {/* Paso a paso */}
      <section className="mt-8">
        <h2 className="mb-3 text-[16px] font-black tracking-tight text-ca-ink">Paso a paso</h2>
        <ol className="flex flex-col gap-3">
          {article.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ca-ink text-[11px] font-black text-white">
                {i + 1}
              </span>
              <span className="pt-0.5 text-[14px] leading-relaxed text-ca-ink">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Tips */}
      {article.tips && article.tips.length > 0 && (
        <section className="mt-6 rounded-2xl border border-ca-lime/30 bg-ca-lime/[0.08] p-5">
          <h2 className="mb-2 inline-flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.12em] text-ca-ink">
            <Lightbulb className="h-4 w-4 text-ca-violet" />
            Buenos a saber
          </h2>
          <ul className="flex flex-col gap-2">
            {article.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ca-ink">
                <span className="text-ca-violet">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FAQ */}
      {article.faqs && article.faqs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 inline-flex items-center gap-2 text-[16px] font-black tracking-tight text-ca-ink">
            <HelpCircle className="h-4.5 w-4.5 text-ca-violet" />
            Preguntas frecuentes
          </h2>
          <div className="flex flex-col gap-3">
            {article.faqs.map((faq, i) => (
              <div key={i} className="ca-card p-4">
                <p className="text-[13.5px] font-black text-ca-ink">{faq.q}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ca-ink-soft">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Relacionados */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
            Sigue leyendo
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((a) => {
              const RIcon = a.icon;
              return (
                <Link
                  key={a.slug}
                  href={`/classroom/guia/${a.slug}`}
                  className="ca-card group flex items-center gap-3 p-4 transition-colors hover:border-ca-violet/30"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-violet/[0.08] text-ca-violet">
                    <RIcon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[13.5px] font-bold text-ca-ink">{a.title}</span>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-ca-ink-soft/50 transition-colors group-hover:text-ca-violet" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-10">
        <SupportCard />
      </div>
    </div>
  );
}
