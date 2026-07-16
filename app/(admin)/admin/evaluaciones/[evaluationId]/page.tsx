import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";
import { kindLabel, scopeLabel } from "@/lib/admin/evaluation-list";
import type { Evaluation } from "@/components/admin/quiz/types";
import { EvaluationDetailClient } from "./evaluation-detail-client";

export default async function AdminEvaluationDetailPage(props: {
  params: Promise<{ evaluationId: string }>;
}) {
  const { evaluationId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: evaluation } = await supabase.from("evaluations").select("*").eq("id", evaluationId).single();
  if (!evaluation) notFound();

  const ev = evaluation as Evaluation;

  let targetLabel: string | null = null;
  if (ev.scope === "module" && ev.module_id) {
    const { data: mod } = await supabase.from("program_modules").select("title").eq("id", ev.module_id).single();
    targetLabel = mod?.title ?? null;
  } else if (ev.scope === "lesson" && ev.lesson_id) {
    const { data: lesson } = await supabase.from("lessons").select("title").eq("id", ev.lesson_id).single();
    targetLabel = lesson?.title ?? null;
  } else if (ev.scope === "session" && ev.session_id) {
    const { data: session } = await supabase
      .from("class_sessions")
      .select("title, starts_at")
      .eq("id", ev.session_id)
      .single();
    if (session) {
      const displayTitle = session.title?.trim() || "Clase en vivo";
      targetLabel = `${displayTitle} — ${formatChile(session.starts_at, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
  }

  const subtitle = [kindLabel(ev.kind), scopeLabel(ev.scope), targetLabel].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <Link
        href="/admin/evaluaciones"
        className="mb-6 inline-flex items-center gap-1 text-sm text-ca-ink-soft hover:text-ca-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver a evaluaciones
      </Link>

      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">{subtitle}</p>
        <h1 className="mt-1 text-2xl font-bold text-ca-ink">{ev.title}</h1>
      </div>

      <EvaluationDetailClient evaluation={ev} />
    </div>
  );
}
