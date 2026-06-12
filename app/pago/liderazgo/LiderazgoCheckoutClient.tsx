"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  liderazgoCheckoutSchema,
  type LiderazgoCheckoutInput,
  LIDERAZGO_PLANS,
  LIDERAZGO_PLAN_KEYS,
  LIDERAZGO_LAUNCH_CODE,
  isLaunchCode,
  type LiderazgoPlan,
} from "@/lib/programs/liderazgo";
import { formatRut } from "@/lib/utils/rut";
import { COMUNIDAD_WHATSAPP_URL } from "@/lib/landing/constants";

type Status = "idle" | "submitting" | "redirecting" | "error";

type CheckoutResponse = {
  provider: "flow";
  paymentId: string;
  redirectUrl: string;
  amount: number;
};

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function LiderazgoCheckoutClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LiderazgoCheckoutInput>({
    resolver: zodResolver(liderazgoCheckoutSchema),
    mode: "onBlur",
    defaultValues: { plan: "lid-contado" },
  });

  const selectedPlan = (watch("plan") ?? "lid-contado") as LiderazgoPlan;
  const selectedConfig = LIDERAZGO_PLANS[selectedPlan];

  // El código de lanzamiento es de marketing (público): el cliente lo valida
  // solo para PREVISUALIZAR los precios. El monto cobrado lo recomputa el server.
  const [launchInput, setLaunchInput] = useState("");
  const [launchApplied, setLaunchApplied] = useState(false);
  const [launchError, setLaunchError] = useState("");

  function amountFor(plan: LiderazgoPlan): number {
    return launchApplied
      ? LIDERAZGO_PLANS[plan].launchAmount
      : LIDERAZGO_PLANS[plan].amount;
  }

  const selectedAmount = amountFor(selectedPlan);

  function applyLaunch() {
    setLaunchError("");
    const code = launchInput.trim();
    if (!code) return;
    if (isLaunchCode(code)) {
      setLaunchApplied(true);
      setLaunchInput(LIDERAZGO_LAUNCH_CODE);
    } else {
      setLaunchApplied(false);
      setLaunchError("Código inválido.");
    }
  }

  function removeLaunch() {
    setLaunchApplied(false);
    setLaunchInput("");
    setLaunchError("");
  }

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage("");
    setStatus("submitting");

    let payload: CheckoutResponse;
    try {
      const res = await fetch("/api/pago/liderazgo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          launchCode: launchApplied ? LIDERAZGO_LAUNCH_CODE : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "No pudimos iniciar el pago.");
      }
      payload = (await res.json()) as CheckoutResponse;
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      return;
    }

    setStatus("redirecting");
    window.location.assign(payload.redirectUrl);
  });

  const rutValue = watch("rut") ?? "";
  const isBusy =
    isSubmitting || status === "submitting" || status === "redirecting";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
        <li className="flex items-center gap-2 text-[var(--color-ca-violet)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-white">
            1
          </span>
          Tus datos
        </li>
        <span aria-hidden className="h-px flex-1 bg-[rgba(20,22,58,0.12)]" />
        <li className="flex items-center gap-2 text-[var(--color-ca-ink-soft)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(20,22,58,0.18)] bg-white">
            2
          </span>
          Plan y pago
        </li>
      </ol>

      {/* Card 1: DATOS PERSONALES */}
      <section className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_20px_60px_rgba(20,22,58,0.08)] sm:p-8">
        <header className="mb-5 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-xs font-black text-white">
            1
          </span>
          <div>
            <h2 className="text-base font-bold leading-tight text-[var(--color-ca-ink)] sm:text-lg">
              Tus datos
            </h2>
            <p className="text-[11px] text-[var(--color-ca-ink-soft)]">
              Necesitamos esto para emitir tu boleta y crear tu cuenta.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre" error={errors.firstname?.message}>
            <input
              type="text"
              autoComplete="given-name"
              {...register("firstname")}
              className={inputCls}
            />
          </Field>
          <Field label="Apellido" error={errors.lastname?.message}>
            <input
              type="text"
              autoComplete="family-name"
              {...register("lastname")}
              className={inputCls}
            />
          </Field>
          <Field label="RUT" error={errors.rut?.message} className="sm:col-span-2">
            <input
              type="text"
              inputMode="text"
              placeholder="12.345.678-9"
              value={rutValue}
              onChange={(e) =>
                setValue("rut", formatRut(e.target.value), {
                  shouldValidate: false,
                })
              }
              onBlur={(e) =>
                setValue("rut", formatRut(e.target.value), {
                  shouldValidate: true,
                })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              className={inputCls}
            />
          </Field>
          <Field label="Teléfono" error={errors.phone?.message} className="sm:col-span-2">
            <input
              type="tel"
              autoComplete="tel"
              placeholder="+56 9 1234 5678"
              {...register("phone")}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {/* Card 2: PLAN + PAGO */}
      <section className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_20px_60px_rgba(20,22,58,0.08)] sm:p-8">
        <header className="mb-5 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-xs font-black text-white">
            2
          </span>
          <div>
            <h2 className="text-base font-bold leading-tight text-[var(--color-ca-ink)] sm:text-lg">
              Plan y pago
            </h2>
            <p className="text-[11px] text-[var(--color-ca-ink-soft)]">
              Elige cómo quieres pagar e ingresa tu código de lanzamiento si lo
              tienes.
            </p>
          </div>
        </header>

        {/* Resumen del precio */}
        <div className="mb-5 rounded-2xl border border-[var(--color-ca-violet)]/15 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ca-violet)]">
              Total a pagar
            </span>
            <div className="flex items-baseline gap-2">
              {launchApplied && (
                <span
                  aria-label="Precio normal"
                  className="text-sm font-semibold text-[var(--color-ca-ink-soft)] line-through decoration-[var(--color-ca-ink-soft)]/60 sm:text-base"
                >
                  {priceFormatter.format(selectedConfig.amount)}
                </span>
              )}
              <span className="text-2xl font-black tracking-tight text-[var(--color-ca-ink)] sm:text-3xl">
                {priceFormatter.format(selectedAmount)}
              </span>
            </div>
          </div>
          {launchApplied && (
            <div className="mt-2 flex items-center justify-end">
              <span className="inline-flex items-center rounded-md bg-[var(--color-ca-lime)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ca-ink)]">
                Precio lanzamiento
              </span>
            </div>
          )}
        </div>

        {/* Código de lanzamiento */}
        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ca-ink-soft)]">
            ¿Tienes un código de lanzamiento?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={launchInput}
              onChange={(e) => setLaunchInput(e.target.value)}
              placeholder="Código de lanzamiento"
              disabled={launchApplied}
              className={`${inputCls} flex-1 disabled:opacity-60`}
            />
            {launchApplied ? (
              <button
                type="button"
                onClick={removeLaunch}
                className="h-11 shrink-0 rounded-lg border border-[rgba(20,22,58,0.12)] bg-white px-4 text-xs font-bold uppercase tracking-wider text-[var(--color-ca-ink-soft)] transition-colors hover:border-[var(--color-ca-violet)]/40 hover:text-[var(--color-ca-violet)]"
              >
                Quitar
              </button>
            ) : (
              <button
                type="button"
                onClick={applyLaunch}
                disabled={!launchInput.trim()}
                className="h-11 shrink-0 rounded-lg border border-[var(--color-ca-violet)]/30 bg-[var(--color-ca-violet)]/[0.06] px-4 text-xs font-bold uppercase tracking-wider text-[var(--color-ca-violet)] transition-colors hover:bg-[var(--color-ca-violet)]/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Aplicar
              </button>
            )}
          </div>
          {launchError && (
            <p className="mt-1 text-[11px] text-rose-600">{launchError}</p>
          )}
        </div>

        {/* Forma de pago */}
        <fieldset className="mb-5">
          <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-[var(--color-ca-ink-soft)]">
            Forma de pago
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {LIDERAZGO_PLAN_KEYS.map((planKey) => {
              const plan = LIDERAZGO_PLANS[planKey];
              const isSelected = selectedPlan === planKey;
              const planAmount = amountFor(planKey);
              return (
                <label
                  key={planKey}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    isSelected
                      ? "border-[var(--color-ca-violet)]/40 bg-[var(--color-ca-violet)]/[0.04]"
                      : "border-[rgba(20,22,58,0.1)] bg-white hover:border-[var(--color-ca-violet)]/30"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      value={planKey}
                      {...register("plan")}
                      className="mt-1 h-4 w-4 accent-[var(--color-ca-violet)]"
                    />
                    <span className="block">
                      <span className="block text-sm font-semibold text-[var(--color-ca-ink)]">
                        {plan.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-ca-ink-soft)]">
                        {plan.description}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    {launchApplied && (
                      <span className="text-[11px] font-medium text-[var(--color-ca-ink-soft)] line-through decoration-[var(--color-ca-ink-soft)]/60">
                        {priceFormatter.format(plan.amount)}
                      </span>
                    )}
                    <span className="text-sm font-bold text-[var(--color-ca-ink)]">
                      {priceFormatter.format(planAmount)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.plan?.message && (
            <p className="mt-2 text-[11px] text-rose-600">
              {errors.plan.message}
            </p>
          )}
        </fieldset>

        {errorMessage && (
          <p className="mb-5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:bg-[var(--color-ca-violet-deep)] hover:shadow-[0_16px_40px_rgba(94,23,235,0.45)] hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isBusy ? "Procesando…" : "Pagar inscripción"}
        </button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-ca-ink-soft)]/80">
          Al continuar autorizas el cobro y aceptas las condiciones del
          programa.
        </p>

        {/* Trust badges */}
        <ul className="mt-6 grid grid-cols-1 gap-3 border-t border-[rgba(20,22,58,0.08)] pt-5 text-[11px] sm:grid-cols-3">
          <li className="flex items-start gap-2 text-[var(--color-ca-ink-soft)]">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ca-violet)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span><strong className="text-[var(--color-ca-ink)]">Pago seguro</strong> · Cifrado por Flow</span>
          </li>
          <li className="flex items-start gap-2 text-[var(--color-ca-ink-soft)]">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ca-violet)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-7.5 4" />
              <polyline points="3 4 3 10 9 10" />
            </svg>
            <span><strong className="text-[var(--color-ca-ink)]">Garantía 10 días</strong> · Política SERNAC</span>
          </li>
          <li className="flex items-start gap-2 text-[var(--color-ca-ink-soft)]">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ca-violet)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span><strong className="text-[var(--color-ca-ink)]">Soporte humano</strong> · Te acompañamos antes y durante</span>
          </li>
        </ul>
      </section>

      {/* Link a asesor humano por WhatsApp */}
      <a
        href={COMUNIDAD_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/[0.06] px-5 py-3 text-sm font-semibold text-[var(--color-ca-ink)] transition-colors hover:bg-[#25D366]/[0.12]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#25D366]" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.296-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
        </svg>
        <span>
          ¿Tienes dudas? <span className="text-[var(--color-ca-violet)] underline-offset-2 hover:underline">Habla con un asesor</span>
        </span>
      </a>
    </form>
  );
}

const inputCls =
  "w-full h-11 rounded-xl border border-[rgba(20,22,58,0.12)] bg-[var(--color-ca-bg)] px-3 text-sm text-[var(--color-ca-ink)] outline-none transition-colors placeholder:text-[var(--color-ca-ink-soft)]/60 hover:border-[var(--color-ca-violet)]/40 focus:border-[var(--color-ca-violet)] focus:bg-white focus:ring-2 focus:ring-[var(--color-ca-violet)]/20";

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-ca-ink-soft)]">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-[11px] text-rose-600">{error}</span>
      )}
    </label>
  );
}
