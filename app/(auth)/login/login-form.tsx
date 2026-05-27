"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--color-ca-ink-soft)" }}
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
          className="w-full rounded-xl border px-4 py-3 text-[14px] font-medium outline-none transition-colors focus:border-[var(--color-ca-violet)] focus:ring-2 focus:ring-[var(--color-ca-violet)]/20"
          style={{
            background: "var(--color-ca-bg)",
            borderColor: "rgba(20,22,58,0.12)",
            color: "var(--color-ca-ink)",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--color-ca-ink-soft)" }}
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-xl border px-4 py-3 text-[14px] font-medium outline-none transition-colors focus:border-[var(--color-ca-violet)] focus:ring-2 focus:ring-[var(--color-ca-violet)]/20"
          style={{
            background: "var(--color-ca-bg)",
            borderColor: "rgba(20,22,58,0.12)",
            color: "var(--color-ca-ink)",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="ca-btn-primary mt-2 flex items-center justify-center gap-2 py-3 text-[13px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"
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
