"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  checkoutFormSchema,
  type CheckoutFormInput,
} from "@/lib/fintoc/schema";
import {
  DIPLOMADO_PRICE_CLP,
  PAYMENT_PLANS,
  PAYMENT_PLAN_KEYS,
  type PaymentPlan,
} from "@/lib/flow/checkout";
import type { PaymentProvider } from "@/lib/payments/provider";
import { formatRut } from "@/lib/utils/rut";
import {
  COMUNIDAD_WHATSAPP_URL,
  DIPLOMADO_REGULAR_PRICE_CLP,
} from "@/lib/landing/constants";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { RadioGroup, Radio } from "@/components/ui/radio";

type Props = { provider: PaymentProvider };
type Status = "idle" | "submitting" | "loading-widget" | "ready" | "error";

type CheckoutResponse =
  | {
      provider: "flow";
      paymentId: string;
      redirectUrl: string;
      amount: number;
    }
  | {
      provider: "fintoc";
      paymentId: string;
      sessionToken: string;
      amount: number;
    };

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CheckoutClient({ provider }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const widgetRef = useRef<{ open: () => void; destroy: () => void } | null>(
    null,
  );

  // Fintoc no soporta cuotas con recargo: solo plan contado.
  const availablePlans = useMemo<PaymentPlan[]>(
    () => (provider === "flow" ? PAYMENT_PLAN_KEYS : ["contado"]),
    [provider],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormInput>({
    resolver: zodResolver(checkoutFormSchema),
    mode: "onBlur",
    defaultValues: { plan: "contado" },
  });

  const selectedPlan = (watch("plan") ?? "contado") as PaymentPlan;
  const selectedAmount = PAYMENT_PLANS[selectedPlan].amount;
  const selectedSurcharge = selectedAmount - DIPLOMADO_PRICE_CLP;

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    percentOff: number;
    label: string | null;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  const discountClp = coupon
    ? Math.round((selectedAmount * coupon.percentOff) / 100)
    : 0;
  const finalAmount = selectedAmount - discountClp;

  async function applyCoupon() {
    setCouponError("");
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    try {
      const res = await fetch("/api/pago/cupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, plan: selectedPlan }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        coupon?: { code: string; percentOff: number; label: string | null };
        error?: string;
      };
      if (!res.ok || !data.coupon) {
        setCoupon(null);
        setCouponError(data.error ?? "Cupón inválido.");
        return;
      }
      setCoupon(data.coupon);
      setCouponInput(data.coupon.code);
    } catch {
      setCouponError("No pudimos validar el cupón.");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError("");
  }

  useEffect(
    () => () => {
      widgetRef.current?.destroy();
      widgetRef.current = null;
    },
    [],
  );

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage("");
    setStatus("submitting");

    let payload: CheckoutResponse;
    try {
      const res = await fetch("/api/pago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          couponCode: coupon?.code,
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
      setErrorMessage(
        err instanceof Error ? err.message : "Error inesperado.",
      );
      return;
    }

    if (payload.provider === "flow") {
      setStatus("loading-widget");
      window.location.assign(payload.redirectUrl);
      return;
    }

    // provider === "fintoc" — widget embebido
    setStatus("loading-widget");
    const publicKey = process.env.NEXT_PUBLIC_FINTOC_PUBLIC_KEY;
    if (!publicKey) {
      setStatus("error");
      setErrorMessage("Falta NEXT_PUBLIC_FINTOC_PUBLIC_KEY.");
      return;
    }

    try {
      const { getFintoc } = await import("@fintoc/fintoc-js");
      const Fintoc = await getFintoc();
      if (!Fintoc) throw new Error("No se pudo cargar Fintoc.");
      widgetRef.current?.destroy();
      const widget = Fintoc.create({
        product: "payments",
        publicKey,
        sessionToken: payload.sessionToken,
        onSuccess: () => {
          widgetRef.current?.destroy();
          widgetRef.current = null;
          router.push(`/pago/gracias?id=${payload.paymentId}`);
        },
        onExit: () => {
          setStatus("ready");
        },
      });
      widgetRef.current = widget;
      widget.open();
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Error abriendo el checkout.",
      );
    }
  });

  const rutValue = watch("rut") ?? "";
  const isBusy =
    isSubmitting || status === "submitting" || status === "loading-widget";

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
            <Input
              type="text"
              autoComplete="given-name"
              {...register("firstname")}
            />
          </Field>
          <Field label="Apellido" error={errors.lastname?.message}>
            <Input
              type="text"
              autoComplete="family-name"
              {...register("lastname")}
            />
          </Field>
          <Field label="RUT" error={errors.rut?.message} className="sm:col-span-2">
            <Input
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
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
            />
          </Field>
          <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
            <Input
              type="email"
              autoComplete="email"
              {...register("email")}
            />
          </Field>
          <Field label="Teléfono" error={errors.phone?.message} className="sm:col-span-2">
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="+56 9 1234 5678"
              {...register("phone")}
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
              Elige cómo quieres pagar y aplica un cupón si tienes.
            </p>
          </div>
        </header>

        {/* Resumen del precio con descuento */}
        <div className="mb-5 rounded-2xl border border-[var(--color-ca-violet)]/15 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ca-violet)]">
              Total a pagar
            </span>
            <div className="flex items-baseline gap-2">
              <span
                aria-label="Precio regular"
                className="text-sm font-semibold text-[var(--color-ca-ink-soft)] line-through decoration-[var(--color-ca-ink-soft)]/60 sm:text-base"
              >
                {priceFormatter.format(DIPLOMADO_REGULAR_PRICE_CLP)}
              </span>
              <span className="text-2xl font-black tracking-tight text-[var(--color-ca-ink)] sm:text-3xl">
                {priceFormatter.format(finalAmount)}
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <span className="inline-flex items-center rounded-md bg-[var(--color-ca-lime)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ca-ink)]">
              −50% Lanzamiento
            </span>
          </div>
          {selectedSurcharge > 0 && (
            <p className="mt-2 text-[11px] text-[var(--color-ca-ink-soft)]">
              Valor base {priceFormatter.format(DIPLOMADO_PRICE_CLP)} + recargo
              por uso de cuotas{" "}
              <span className="font-semibold text-[var(--color-ca-ink)]">
                {priceFormatter.format(selectedSurcharge)}
              </span>
            </p>
          )}
          {coupon && (
            <p className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--color-ca-violet-deep)]">
              <span>
                Cupón <strong>{coupon.code}</strong> aplicado · −{coupon.percentOff}%
              </span>
              <span className="font-semibold text-[var(--color-ca-ink)]">
                −{priceFormatter.format(discountClp)}
              </span>
            </p>
          )}
        </div>

        {/* Cupón */}
        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ca-ink-soft)]">
            ¿Tienes un cupón?
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Código de cupón"
              disabled={!!coupon || couponLoading}
              className="h-11 flex-1"
            />
            {coupon ? (
              <Button
                type="button"
                variant="outline"
                onClick={removeCoupon}
                className="h-11 shrink-0 rounded-lg px-4 text-xs uppercase tracking-wider"
              >
                Quitar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={applyCoupon}
                disabled={couponLoading || !couponInput.trim()}
                className="h-11 shrink-0 rounded-lg border-[var(--color-ca-violet)]/30 bg-[var(--color-ca-violet)]/[0.06] px-4 text-xs uppercase tracking-wider text-[var(--color-ca-violet)] hover:bg-[var(--color-ca-violet)]/[0.12]"
              >
                {couponLoading ? "…" : "Aplicar"}
              </Button>
            )}
          </div>
          {couponError && (
            <p className="mt-1 text-[11px] text-rose-600">{couponError}</p>
          )}
        </div>

        {/* Forma de pago (solo si > 1 plan) */}
        {availablePlans.length > 1 && (
          <fieldset className="mb-5">
            <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-[var(--color-ca-ink-soft)]">
              Forma de pago
            </legend>
            <Controller
              name="plan"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? "contado"}
                  onChange={field.onChange}
                  name="plan"
                  className="grid grid-cols-1 gap-2"
                >
                  {availablePlans.map((planKey) => {
                    const plan = PAYMENT_PLANS[planKey];
                    const isSelected = selectedPlan === planKey;
                    const planDiscount = coupon
                      ? Math.round((plan.amount * coupon.percentOff) / 100)
                      : 0;
                    const planFinalAmount = plan.amount - planDiscount;
                    return (
                      <Radio
                        key={planKey}
                        value={planKey}
                        className={`rounded-xl border px-4 py-3 transition-colors ${
                          isSelected
                            ? "border-[var(--color-ca-violet)]/40 bg-[var(--color-ca-violet)]/[0.04]"
                            : "border-[rgba(20,22,58,0.1)] bg-white hover:border-[var(--color-ca-violet)]/30"
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="block">
                            <span className="block text-sm font-semibold text-[var(--color-ca-ink)]">
                              {plan.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[var(--color-ca-ink-soft)]">
                              {plan.description}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            {coupon && (
                              <span className="text-[11px] font-medium text-[var(--color-ca-ink-soft)] line-through decoration-[var(--color-ca-ink-soft)]/60">
                                {priceFormatter.format(plan.amount)}
                              </span>
                            )}
                            <span className="text-sm font-bold text-[var(--color-ca-ink)]">
                              {priceFormatter.format(planFinalAmount)}
                            </span>
                          </span>
                        </span>
                      </Radio>
                    );
                  })}
                </RadioGroup>
              )}
            />
            {errors.plan?.message && (
              <p className="mt-2 text-[11px] text-rose-600">
                {errors.plan.message}
              </p>
            )}
          </fieldset>
        )}

        {errorMessage && (
          <p className="mb-5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <Button
          type="submit"
          disabled={isBusy}
          className="h-12 w-full text-sm uppercase tracking-[0.15em] shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:shadow-[0_16px_40px_rgba(94,23,235,0.45)] hover:-translate-y-0.5 active:scale-[0.98] disabled:hover:translate-y-0"
        >
          {isBusy ? "Procesando…" : "Pagar inscripción"}
        </Button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-ca-ink-soft)]/80">
          Al continuar autorizas el cobro y aceptas las condiciones del Diplomado.
        </p>

        {/* Trust badges */}
        <ul className="mt-6 grid grid-cols-1 gap-3 border-t border-[rgba(20,22,58,0.08)] pt-5 text-[11px] sm:grid-cols-3">
          <li className="flex items-start gap-2 text-[var(--color-ca-ink-soft)]">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ca-violet)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span><strong className="text-[var(--color-ca-ink)]">Pago seguro</strong> · Cifrado por {provider === "flow" ? "Flow" : "Fintoc"}</span>
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
        <span className="mt-1 block text-[11px] text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}
