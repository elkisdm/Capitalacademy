"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { checkoutFormSchema } from "@/lib/fintoc/schema";
import { formatRut } from "@/lib/utils/rut";
import {
  COBRO_PLANS,
  COBRO_PLAN_KEYS,
  resolveCobroAmount,
  type CobroPlan,
} from "@/lib/cobro/plans";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { RadioGroup, Radio } from "@/components/ui/radio";

const cobroFormSchema = checkoutFormSchema.pick({
  firstname: true,
  lastname: true,
  rut: true,
  email: true,
  phone: true,
});
type CobroFormInput = z.input<typeof cobroFormSchema>;

type Props = {
  amountClp: number;
  sig: string;
  /** Concepto firmado tal cual viaja en la URL (vacío si no hay). */
  concepto: string;
  /** Texto a mostrar (concepto o default neutro). */
  concept: string;
};

type Status = "idle" | "submitting" | "redirecting" | "error";

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CobroCheckoutClient({
  amountClp,
  sig,
  concepto,
  concept,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [plan, setPlan] = useState<CobroPlan>("contado");

  // amountClp es el monto BASE (contado). El final con recargo se computa acá
  // para mostrarlo, pero el servidor lo recomputa: es la fuente de verdad.
  const finalAmount = resolveCobroAmount(amountClp, plan);
  const surcharge = finalAmount - amountClp;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CobroFormInput>({
    resolver: zodResolver(cobroFormSchema),
    mode: "onBlur",
  });

  const rutValue = watch("rut") ?? "";
  const isBusy =
    isSubmitting || status === "submitting" || status === "redirecting";

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage("");
    setStatus("submitting");
    try {
      const res = await fetch("/api/pago/cobro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, monto: amountClp, concepto, sig, plan }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "No pudimos iniciar el pago.");
      }
      const payload = (await res.json()) as { redirectUrl: string };
      setStatus("redirecting");
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* TOTAL */}
      <section className="rounded-3xl border border-[var(--color-ca-violet)]/15 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] px-6 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ca-violet)]">
              Total a pagar
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-ca-ink-soft)]">
              {concept}
            </p>
          </div>
          <span className="text-3xl font-black tracking-tight text-[var(--color-ca-ink)] sm:text-4xl">
            {priceFormatter.format(finalAmount)}
          </span>
        </div>
        {surcharge > 0 && (
          <p className="mt-2 text-[11px] text-[var(--color-ca-ink-soft)]">
            Valor base {priceFormatter.format(amountClp)} + recargo por uso de
            cuotas{" "}
            <span className="font-semibold text-[var(--color-ca-ink)]">
              {priceFormatter.format(surcharge)}
            </span>
          </p>
        )}
      </section>

      {/* FORMA DE PAGO */}
      <section className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_20px_60px_rgba(20,22,58,0.08)] sm:p-8">
        <header className="mb-4">
          <h2 className="text-base font-bold leading-tight text-[var(--color-ca-ink)] sm:text-lg">
            Forma de pago
          </h2>
          <p className="text-[11px] text-[var(--color-ca-ink-soft)]">
            Elige pagar al contado o en cuotas. Las cuotas incluyen un recargo.
          </p>
        </header>

        <fieldset>
          <legend className="sr-only">Forma de pago</legend>
          <RadioGroup
            value={plan}
            onChange={(value) => setPlan(value as CobroPlan)}
            name="cobro-plan"
            className="grid grid-cols-1 gap-2"
          >
            {COBRO_PLAN_KEYS.map((planKey) => {
              const config = COBRO_PLANS[planKey];
              const isSelected = plan === planKey;
              const planAmount = resolveCobroAmount(amountClp, planKey);
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
                        {config.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-ca-ink-soft)]">
                        {config.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-[var(--color-ca-ink)]">
                      {priceFormatter.format(planAmount)}
                    </span>
                  </span>
                </Radio>
              );
            })}
          </RadioGroup>
        </fieldset>
      </section>

      {/* DATOS */}
      <section className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_20px_60px_rgba(20,22,58,0.08)] sm:p-8">
        <header className="mb-5">
          <h2 className="text-base font-bold leading-tight text-[var(--color-ca-ink)] sm:text-lg">
            Tus datos
          </h2>
          <p className="text-[11px] text-[var(--color-ca-ink-soft)]">
            Necesitamos esto para emitir tu boleta.
          </p>
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
          <Field
            label="RUT"
            error={errors.rut?.message}
            className="sm:col-span-2"
          >
            <Input
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
            />
          </Field>
          <Field
            label="Email"
            error={errors.email?.message}
            className="sm:col-span-2"
          >
            <Input
              type="email"
              autoComplete="email"
              {...register("email")}
            />
          </Field>
          <Field
            label="Teléfono"
            error={errors.phone?.message}
            className="sm:col-span-2"
          >
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="+56 9 1234 5678"
              {...register("phone")}
            />
          </Field>
        </div>

        {errorMessage && (
          <p className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <Button
          type="submit"
          disabled={isBusy}
          className="mt-6 h-12 w-full text-sm uppercase tracking-[0.15em] shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(94,23,235,0.45)] active:scale-[0.98] disabled:hover:translate-y-0"
        >
          {isBusy
            ? "Procesando…"
            : `Pagar ${priceFormatter.format(finalAmount)}`}
        </Button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-ca-ink-soft)]/80">
          Pago seguro procesado por Flow · Webpay, transferencia y tarjetas.
        </p>
      </section>
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
        <span className="mt-1 block text-[11px] text-rose-600">{error}</span>
      )}
    </label>
  );
}
