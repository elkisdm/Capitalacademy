"use client";

import { useState, useCallback } from "react";
import { VideoPlayer } from "@/components/classroom/video-player";
import { SummaryCard } from "@/components/classroom/summary-card";
import { CommentSection } from "@/components/classroom/comment-section";
import { ResourceList } from "@/components/classroom/resource-list";
import { useVideoSyncActions } from "@/components/classroom/video-sync-context";
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
  const { setCurrentTime, seekRef, openTranscriptRef } = useVideoSyncActions();
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
            <div className="mt-5">
              <ResourceList resources={resources} />
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
