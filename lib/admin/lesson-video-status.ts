import type { BadgeProps } from "@/components/ui/badge";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

type LessonThumbnailInput = {
  thumbnailUrl: string | null;
  muxPlaybackId: string | null;
};

export function lessonThumbnail(input: LessonThumbnailInput): string | null {
  return (
    input.thumbnailUrl ??
    (input.muxPlaybackId
      ? `https://image.mux.com/${input.muxPlaybackId}/thumbnail.webp?width=320&time=5`
      : null)
  );
}

type LessonVideoStatusInput = {
  muxPlaybackId: string | null;
  muxUploadId: string | null;
  muxError: string | null;
  hasContent: boolean;
};

export function lessonVideoStatus(input: LessonVideoStatusInput): {
  tone: BadgeTone;
  label: string;
} {
  if (input.muxPlaybackId) return { tone: "lime", label: "Grabada" };
  if (input.muxUploadId && !input.muxPlaybackId && !input.muxError) {
    return { tone: "amber", label: "Procesando" };
  }
  if (input.muxError) return { tone: "rose", label: "Error" };
  if (input.hasContent) return { tone: "violet", label: "Texto" };
  return { tone: "neutral", label: "Sin video" };
}
