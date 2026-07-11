import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Video, Clock, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MuxUploader } from "@/components/admin/mux-uploader";
import { ResourceManager } from "@/components/admin/resource-manager";
import { LessonEditForm } from "@/components/admin/lesson-edit-form";
import { LessonQuizPanel } from "@/components/admin/quiz/lesson-quiz-panel";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { Pencil, ListChecks } from "lucide-react";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function AdminLessonPage(
  props: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*, program_modules(title, code, program_id, programs(name))")
    .eq("id", lessonId)
    .single();

  if (!lesson) notFound();

  const mod = lesson.program_modules as {
    title: string;
    code: string;
    program_id: string;
    programs: { name: string } | null;
  } | null;

  const { data: resources } = await supabase
    .from("lesson_resources")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true });

  const hasVideo = !!(lesson as Record<string, unknown>).mux_playback_id;
  const thumbnailUrl = (lesson as Record<string, unknown>).thumbnail_url as string | null;
  const videoDuration = (lesson as Record<string, unknown>).video_duration_seconds as number | null;
  const muxError = (lesson as Record<string, unknown>).mux_error as string | null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <Link
        href="/admin/lessons"
        className="mb-6 inline-flex items-center gap-1 text-sm text-ca-ink-soft hover:text-ca-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver a lecciones
      </Link>

      <div className="mb-6">
        {mod && (
          <p className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
            {mod.programs?.name} · {mod.code} — {mod.title}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold text-ca-ink">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="mt-1 text-ca-ink-soft">{lesson.description}</p>
        )}
      </div>

      {/* Editar metadatos de la lección */}
      <CollapsibleSection
        title="Editar lección"
        subtitle="Título, descripción, tipo, portada y contenido"
        icon={<Pencil className="h-5 w-5" />}
        defaultOpen
      >
        <LessonEditForm
          lessonId={lessonId}
          initial={{
            title: lesson.title,
            description: lesson.description ?? null,
            content: ((lesson as Record<string, unknown>).content as string | null) ?? null,
            kind: ((lesson as Record<string, unknown>).kind as
              | "live_in_person"
              | "live_online"
              | "recorded") ?? "recorded",
            unlockAt: ((lesson as Record<string, unknown>).unlock_at as string | null) ?? null,
            coverImageUrl: ((lesson as Record<string, unknown>).cover_image_url as string | null) ?? null,
          }}
        />
      </CollapsibleSection>

      {/* Video section */}
      <CollapsibleSection
        title="Video"
        icon={<Video className="h-5 w-5" />}
        summary={hasVideo ? "Video listo" : "Sin video"}
      >
        {muxError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">
              Mux no pudo procesar el último video
            </p>
            <p className="mt-1 text-sm text-red-600">{muxError}</p>
            <p className="mt-2 text-xs text-red-500">
              Vuelve a subir el video para reintentar.
            </p>
          </div>
        )}

        {hasVideo ? (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt="Thumbnail"
                  className="h-24 w-40 rounded-md object-cover"
                />
              )}
              <div>
                <p className="text-sm text-ca-ink-soft">
                  <Clock className="mr-1 inline h-3.5 w-3.5" />
                  Duración: {formatDuration(videoDuration)}
                </p>
                <p className="mt-1 text-xs text-ca-ink-soft/60">
                  Asset: {(lesson as Record<string, unknown>).mux_asset_id as string}
                </p>
                <p className="mt-3 text-sm font-medium text-ca-lime-text">
                  Video listo y disponible para alumnos
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-ca-ink-soft">
                ¿Reemplazar video?
              </p>
              <MuxUploader lessonId={lessonId} />
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-ca-ink-soft">
              Esta lección no tiene video aún. Sube uno para que los alumnos
              puedan verlo.
            </p>
            <MuxUploader lessonId={lessonId} />
          </div>
        )}
      </CollapsibleSection>

      {/* Resources section */}
      <CollapsibleSection
        title="Recursos"
        icon={<FileText className="h-5 w-5" />}
        summary={`${resources?.length ?? 0} recurso${(resources?.length ?? 0) === 1 ? "" : "s"}`}
      >
        <ResourceManager
          lessonId={lessonId}
          initialResources={resources ?? []}
        />
      </CollapsibleSection>

      {/* Evaluación de la clase */}
      {mod?.program_id && (
        <CollapsibleSection
          title="Evaluación de la clase"
          subtitle="Quiz de la lección: preguntas y configuración"
          icon={<ListChecks className="h-5 w-5" />}
        >
          <LessonQuizPanel
            programId={mod.program_id}
            lessonId={lessonId}
            lessonTitle={lesson.title}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
