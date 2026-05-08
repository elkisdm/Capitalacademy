"use client";

import { useState, useTransition } from "react";

type Estado =
  | { tag: "idle" }
  | { tag: "ok" }
  | { tag: "error"; msg: string };

const programas = [
  { value: "diplomado", label: "Diplomado en Ventas y Asesoría Inmobiliaria" },
  { value: "liderazgo", label: "Programa de Liderazgo y Gestión de Equipos" },
  { value: "ruta", label: "Programa Ruta Inmobiliaria" },
  { value: "indeciso", label: "Aún no lo tengo claro" },
] as const;

function getUtms() {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const grab = (k: string) => sp.get(k) ?? "";
  return {
    utm_source: grab("utm_source"),
    utm_medium: grab("utm_medium"),
    utm_campaign: grab("utm_campaign"),
    utm_content: grab("utm_content"),
    utm_term: grab("utm_term"),
  };
}

export function Formulario() {
  const [estado, setEstado] = useState<Estado>({ tag: "idle" });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      full_name: String(fd.get("full_name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      role: String(fd.get("role") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim(),
      program_interest: String(fd.get("program_interest") ?? "indeciso"),
      message: String(fd.get("message") ?? "").trim(),
      website: String(fd.get("website") ?? ""),
      source: "landing",
      ...getUtms(),
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setEstado({
            tag: "error",
            msg: data?.error ?? "No pudimos enviar tu solicitud.",
          });
          return;
        }
        setEstado({ tag: "ok" });
        (e.target as HTMLFormElement).reset();
      } catch {
        setEstado({
          tag: "error",
          msg: "Error de conexión. Inténtalo nuevamente.",
        });
      }
    });
  }

  if (estado.tag === "ok") {
    return (
      <div className="rounded-3xl border border-[var(--color-ca-violet)]/20 bg-white p-10 text-center shadow-[0_18px_40px_rgba(94,23,235,0.1)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-ca-lime)]">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-[var(--color-ca-ink)]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="mt-5 text-2xl font-bold text-[var(--color-ca-ink)]">
          Gracias por contactarnos
        </h3>
        <p className="mt-3 text-base text-[var(--color-ca-ink-soft)]">
          Pronto nuestro equipo se comunicará contigo para entregarte más
          información.
        </p>
        <button
          type="button"
          onClick={() => setEstado({ tag: "idle" })}
          className="mt-8 inline-flex h-11 items-center rounded-full border border-[var(--color-ca-ink)]/15 px-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink)] hover:bg-[var(--color-ca-bg)]"
        >
          Enviar otra solicitud
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-7 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-10"
    >
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nombre y apellido" name="full_name" required />
        <Field label="Correo electrónico" name="email" type="email" required />
        <Field
          label="Teléfono / WhatsApp"
          name="phone"
          type="tel"
          required
          placeholder="+56 9 ..."
        />
        <Field label="Cargo o actividad actual" name="role" />
        <Field label="Empresa" name="company" />
        <SelectField
          label="Programa de interés"
          name="program_interest"
          required
          options={programas}
        />
      </div>

      <div className="mt-5">
        <Field
          label="Mensaje (opcional)"
          name="message"
          textarea
          placeholder="Cuéntanos brevemente qué te interesa saber."
        />
      </div>

      {estado.tag === "error" && (
        <p className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {estado.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Enviando..." : "Solicitar información"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  textarea,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
}) {
  const base =
    "w-full rounded-xl border border-[rgba(20,22,58,0.12)] bg-[var(--color-ca-bg)] px-4 py-3 text-sm text-[var(--color-ca-ink)] placeholder:text-[var(--color-ca-ink-soft)]/60 transition-colors focus:border-[var(--color-ca-violet)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-ca-violet)]/20";
  return (
    <label className={textarea ? "sm:col-span-2 block" : "block"}>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ca-ink-soft)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-ca-violet)]">*</span>}
      </span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={4}
          className={base}
        />
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          placeholder={placeholder}
          className={base}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  required,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ca-ink-soft)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-ca-violet)]">*</span>}
      </span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full rounded-xl border border-[rgba(20,22,58,0.12)] bg-[var(--color-ca-bg)] px-4 py-3 text-sm text-[var(--color-ca-ink)] transition-colors focus:border-[var(--color-ca-violet)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-ca-violet)]/20"
      >
        <option value="" disabled>
          Selecciona una opción
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
