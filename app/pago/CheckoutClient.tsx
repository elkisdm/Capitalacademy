"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getFintoc } from "@fintoc/fintoc-js";
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
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_20px_60px_rgba(20,22,58,0.08)] sm:p-8"
    >
      <div className="mb-6 border-b border-[rgba(20,22,58,0.08)] pb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-ca-ink-soft)]">
            Total a pagar
          </span>
          <span className="text-2xl font-black tracking-tight text-[var(--color-ca-ink)] sm:text-3xl">
            {priceFormatter.format(finalAmount)}
          </span>
        </div>
        {selectedSurcharge > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--color-ca-ink-soft)]">
            <span>
              Valor base {priceFormatter.format(DIPLOMADO_PRICE_CLP)} + recargo
              por uso de cuotas{" "}
              <span className="font-semibold text-[var(--color-ca-ink)]">
                {priceFormatter.format(selectedSurcharge)}
              </span>
            </span>
          </div>
        )}
        {coupon && (
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--color-ca-violet-deep)]">
            <span>
              Cupón <strong>{coupon.code}</strong> aplicado · −{coupon.percentOff}%
            </span>
            <span className="font-semibold text-[var(--color-ca-ink)]">
              −{priceFormatter.format(discountClp)}
            </span>
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-medium text-[var(--color-ca-ink-soft)]">
          ¿Tienes un cupón?
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            placeholder="Código de cupón"
            disabled={!!coupon || couponLoading}
            className={`${inputCls} flex-1 disabled:opacity-60`}
          />
          {coupon ? (
            <button
              type="button"
              onClick={removeCoupon}
              className="h-11 shrink-0 rounded-lg border border-[rgba(20,22,58,0.12)] bg-white px-4 text-xs font-bold uppercase tracking-wider text-[var(--color-ca-ink-soft)] transition-colors hover:border-[var(--color-ca-violet)]/40 hover:text-[var(--color-ca-violet)]"
            >
              Quitar
            </button>
          ) : (
            <button
              type="button"
              onClick={applyCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="h-11 shrink-0 rounded-lg border border-[var(--color-ca-violet)]/30 bg-[var(--color-ca-violet)]/[0.06] px-4 text-xs font-bold uppercase tracking-wider text-[var(--color-ca-violet)] transition-colors hover:bg-[var(--color-ca-violet)]/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {couponLoading ? "…" : "Aplicar"}
            </button>
          )}
        </div>
        {couponError && (
          <p className="mt-1 text-[11px] text-rose-600">
            {couponError}
          </p>
        )}
      </div>

      {availablePlans.length > 1 && (
        <fieldset className="mb-6">
          <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-[var(--color-ca-ink-soft)]">
            Forma de pago
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {availablePlans.map((planKey) => {
              const plan = PAYMENT_PLANS[planKey];
              const isSelected = selectedPlan === planKey;
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
                  <span className="shrink-0 text-sm font-bold text-[var(--color-ca-ink)]">
                    {priceFormatter.format(plan.amount)}
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
      )}

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

      {errorMessage && (
        <p className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:bg-[var(--color-ca-violet-deep)] hover:shadow-[0_16px_40px_rgba(94,23,235,0.45)] hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isBusy ? "Procesando…" : "Pagar inscripción"}
      </button>

      <p className="mt-3 text-center text-[11px] text-[var(--color-ca-ink-soft)]/80">
        Al continuar autorizas el cobro y aceptas las condiciones del Diplomado.
      </p>
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
        <span className="mt-1 block text-[11px] text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}
