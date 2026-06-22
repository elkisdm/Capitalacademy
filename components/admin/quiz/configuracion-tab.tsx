"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/admin/toast";
import { CONFIG_DEFAULTS } from "./types";
import { CheckCircleIcon, LoaderIcon } from "./icons";

export function ConfiguracionTab({ programId }: { programId: string }) {
  const [config, setConfig] = useState(CONFIG_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/quiz-config?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            if (data.config) {
              setConfig({
                min_completion_pct: data.config.min_completion_pct,
                passing_grade_pct: data.config.passing_grade_pct,
                questions_per_attempt: data.config.questions_per_attempt,
                max_attempts: data.config.max_attempts,
                time_limit_minutes: data.config.time_limit_minutes,
                is_active: data.config.is_active,
              });
            } else if (data.defaults) {
              setConfig(data.defaults);
            }
          }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/quiz-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          minCompletionPct: config.min_completion_pct,
          passingGradePct: config.passing_grade_pct,
          questionsPerAttempt: config.questions_per_attempt,
          maxAttempts: config.max_attempts,
          timeLimitMinutes: config.time_limit_minutes,
          isActive: config.is_active,
        }),
      });
      if (res.ok) {
        toast("Configuración guardada", "success");
      } else {
        toast("Error al guardar configuración", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando configuracion...</p>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer />

      <div className="mb-5 flex items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{
            background: config.is_active ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.06)",
            color: config.is_active ? "#3f5a05" : "var(--color-ca-ink-soft)",
          }}
        >
          {config.is_active ? "Activo" : "Inactivo"}
        </span>
      </div>

      <div className="ca-card p-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Completitud minima */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Completitud minima
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={config.min_completion_pct}
                onChange={(e) => setConfig({ ...config, min_completion_pct: Number(e.target.value) })}
                className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
              <span className="text-[13px] font-semibold text-ca-ink-soft">%</span>
            </div>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Porcentaje de lecciones completadas requerido para habilitar el quiz
            </p>
          </div>

          {/* Nota de aprobacion */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Nota de aprobacion
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={config.passing_grade_pct}
                onChange={(e) => setConfig({ ...config, passing_grade_pct: Number(e.target.value) })}
                className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
              <span className="text-[13px] font-semibold text-ca-ink-soft">%</span>
            </div>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Nota minima para aprobar el quiz
            </p>
          </div>

          {/* Preguntas por intento */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Preguntas por intento
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={config.questions_per_attempt}
              onChange={(e) => setConfig({ ...config, questions_per_attempt: Number(e.target.value) })}
              className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Cantidad de preguntas aleatorias por cada intento
            </p>
          </div>

          {/* Maximo intentos */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Maximo intentos
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={config.max_attempts}
              onChange={(e) => setConfig({ ...config, max_attempts: Number(e.target.value) })}
              className="w-24 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Numero maximo de intentos permitidos por alumno
            </p>
          </div>

          {/* Tiempo limite */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Tiempo limite (minutos)
            </label>
            <input
              type="number"
              min={0}
              max={360}
              value={config.time_limit_minutes ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  time_limit_minutes: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Sin limite"
              className="w-32 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
            />
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Dejar vacio para sin limite de tiempo
            </p>
          </div>

          {/* Quiz activo */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
              Quiz activo
            </label>
            <button
              type="button"
              onClick={() => setConfig({ ...config, is_active: !config.is_active })}
              className="relative h-7 w-12 rounded-full transition-colors"
              style={{
                background: config.is_active
                  ? "var(--color-ca-lime-deep)"
                  : "rgba(20,22,58,0.12)",
              }}
            >
              <div
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  transform: config.is_active ? "translateX(22px)" : "translateX(2px)",
                }}
              />
            </button>
            <p className="mt-1 text-[11px] text-ca-ink-soft">
              Los alumnos solo veran el quiz si esta activo
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-ca-ink/[0.06] pt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
            style={{ background: "var(--color-ca-lime)" }}
          >
            {saving ? <LoaderIcon /> : <CheckCircleIcon />}
            {saving ? "Guardando..." : "Guardar configuracion"}
          </button>
        </div>
      </div>
    </div>
  );
}
