"use client";

import { useId, useState, useTransition } from "react";
import { Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/utils/phone";
import { buildLiderazgoLeadPayload } from "@/lib/landing/liderazgo-lead";

type Estado =
  | { tag: "idle" }
  | { tag: "ok" }
  | { tag: "error"; msg: string };

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

export function FormularioLiderazgo({ cta }: { cta: string }) {
  const [estado, setEstado] = useState<Estado>({ tag: "idle" });
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const uid = useId();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = buildLiderazgoLeadPayload({
      full_name: String(fd.get("full_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      role: String(fd.get("role") ?? ""),
      company: String(fd.get("company") ?? ""),
      message: String(fd.get("message") ?? ""),
      website: String(fd.get("website") ?? ""),
      utms: getUtms(),
    });

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
        setPhone("");
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
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] p-10 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-ca-violet)]/25 text-[var(--color-ca-violet)]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="mt-5 text-xl font-semibold text-[var(--color-ca-ink)]">
          Recibimos tu solicitud
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
          El equipo de Capital Academy se pondrá en contacto contigo con la
          información completa del programa.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEstado({ tag: "idle" })}
          className="mt-8"
        >
          Enviar otra solicitud
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] p-7 sm:p-10"
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
        <Campo id={`${uid}-nombre`} label="Nombre y apellido" required>
          <Input
            id={`${uid}-nombre`}
            name="full_name"
            required
            autoComplete="name"
          />
        </Campo>
        <Campo id={`${uid}-email`} label="Correo electrónico" required>
          <Input
            id={`${uid}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
          />
        </Campo>
        <Campo id={`${uid}-phone`} label="Teléfono / WhatsApp" required>
          <Input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            required
            placeholder="+56 9 1234 5678"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => phone.trim() && setPhone(formatPhone(phone))}
          />
        </Campo>
        <Campo id={`${uid}-role`} label="Cargo o actividad actual (opcional)">
          <Input id={`${uid}-role`} name="role" autoComplete="organization-title" />
        </Campo>
        <Campo id={`${uid}-company`} label="Empresa (opcional)" className="sm:col-span-2">
          <Input id={`${uid}-company`} name="company" autoComplete="organization" />
        </Campo>
      </div>

      <div className="mt-5">
        <Campo id={`${uid}-msg`} label="Mensaje (opcional)">
          <Textarea
            id={`${uid}-msg`}
            name="message"
            rows={4}
            placeholder="Cuéntanos brevemente sobre tu equipo y qué te interesa resolver."
          />
        </Campo>
      </div>

      {estado.tag === "error" && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {estado.msg}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-8 w-full sm:w-auto">
        {pending ? "Enviando…" : cta}
      </Button>
      <p className="mt-4 text-xs leading-relaxed text-[var(--color-ca-ink-soft)]/80">
        Al enviar este formulario aceptas que Capital Academy te contacte con
        información del programa.
      </p>
    </form>
  );
}

function Campo({
  id,
  label,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ca-ink-soft)]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-ca-violet)]" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
