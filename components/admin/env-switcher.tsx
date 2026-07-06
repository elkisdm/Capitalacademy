"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveEnv, setViewMode } from "@/lib/admin/env-actions";
import type { EnvOption, ViewMode } from "@/lib/admin/active-env";

/**
 * Selector global de entorno (programa) para el staff. Persiste la elección en
 * cookie vía server action y refresca para que TODAS las páginas del panel
 * re-lean el entorno activo. Es vista, no permisos.
 */
export function EnvSwitcher({
  options,
  activeEnv,
  collapsed = false,
  studentPreview = false,
}: {
  options: EnvOption[];
  activeEnv: string | null;
  collapsed?: boolean;
  /**
   * En la vista de alumno del staff, cambiar de entorno debe re-resolver el
   * cohorte que se previsualiza: navega a `/classroom` (que redirige al cohorte
   * del entorno activo). En el panel admin basta con refrescar en el sitio.
   */
  studentPreview?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (options.length === 0) return null;

  function handleChange(value: string) {
    startTransition(async () => {
      await setActiveEnv(value);
      if (studentPreview) {
        router.push("/classroom");
      }
      router.refresh();
    });
  }

  if (collapsed) {
    // En modo minimizado mostramos un punto/indicador; el selector completo
    // vuelve al expandir. Evita romper el layout angosto.
    return (
      <div
        className="mx-auto my-2 h-1.5 w-1.5 rounded-full bg-ca-violet"
        title="Entorno activo"
        aria-hidden
      />
    );
  }

  return (
    <div className="px-3 pb-1 pt-3">
      <label
        htmlFor="env-switcher"
        className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft"
      >
        Entorno
      </label>
      <select
        id="env-switcher"
        value={activeEnv ?? "all"}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Entorno activo"
        className="w-full rounded-xl border border-ca-ink/[0.14] bg-white px-3 py-2 text-[13px] font-semibold text-ca-ink outline-none transition-colors focus:border-ca-violet disabled:opacity-60"
      >
        <option value="all">Todos los entornos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Switch "Ver como: Admin / Alumno". Conserva ambos roles del staff y solo
 * cambia qué se muestra. Cambiar de modo navega a la sección correspondiente.
 */
export function ViewModeToggle({
  mode,
  collapsed = false,
}: {
  mode: ViewMode;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: ViewMode) {
    if (next === mode) return;
    startTransition(async () => {
      await setViewMode(next);
      router.push(next === "student" ? "/classroom" : "/admin/users");
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => switchTo(mode === "admin" ? "student" : "admin")}
        title={mode === "admin" ? "Ver como alumno" : "Volver a admin"}
        className="mx-auto my-2 grid h-8 w-8 place-items-center rounded-full text-ca-ink-soft transition-colors hover:bg-ca-bg-soft disabled:opacity-60"
        aria-label={mode === "admin" ? "Ver como alumno" : "Volver a admin"}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="px-3 pb-2 pt-1">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
        Ver como
      </span>
      <div className="flex rounded-xl border border-ca-ink/[0.14] bg-white p-0.5" role="group" aria-label="Modo de vista">
        {(["admin", "student"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={pending}
              onClick={() => switchTo(m)}
              aria-pressed={active}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${
                active ? "bg-ca-violet text-white" : "text-ca-ink-soft hover:text-ca-ink"
              }`}
            >
              {m === "admin" ? "Admin" : "Alumno"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
