"use client";

import type { Tab } from "./types";

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "preguntas", label: "Preguntas" },
    { id: "configuracion", label: "Configuracion" },
    { id: "intentos", label: "Intentos" },
    { id: "certificados", label: "Certificados" },
  ];

  return (
    <div className="flex gap-1 rounded-2xl bg-ca-bg-soft p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="rounded-xl px-4 py-2 text-[13px] font-bold tracking-tight transition-all"
          style={{
            background: active === t.id ? "var(--color-ca-ink)" : "transparent",
            color: active === t.id ? "#fff" : "var(--color-ca-ink-soft)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
