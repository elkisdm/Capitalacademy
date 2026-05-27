import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Video, Clock, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MuxUploader } from "@/components/admin/mux-uploader";
import { ResourceManager } from "@/components/admin/resource-manager";

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
    .select("*, program_modules(title, code, programs(name))")
    .eq("id", lessonId)
    .single();

  if (!lesson) notFound();

  const mod = lesson.program_modules as {
    title: string;
    code: string;
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/admin/lessons"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver a lecciones
      </Link>

      <div className="mb-6">
        {mod && (
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {mod.programs?.name} · {mod.code} — {mod.title}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          {lesson.title}
        </h1>
        {lesson.description && (
          <p className="mt-1 text-gray-600">{lesson.description}</p>
        )}
      </div>

      {/* Video section */}
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Video className="h-5 w-5" />
          Video
        </h2>

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
                <p className="text-sm text-gray-600">
                  <Clock className="mr-1 inline h-3.5 w-3.5" />
                  Duración: {formatDuration(videoDuration)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Asset: {(lesson as Record<string, unknown>).mux_asset_id as string}
                </p>
                <p className="mt-3 text-sm font-medium text-green-600">
                  Video listo y disponible para alumnos
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-gray-500">
                ¿Reemplazar video?
              </p>
              <MuxUploader lessonId={lessonId} />
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-gray-500">
              Esta lección no tiene video aún. Sube uno para que los alumnos
              puedan verlo.
            </p>
            <MuxUploader lessonId={lessonId} />
          </div>
        )}
      </section>

      {/* Resources section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <FileText className="h-5 w-5" />
          Recursos
        </h2>
        <ResourceManager
          lessonId={lessonId}
          initialResources={resources ?? []}
        />
      </section>
    </div>
  );
}
