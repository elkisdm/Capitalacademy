"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function EyeIcon() {
  return (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.93M6.1 6.1A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.27-1.06M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24" />
    </svg>
  );
}

/**
 * Mensajes por código de error de la cadena de acceso. Los códigos los emite
 * `/auth/confirm` cuando el enlace del correo no sirve; el alumno necesita
 * saber que debe pedir uno nuevo, no "intentar de nuevo".
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Email o contraseña incorrectos.",
  link_expired:
    "Ese enlace ya se usó o venció. Entra con tu contraseña, o pide uno nuevo en «¿Olvidaste tu contraseña?».",
  missing_token:
    "El enlace del correo llegó incompleto. Entra con tu contraseña, o pide uno nuevo en «¿Olvidaste tu contraseña?».",
  confirm_failed: "No pudimos validar el enlace. Intenta entrar con tu contraseña.",
};

export function LoginForm({
  redirectTo,
  accent,
  initialError,
  forgotHref = "/forgot-password",
}: {
  redirectTo: string;
  /** Acento de marca (hex) para el botón principal. Default ca-violet. */
  accent?: string;
  /** Código de error que viene por `?error=` (enlace vencido, etc.). */
  initialError?: string;
  /** Recuperar contraseña conservando destino y marca del entorno. */
  forgotHref?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    initialError
      ? (ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.confirm_failed)
      : "",
  );
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth
      .signInWithPassword({ email: email.trim(), password })
      .catch((err: unknown) => ({ error: err as { status?: number; code?: string } }));

    if (authError) {
      /*
        No todo fallo es "contraseña incorrecta": si el Auth server no responde
        (red del alumno, corte de Supabase) el mensaje anterior mandaba a la
        persona a reescribir una contraseña que sí era correcta.
      */
      const status = (authError as { status?: number }).status;
      const isCredentials = status === 400 || status === 401;
      setError(
        isCredentials
          ? ERROR_MESSAGES.invalid
          : "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
      );
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

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

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
        >
          Contraseña
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPwd ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-ca-ink-soft transition-colors hover:text-ca-ink"
          >
            {showPwd ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href={forgotHref}
          className="text-[12px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="mt-2 w-full py-3 text-[13px] uppercase tracking-[0.08em]"
        style={accent ? { background: accent } : undefined}
      >
        {loading ? (
          <>
            <span className="ca-spin-slow inline-block h-4 w-4 rounded-full border-2 border-white border-r-transparent" />
            Entrando…
          </>
        ) : (
          "Iniciar sesión"
        )}
      </Button>
    </form>
  );
}
