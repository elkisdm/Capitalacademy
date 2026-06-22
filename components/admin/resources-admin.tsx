"use client";

import { useState } from "react";
import { ResourceManager } from "./resource-manager";

type LessonInfo = {
  id: string;
  title: string;
  position: number;
  durationMin: number | null;
  resourceCount: number;
};

type ModuleInfo = {
  id: string;
  title: string;
  position: number;
  programName: string;
  lessons: LessonInfo[];
};

type Resource = {
  id: string;
  lesson_id: string;
  title: string;
  type: string;
  url: string | null;
  storage_path?: string | null;
  file_size_bytes?: number | null;
  position: number;
};

export function ResourcesAdmin({
  modules,
  initialResources,
}: {
  modules: ModuleInfo[];
  initialResources: Record<string, Resource[]>;
}) {
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id ?? "");
  const [selectedLessonId, setSelectedLessonId] = useState(
    modules[0]?.lessons[0]?.id ?? "",
  );

  const selectedModule = modules.find((m) => m.id === selectedModuleId);
  const selectedLesson = selectedModule?.lessons.find(
    (l) => l.id === selectedLessonId,
  );

  const selectLesson = (moduleId: string, lessonId: string) => {
    setSelectedModuleId(moduleId);
    setSelectedLessonId(lessonId);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Left: current lesson resources */}
      <div>
        {selectedLesson && (
          <>
            <div
              className="ca-card relative mb-5 overflow-hidden p-5"
              style={{ background: "var(--color-ca-ink)", color: "#fff", borderColor: "transparent" }}
            >
              <div className="shape-circle absolute -right-8 -top-8 h-32 w-32 bg-ca-violet opacity-50" />
              <div className="shape-circle absolute right-16 top-6 h-3 w-3 bg-ca-lime" />
              <div className="relative flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
                    {selectedModule?.programName} · Módulo {String(selectedModule?.position ?? 0).padStart(2, "0")}
                  </div>
                  <h3 className="mt-0.5 text-[20px] font-black leading-tight tracking-tight">
                    {selectedLesson.title}
                  </h3>
                  <div className="mt-1 text-[12px] font-semibold text-white/65">
                    {selectedLesson.durationMin ? `${selectedLesson.durationMin} min` : "Sin video"} ·{" "}
                    {selectedLesson.resourceCount} recursos
                  </div>
                </div>
              </div>
            </div>

            <ResourceManager
              lessonId={selectedLessonId}
              initialResources={initialResources[selectedLessonId] ?? []}
            />
          </>
        )}
      </div>

      {/* Right: lesson selector */}
      <div className="ca-card overflow-hidden">
        <div className="border-b border-ca-ink/[0.08] px-5 py-3.5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Cambiar lección
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {modules.map((m) => (
            <div key={m.id}>
              <button
                onClick={() => {
                  setSelectedModuleId(m.id);
                  if (m.lessons[0]) setSelectedLessonId(m.lessons[0].id);
                }}
                className="flex w-full items-center gap-2 border-b border-ca-ink/[0.08] px-4 py-2.5 text-left"
                style={{
                  background: m.id === selectedModuleId ? "var(--color-ca-bg-soft)" : "transparent",
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                  <path d={m.id === selectedModuleId ? "M6 9l6 6 6-6" : "M9 18l6-6-6-6"} />
                </svg>
                <span className="font-mono text-[10px] font-bold text-ca-ink-soft">
                  M{String(m.position).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-[12px] font-bold text-ca-ink">{m.title}</span>
              </button>
              {m.id === selectedModuleId &&
                m.lessons.map((l, i) => {
                  const active = l.id === selectedLessonId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => selectLesson(m.id, l.id)}
                      className="flex w-full items-center gap-2 border-b border-ca-ink/[0.08] py-2 pl-9 pr-4 text-left transition-colors hover:bg-ca-bg-soft"
                      style={{
                        background: active ? "rgba(94,23,235,0.06)" : "transparent",
                      }}
                    >
                      <span
                        className="font-mono text-[10px] font-bold"
                        style={{ color: active ? "var(--color-ca-violet)" : "var(--color-ca-ink-soft)" }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 truncate text-[12px] font-semibold text-ca-ink">{l.title}</span>
                      <span className="font-mono text-[10px] font-bold text-ca-ink-soft">
                        {l.resourceCount > 0 ? `${l.resourceCount}` : "—"}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
