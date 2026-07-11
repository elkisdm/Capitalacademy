"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// Origen resuelto en cliente: en prod es capitalacademy.cl, en preview/dev el
// deploy correspondiente. Fallback a prod para el render SSR (el modal solo se
// monta tras el click, ya en cliente, así que window siempre existe al usarse).
function checkinBase(): string {
  return typeof window !== "undefined"
    ? window.location.origin
    : "https://capitalacademy.cl";
}

/**
 * Botón + modal con el QR de asistencia de una sesión. El QR apunta a
 * /asistencia/<sessionId> (página pública de check-in). Pensado para copiar,
 * descargar o imprimir y pegar en el PPT de la clase.
 */
export function SessionQrButton({
  sessionId,
  sessionTitle,
  emphasized = false,
}: {
  sessionId: string;
  sessionTitle: string;
  emphasized?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={emphasized ? "lime" : "outline"}
        onClick={() => setOpen(true)}
        aria-label="QR de asistencia"
        className={`!h-auto gap-1.5 rounded-xl px-3 py-2 text-[12px] ${
          emphasized ? "" : "hover:border-ca-violet hover:text-ca-violet"
        }`}
      >
        <QrGlyph />
        QR
      </Button>
      <QrModal
        open={open}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function QrModal({
  open,
  sessionId,
  sessionTitle,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}) {
  const url = `${checkinBase()}/asistencia/${sessionId}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toString(url, {
      type: "svg",
      width: 260,
      margin: 1,
      color: { dark: "#14163a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((out) => {
        if (alive) setSvg(out);
      })
      .catch(() => {
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard no disponible */
    }
  }

  function downloadSvg() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `asistencia-qr-${sessionId}.svg`;
    a.click();
    URL.revokeObjectURL(href);
  }

  function print() {
    if (!svg) return;
    const w = window.open("", "_blank", "width=520,height=640");
    if (!w) return;
    w.document.write(
      `<!doctype html><title>QR asistencia</title>` +
        `<div style="font-family:system-ui;text-align:center;padding:32px">` +
        `<h2 style="font-size:18px;margin:0 0 4px">Asistencia — ${escapeHtml(sessionTitle)}</h2>` +
        `<p style="font-size:12px;color:#555;margin:0 0 16px">Escanea para registrar tu asistencia</p>` +
        `<div style="display:inline-block">${svg}</div>` +
        `<p style="font-size:11px;color:#888;margin-top:12px">${escapeHtml(url)}</p>` +
        `</div>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="session-qr-title"
      className="w-full max-w-[380px] overflow-hidden p-0"
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-ca-ink-soft">
            QR de asistencia
          </div>
          <h3
            id="session-qr-title"
            className="mt-0.5 truncate text-[15px] font-extrabold text-ca-ink"
          >
            {sessionTitle}
          </h3>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[18px] leading-none text-ca-ink-soft hover:!bg-transparent hover:text-ca-ink md:h-9 md:w-9"
        >
          ×
        </Button>
      </div>

      <div className="grid place-items-center px-5 pb-2">
        <div className="rounded-2xl bg-white p-4 shadow-inner">
          {svg ? (
            <div
              style={{ width: 220, height: 220 }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div
              style={{ width: 220, height: 220 }}
              className="grid place-items-center text-[12px] text-ca-ink-soft"
            >
              Generando…
            </div>
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 max-w-full truncate text-[11px] font-medium text-ca-violet hover:underline"
        >
          {url}
        </a>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-4">
        <Button
          variant="outline"
          onClick={copyLink}
          className="!h-auto flex-1 rounded-xl px-3 py-2 text-[12px] hover:border-ca-violet hover:text-ca-violet"
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </Button>
        <Button
          variant="outline"
          onClick={downloadSvg}
          disabled={!svg}
          className="!h-auto flex-1 rounded-xl px-3 py-2 text-[12px] hover:border-ca-violet hover:text-ca-violet"
        >
          Descargar SVG
        </Button>
        <Button
          variant="lime"
          onClick={print}
          disabled={!svg}
          className="!h-auto flex-1 rounded-xl px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
        >
          Imprimir
        </Button>
      </div>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function QrGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v7M14 21h3" />
    </svg>
  );
}
