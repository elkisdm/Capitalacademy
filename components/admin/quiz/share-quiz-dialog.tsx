"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useFocusTrap } from "@/lib/utils/use-focus-trap";
import { LoaderIcon } from "./icons";

/**
 * Diálogo para compartir una evaluación con los alumnos: enlace deep-link +
 * código QR. El destino (`/classroom/quiz/<id>`) exige sesión y matrícula
 * activa (lo resuelve la propia página); aquí solo generamos enlace y QR.
 */
export function ShareQuizDialog({
  open,
  onClose,
  evaluationId,
  title,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  evaluationId: string;
  title: string;
  isActive: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // El enlace usa el origin actual (mismo dominio que el admin), derivado en
  // render para no depender de una env de URL pública ni de estado extra.
  const url = mounted ? `${window.location.origin}/classroom/quiz/${evaluationId}` : "";

  // Genera el QR cuando se abre el diálogo (sistema externo: la lib qrcode).
  useEffect(() => {
    if (!open || !url) return;
    let alive = true;
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (alive) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (alive) setQrDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [open, url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard puede fallar sin https/permiso; el alumno puede copiar a mano */
    }
  };

  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "evaluacion";

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          ref={trapRef}
          className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b px-6 py-4" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
            <div className="pr-3">
              <h2 className="text-[17px] font-black tracking-tight text-ca-ink">Compartir evaluación</h2>
              <p className="mt-0.5 text-[12.5px] text-ca-ink-soft">{title}</p>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
              aria-label="Cerrar"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 px-6 py-6">
            {!isActive && (
              <div className="w-full rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber-800">
                Esta evaluación está en borrador. Los alumnos verán el enlace, pero no podrán
                rendirla hasta que la actives.
              </div>
            )}

            {/* QR */}
            <div className="grid h-[224px] w-[224px] place-items-center rounded-2xl border border-ca-ink/[0.08] bg-white p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Código QR de la evaluación" width={200} height={200} />
              ) : (
                <LoaderIcon />
              )}
            </div>

            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`qr-${slug}.png`}
                className="text-[12.5px] font-bold text-ca-violet hover:underline"
              >
                Descargar QR (PNG)
              </a>
            )}

            {/* Enlace */}
            <div className="w-full">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                Enlace para alumnos
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-ca-bg-soft px-3 py-2.5 text-[12.5px] text-ca-ink outline-none"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-xl px-4 py-2.5 text-[12.5px] font-bold text-ca-ink transition-colors"
                  style={{ background: "var(--color-ca-lime)" }}
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-ca-ink-soft">
                Al abrirlo, el alumno inicia sesión (si hace falta) y vuelve directo a la
                evaluación. Requiere matrícula activa en el programa.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
