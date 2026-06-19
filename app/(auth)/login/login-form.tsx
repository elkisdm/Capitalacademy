"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

function EyeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.93M6.1 6.1A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.27-1.06M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24" />
    </svg>
  );
}

export function LoginForm({
  redirectTo,
  accent,
}: {
  redirectTo: string;
  /** Acento de marca (hex) para el botón principal. Default ca-violet. */
  accent?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
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
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="w-full rounded-xl border border-ca-ink/[0.12] bg-ca-bg px-4 py-3 text-[14px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet focus:ring-2 focus:ring-ca-violet/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
        >
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPwd ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-ca-ink/[0.12] bg-ca-bg px-4 py-3 pr-12 text-[14px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet focus:ring-2 focus:ring-ca-violet/20"
          />
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ca-ink-soft transition-colors hover:text-ca-ink"
          >
            {showPwd ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-[12px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="ca-btn-primary mt-2 flex items-center justify-center gap-2 py-3 text-[13px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"
        style={accent ? { background: accent } : undefined}
      >
        {loading ? (
          <>
            <span className="ca-spin-slow inline-block h-4 w-4 rounded-full border-2 border-white border-r-transparent" />
            Entrando...
          </>
        ) : (
          "Iniciar sesión"
        )}
      </button>
    </form>
  );
}
