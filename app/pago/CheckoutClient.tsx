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
        body: JSON.stringify(values),
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
      className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface-container)]/80 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:p-8"
    >
      <div className="mb-6 border-b border-[var(--border)] pb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-white/60">
            Total a pagar
          </span>
          <span className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            {priceFormatter.format(selectedAmount)}
          </span>
        </div>
        {selectedSurcharge > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/55">
            <span>
              Valor base {priceFormatter.format(DIPLOMADO_PRICE_CLP)} + recargo
              por uso de cuotas{" "}
              <span className="text-white/75">
                {priceFormatter.format(selectedSurcharge)}
              </span>
            </span>
          </div>
        )}
      </div>

      {availablePlans.length > 1 && (
        <fieldset className="mb-6">
          <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-white/60">
            Forma de pago
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {availablePlans.map((planKey) => {
              const plan = PAYMENT_PLANS[planKey];
              const isSelected = selectedPlan === planKey;
              return (
                <label
                  key={planKey}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    isSelected
                      ? "border-[var(--color-ca-lime)]/70 bg-[var(--color-ca-lime)]/[0.06]"
                      : "border-[var(--border)] bg-white/[0.02] hover:border-[var(--color-ca-lime)]/30"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      value={planKey}
                      {...register("plan")}
                      className="mt-1 h-4 w-4 accent-[var(--color-ca-lime)]"
                    />
                    <span className="block">
                      <span className="block text-sm font-semibold text-white">
                        {plan.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-white/55">
                        {plan.description}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-white">
                    {priceFormatter.format(plan.amount)}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.plan?.message && (
            <p className="mt-2 text-[11px] text-[var(--color-magenta-light)]">
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
        <p className="mt-5 rounded-md border border-[var(--color-magenta)]/30 bg-[var(--color-magenta)]/10 px-3 py-2 text-sm text-[var(--color-magenta-light)]">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(91,45,235,0.35)] transition-all duration-200 hover:bg-[var(--color-ca-violet-deep)] hover:shadow-[0_16px_40px_rgba(91,45,235,0.45)] hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isBusy ? "Procesando…" : "Pagar inscripción"}
      </button>

      <p className="mt-3 text-center text-[11px] text-white/45">
        Al continuar autorizas el cobro y aceptas las condiciones del Diplomado.
      </p>
    </form>
  );
}

const inputCls =
  "w-full h-11 rounded-lg border border-[var(--border)] bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors placeholder:text-white/35 hover:border-[var(--color-ca-lime)]/40 focus:border-[var(--color-ca-lime)]/70 focus:bg-white/[0.07] focus:ring-2 focus:ring-[var(--color-ca-violet)]/30";

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
      <span className="mb-1.5 block text-xs font-medium text-white/70">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-[11px] text-[var(--color-magenta-light)]">
          {error}
        </span>
      )}
    </label>
  );
}
