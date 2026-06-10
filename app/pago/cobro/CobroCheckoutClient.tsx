"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { checkoutFormSchema } from "@/lib/fintoc/schema";
import { formatRut } from "@/lib/utils/rut";

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
  concept: string;
};

type Status = "idle" | "submitting" | "redirecting" | "error";

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CobroCheckoutClient({ amountClp, sig, concept }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

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
        body: JSON.stringify({ ...values, monto: amountClp, sig }),
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
            {priceFormatter.format(amountClp)}
          </span>
        </div>
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
          <Field
            label="RUT"
            error={errors.rut?.message}
            className="sm:col-span-2"
          >
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
          <Field
            label="Email"
            error={errors.email?.message}
            className="sm:col-span-2"
          >
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              className={inputCls}
            />
          </Field>
          <Field
            label="Teléfono"
            error={errors.phone?.message}
            className="sm:col-span-2"
          >
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
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] hover:shadow-[0_16px_40px_rgba(94,23,235,0.45)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isBusy
            ? "Procesando…"
            : `Pagar ${priceFormatter.format(amountClp)}`}
        </button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-ca-ink-soft)]/80">
          Pago seguro procesado por Flow · Webpay, transferencia y tarjetas.
        </p>
      </section>
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
