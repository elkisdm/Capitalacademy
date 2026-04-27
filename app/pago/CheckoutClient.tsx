"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getFintoc } from "@fintoc/fintoc-js";
import {
  checkoutFormSchema,
  type CheckoutFormInput,
} from "@/lib/fintoc/schema";
import { formatRut } from "@/lib/utils/rut";

type Props = { priceClp: number };
type Status = "idle" | "submitting" | "loading-widget" | "ready" | "error";

interface CheckoutResponse {
  paymentId: string;
  sessionToken: string;
  amount: number;
}

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CheckoutClient({ priceClp }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const widgetRef = useRef<{ open: () => void; destroy: () => void } | null>(
    null,
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
  });

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
      <div className="mb-6 flex items-baseline justify-between border-b border-[var(--border)] pb-4">
        <span className="text-xs font-medium uppercase tracking-widest text-white/60">
          Total a pagar
        </span>
        <span className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          {priceFormatter.format(priceClp)}
        </span>
      </div>

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
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-aqua)] text-sm font-bold uppercase tracking-[0.15em] text-black transition-all duration-200 hover:bg-[var(--color-aqua-light)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
  "w-full h-11 rounded-lg border border-[var(--border)] bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors placeholder:text-white/35 hover:border-white/25 focus:border-[var(--color-aqua)]/60 focus:bg-white/[0.07]";

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
