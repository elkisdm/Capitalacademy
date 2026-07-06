"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  monto: number | null;
  concepto: string;
  generatedLink: string | null;
  error: string | null;
  maxClp: number;
  maxConceptoLen: number;
};

const priceFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function CobroGenerator({
  monto,
  concepto,
  generatedLink,
  error,
  maxClp,
  maxConceptoLen,
}: Props) {
  const router = useRouter();
  const [input, setInput] = useState(monto ? String(monto) : "");
  const [conceptoInput, setConceptoInput] = useState(concepto);
  const [copied, setCopied] = useState(false);

  const parsed = Number(input.replace(/\D/g, ""));
  const canGenerate = Number.isInteger(parsed) && parsed > 0 && parsed <= maxClp;

  function generate() {
    if (!canGenerate) return;
    setCopied(false);
    const c = conceptoInput.trim().slice(0, maxConceptoLen);
    const q = c ? `&concepto=${encodeURIComponent(c)}` : "";
    router.push(`/admin/cobros?monto=${parsed}${q}`);
  }

  async function copy() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado: el usuario puede copiar manual */
    }
  }

  return (
    <div className="space-y-6">
      {/* Generador */}
      <div className="rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_12px_40px_rgba(20,22,58,0.06)]">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)]">
          Monto a cobrar (CLP)
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Monto a cobrar en pesos chilenos"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") generate();
            }}
            placeholder="200000"
            className="h-12 flex-1 rounded-xl border border-[rgba(20,22,58,0.12)] bg-[var(--color-ca-bg)] px-4 text-base font-semibold text-[var(--color-ca-ink)] outline-none transition-colors focus:border-[var(--color-ca-violet)] focus:bg-white focus:ring-2 focus:ring-[var(--color-ca-violet)]/20"
          />
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--color-ca-violet)] px-6 text-sm font-bold uppercase tracking-[0.15em] text-white transition-colors hover:bg-[var(--color-ca-violet-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generar link
          </button>
        </div>

        <label className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)]">
          Concepto <span className="font-medium normal-case tracking-normal text-[var(--color-ca-ink-soft)]/70">(opcional — lo verá quien paga)</span>
        </label>
        <input
          type="text"
          aria-label="Concepto del cobro"
          value={conceptoInput}
          maxLength={maxConceptoLen}
          onChange={(e) => setConceptoInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") generate();
          }}
          placeholder="Pago a Capital Academy"
          className="h-12 w-full rounded-xl border border-[rgba(20,22,58,0.12)] bg-[var(--color-ca-bg)] px-4 text-base text-[var(--color-ca-ink)] outline-none transition-colors focus:border-[var(--color-ca-violet)] focus:bg-white focus:ring-2 focus:ring-[var(--color-ca-violet)]/20"
        />
        {canGenerate && (
          <p className="mt-2 text-sm text-[var(--color-ca-ink-soft)]">
            Vas a generar un link de cobro por{" "}
            <strong className="text-[var(--color-ca-ink)]">
              {priceFormatter.format(parsed)}
            </strong>
            .
          </p>
        )}
      </div>

      {/* Error de firma/validación */}
      {error && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Resultado */}
      {generatedLink && (
        <div className="rounded-2xl border border-[var(--color-ca-violet)]/20 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ca-violet)]">
            Link de cobro {monto ? `· ${priceFormatter.format(monto)}` : ""}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              readOnly
              aria-label="Link de cobro generado"
              value={generatedLink}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 flex-1 rounded-xl border border-[rgba(20,22,58,0.12)] bg-white px-3 text-sm text-[var(--color-ca-ink)] outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-ca-ink)] px-5 text-sm font-bold text-white transition-colors hover:opacity-90"
              >
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
              <a
                href={generatedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgba(20,22,58,0.15)] bg-white px-5 text-sm font-bold text-[var(--color-ca-ink)] transition-colors hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
              >
                Abrir
              </a>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-ca-ink-soft)]">
            Comparte este link con quien va a pagar. El monto va firmado: si lo
            modifican, el cobro se rechaza.
          </p>
        </div>
      )}
    </div>
  );
}
