"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_BRAND, type ProgramBrand } from "@/lib/programs/registry";

const REQUIREMENTS = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Una letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Un número", test: (p: string) => /\d/.test(p) },
];

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

type Step = "exchanging" | "form" | "success" | "error";

export function SetPasswordForm({
  brand = DEFAULT_BRAND,
}: {
  brand?: ProgramBrand;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Complete-profile branded del mismo entorno (genérico para la marca default).
  const completeProfilePath =
    brand.slug === DEFAULT_BRAND.slug
      ? "/onboarding/complete-profile"
      : `/onboarding/${brand.slug}/complete-profile`;

  const loginPath =
    brand.slug === DEFAULT_BRAND.slug ? "/login" : `/login/${brand.slug}`;
  const [step, setStep] = useState<Step>("exchanging");
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const exchangeCode = useCallback(async () => {
    const supabase = createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setStep("form");
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      setErrorMsg("Enlace de invitación inválido o expirado.");
      setStep("error");
      return;
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      setErrorMsg(
        error.message.includes("expired")
          ? "El enlace de invitación ha expirado. Contacta al administrador para recibir uno nuevo."
          : `Error al verificar la invitación: ${error.message}`,
      );
      setStep("error");
      return;
    }

    setStep("form");
  }, [searchParams]);

  useEffect(() => {
    exchangeCode();
  }, [exchangeCode]);

  const strength = REQUIREMENTS.filter((r) => r.test(password)).length;
  const allPassed = strength === REQUIREMENTS.length;
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = allPassed && passwordsMatch && !saving;

  const strengthPercent = (strength / REQUIREMENTS.length) * 100;
  const strengthColor =
    strength <= 1
      ? "#ef4444"
      : strength <= 2
        ? "#f59e0b"
        : strength <= 3
          ? "#3b82f6"
          : "#22c55e";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(`Error al guardar contraseña: ${error.message}`);
      setSaving(false);
      return;
    }

    setStep("success");

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let redirectPath = completeProfilePath;
    if (currentUser) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", currentUser.id)
        .single();
      if (profile?.onboarding_completed_at) {
        redirectPath = "/classroom";
      }
    }
    setTimeout(() => router.push(redirectPath), 1500);
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "#070a29" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[22px] font-black tracking-tight" style={{ color: "#14163a" }}>
            {brand.shortName}
          </p>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: brand.accent }}
          >
            {brand.eyebrow}
          </p>
        </div>

        {step === "exchanging" && (
          <div className="text-center">
            <div
              className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
              style={{ borderColor: brand.accent, borderTopColor: "transparent" }}
            />
            <p className="text-sm" style={{ color: "#6b6e8a" }}>
              Verificando tu invitación&hellip;
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "#fef2f2" }}
            >
              <span className="text-xl">✕</span>
            </div>
            <p className="mb-2 text-base font-semibold" style={{ color: "#14163a" }}>
              No pudimos verificar tu invitación
            </p>
            <p className="text-sm" style={{ color: "#6b6e8a" }}>
              {errorMsg}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href={loginPath}
                className="rounded-lg px-4 py-2.5 text-sm font-bold text-white"
                style={{ background: brand.accent }}
              >
                Ir al login
              </a>
              <a
                href="/forgot-password"
                className="text-sm font-semibold"
                style={{ color: brand.accent }}
              >
                Recuperar contraseña
              </a>
            </div>
          </div>
        )}

        {step === "form" && (
          <>
            <h1
              className="mb-2 text-xl font-extrabold"
              style={{ color: "#14163a" }}
            >
              {brand.onboarding.setPasswordTitle}
            </h1>
            <p className="mb-6 text-sm" style={{ color: "#6b6e8a" }}>
              {brand.onboarding.setPasswordSubtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#6b6e8a" }}
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border px-4 py-3 pr-12 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: "#e5e5ea",
                      color: "#14163a",
                    }}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9db5] transition-colors hover:text-[#14163a]"
                  >
                    {showPwd ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                {/* Strength bar */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: "#f0f0f3" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${strengthPercent}%`,
                          background: strengthColor,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Requirements checklist */}
                {password.length > 0 && (
                  <ul className="mt-3 space-y-1" aria-live="polite">
                    {REQUIREMENTS.map((req) => {
                      const passed = req.test(password);
                      return (
                        <li
                          key={req.label}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: passed ? "#22c55e" : "#9b9db5" }}
                        >
                          <span>{passed ? "✓" : "○"}</span>
                          {req.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#6b6e8a" }}
                >
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-lg border px-4 py-3 pr-12 text-sm outline-none transition-shadow focus:ring-2"
                    style={{
                      borderColor: "#e5e5ea",
                      color: "#14163a",
                    }}
                    placeholder="Repite tu contraseña"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9db5] transition-colors hover:text-[#14163a]"
                  >
                    {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1.5 text-xs" aria-live="polite" style={{ color: "#ef4444" }}>
                    Las contraseñas no coinciden
                  </p>
                )}
              </div>

              {errorMsg && step === "form" && (
                <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: brand.accent }}
              >
                {saving ? "Guardando…" : "Crear contraseña"}
              </button>
            </form>
          </>
        )}

        {step === "success" && (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "#f0fdf4" }}
            >
              <span className="text-xl" style={{ color: "#22c55e" }}>{"✓"}</span>
            </div>
            <p className="mb-2 text-base font-semibold" style={{ color: "#14163a" }}>
              Contraseña creada
            </p>
            <p className="text-sm" style={{ color: "#6b6e8a" }}>
              Redirigiendo a completar tu perfil&hellip;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
