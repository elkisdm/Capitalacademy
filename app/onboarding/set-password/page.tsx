"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REQUIREMENTS = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Una letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Un número", test: (p: string) => /\d/.test(p) },
];

type Step = "exchanging" | "form" | "success" | "error";

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("exchanging");
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const exchangeCode = useCallback(async () => {
    const code = searchParams.get("code");
    if (!code) {
      setErrorMsg("Enlace de invitación inválido o expirado.");
      setStep("error");
      return;
    }

    const supabase = createClient();
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
    setTimeout(() => router.push("/onboarding/complete-profile"), 1500);
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
            Capital Academy
          </p>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "#c5f122" }}
          >
            Plataforma educativa
          </p>
        </div>

        {step === "exchanging" && (
          <div className="text-center">
            <div
              className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
              style={{ borderColor: "#5e17eb", borderTopColor: "transparent" }}
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
          </div>
        )}

        {step === "form" && (
          <>
            <h1
              className="mb-2 text-xl font-extrabold"
              style={{ color: "#14163a" }}
            >
              Crea tu contraseña
            </h1>
            <p className="mb-6 text-sm" style={{ color: "#6b6e8a" }}>
              Elige una contraseña segura para acceder a tu cuenta.
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
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
                  style={{
                    borderColor: "#e5e5ea",
                    color: "#14163a",
                  }}
                  placeholder="Mínimo 8 caracteres"
                />

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
                  <ul className="mt-3 space-y-1">
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
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2"
                  style={{
                    borderColor: "#e5e5ea",
                    color: "#14163a",
                  }}
                  placeholder="Repite tu contraseña"
                />
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>
                    Las contraseñas no coinciden
                  </p>
                )}
              </div>

              {errorMsg && step === "form" && (
                <p className="text-xs" style={{ color: "#ef4444" }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: "#5e17eb" }}
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
              <span className="text-xl" style={{ color: "#22c55e" }}>✓</span>
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
