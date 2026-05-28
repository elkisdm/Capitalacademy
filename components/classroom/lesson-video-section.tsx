"use client";

import { useState, useCallback } from "react";
import { VideoPlayer } from "@/components/classroom/video-player";
import { SummaryCard } from "@/components/classroom/summary-card";
import { CommentSection } from "@/components/classroom/comment-section";
import { useVideoSync } from "@/components/classroom/video-sync-context";
import type { LessonResource } from "@/lib/classroom/types";

type Tab = "resumen" | "recursos" | "comentarios";

type LessonVideoSectionProps = {
  playbackId: string;
  lessonId: string;
  lessonTitle: string;
  durationSeconds: number;
  initialPosition: number;
  initialWatchPercentage: number;
  initialCompleted: boolean;
  resources: LessonResource[];
  summary: {
    key_points: string[];
    summary_text: string;
    glossary: { term: string; definition: string }[];
    model_used: string;
    generated_at: string;
  } | null;
  chapters: { position_seconds: number; title: string }[];
  commentCount: number;
  currentUserId: string;
  currentUserName: string;
  currentUserInitials: string;
  currentUserAvatarUrl?: string | null;
  hasTranscript?: boolean;
};

export function LessonVideoSection({
  playbackId,
  lessonId,
  lessonTitle,
  durationSeconds,
  initialPosition,
  initialWatchPercentage,
  initialCompleted,
  resources,
  summary,
  chapters,
  commentCount,
  currentUserId,
  currentUserName,
  currentUserInitials,
  currentUserAvatarUrl,
  hasTranscript = false,
}: LessonVideoSectionProps) {
  const { currentTime, setCurrentTime, seekRef, openTranscriptRef } = useVideoSync();
  const hasResources = resources.length > 0;
  const hasSummary = !!summary;

  const defaultTab: Tab = commentCount > 0
    ? "comentarios"
    : hasSummary
      ? "resumen"
      : hasResources
        ? "recursos"
        : "comentarios";

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  const handleTimeSync = useCallback((t: number) => {
    setCurrentTime(t);
  }, [setCurrentTime]);

  const tabs: { id: Tab; label: string; count?: number }[] = [];
  if (hasSummary) {
    tabs.push({ id: "resumen", label: "Resumen" });
  }
  if (hasResources) {
    tabs.push({ id: "recursos", label: "Recursos", count: resources.length });
  }
  tabs.push({ id: "comentarios", label: "Comentarios", count: commentCount });

  return (
    <>
      <VideoPlayer
        playbackId={playbackId}
        lessonId={lessonId}
        lessonTitle={lessonTitle}
        durationSeconds={durationSeconds}
        initialPosition={initialPosition}
        initialWatchPercentage={initialWatchPercentage}
        initialCompleted={initialCompleted}
        onTimeSync={handleTimeSync}
        seekRef={seekRef}
        chapters={chapters.length > 0 ? chapters : undefined}
      />

      {tabs.length > 0 && (
        <div className="mt-8">
          {/* Tab bar */}
          <div className="mb-4 flex items-center gap-0.5 overflow-x-auto border-b border-ca-ink/[0.08] pb-0 md:gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative shrink-0 px-3 py-3 text-[12px] font-bold tracking-tight transition-colors md:px-4 md:text-[13px]"
                style={{
                  color:
                    activeTab === tab.id
                      ? "var(--color-ca-ink)"
                      : "var(--color-ca-ink-soft, #4a4f73)",
                }}
              >
                {tab.label}
                {tab.count != null && (
                  <span
                    className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background:
                        activeTab === tab.id
                          ? "var(--color-ca-lime, #c5f122)"
                          : "var(--color-ca-bg-soft, rgba(20,22,58,0.04))",
                      color: "var(--color-ca-ink, #14163a)",
                    }}
                  >
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 bg-ca-violet" />
                )}
              </button>
            ))}
            {hasTranscript && (
              <button
                onClick={() => openTranscriptRef.current?.()}
                className="ml-auto flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:text-ca-violet"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 8h4M7 12h10M7 16h6" />
                </svg>
                Transcripción
              </button>
            )}
          </div>

          {/* Tab content */}
          {activeTab === "resumen" && summary && (
            <SummaryCard
              keyPoints={summary.key_points}
              summaryText={summary.summary_text}
              glossary={summary.glossary}
              modelUsed={summary.model_used}
              generatedAt={summary.generated_at}
              chapters={chapters}
              onSeek={(time) => seekRef.current?.(time)}
            />
          )}

          {activeTab === "recursos" && hasResources && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {resources.map((r) => {
                const toneMap: Record<string, string> = {
                  pdf: "#e11d48",
                  link: "#5e17eb",
                  template: "#a8d310",
                  document: "#2a3287",
                };
                const iconMap: Record<string, string> = {
                  pdf: "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M9 14h6M9 18h4",
                  link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
                  template: "M3 3h18v18H3zM3 9h18M9 21V9",
                };
                const tone = toneMap[r.type] ?? "#4a4f73";
                const isExternal = r.type === "link";
                return (
                  <a
                    key={r.id}
                    href={r.url}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    download={!isExternal || undefined}
                    className="ca-card ca-card-hoverable group flex items-center gap-4 p-4"
                  >
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                      style={{ background: `${tone}14`, color: tone }}
                    >
                      <svg
                        width={20}
                        height={20}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={iconMap[r.type] ?? iconMap.pdf} />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold tracking-tight text-ca-ink">
                        {r.title}
                      </div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
                        {r.type === "link"
                          ? "Link externo"
                          : r.type === "template"
                            ? "Plantilla editable"
                            : r.type === "pdf"
                              ? "PDF"
                              : "Documento"}
                      </div>
                    </div>
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-ca-bg-soft text-ca-ink transition-transform group-hover:scale-110">
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path
                          d={
                            isExternal
                              ? "M5 12h14M12 5l7 7-7 7"
                              : "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                          }
                        />
                      </svg>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {activeTab === "comentarios" && (
            <CommentSection
              lessonId={lessonId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserInitials={currentUserInitials}
              currentUserAvatarUrl={currentUserAvatarUrl}
            />
          )}
        </div>
      )}
    </>
  );
}
