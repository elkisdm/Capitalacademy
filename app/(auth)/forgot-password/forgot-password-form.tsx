"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({
  next = "",
  brand,
  initialEmail = "",
  backToLoginHref = "/login",
}: {
  /** Destino original del alumno; viaja dentro del enlace de recuperación. */
  next?: string;
  /** Slug del entorno, para brandear el enlace y el set-password. */
  brand?: string;
  /** Email prellenado cuando se llega desde un enlace vencido. */
  initialEmail?: string;
  backToLoginHref?: string;
} = {}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next, brand }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Error al enviar el enlace.");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center" role="status" aria-live="polite">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(168,211,16,0.15)" }}
        >
          <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3f5a05" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        <p className="text-[15px] font-bold text-ca-ink">
          Enlace enviado
        </p>
        {/*
          La redacción condicional no es cautela de más: la respuesta del
          servidor es idéntica exista o no la cuenta, justamente para no
          delatar qué correos están registrados.
        */}
        <p className="mt-2 text-[13px] text-ca-ink-soft">
          Si existe una cuenta con <strong>{email}</strong>, en un minuto recibirás un
          enlace para entrar. Revisa también tu carpeta de spam.
        </p>
        <Link
          href={backToLoginHref}
          className="mt-6 inline-block text-[13px] font-bold text-ca-violet transition-colors hover:text-ca-violet-deep"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
        >
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="mt-2 w-full py-3 text-[13px] uppercase tracking-[0.08em]"
      >
        {loading ? (
          <>
            <span className="ca-spin-slow inline-block h-4 w-4 rounded-full border-2 border-white border-r-transparent" />
            Enviando…
          </>
        ) : (
          "Enviarme el enlace"
        )}
      </Button>

      <Link
        href={backToLoginHref}
        className="mt-1 text-center text-[13px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
      >
        Volver al login
      </Link>
    </form>
  );
}
