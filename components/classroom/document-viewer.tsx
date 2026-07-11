"use client";

import { useEffect, useRef, useState } from "react";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { detectViewerKind, officeEmbedUrl } from "@/lib/classroom/resource-viewer";

// Tiempo máximo de espera para que cargue el embed de Office Online antes de
// degradar a un estado de error con descarga como acción primaria.
const OFFICE_PREVIEW_TIMEOUT_MS = 9000;

export type ViewerResource = {
  title: string;
  viewUrl: string | null;
  downloadUrl: string | null;
  storagePath: string | null;
  type: string;
};

type DocumentViewerProps = {
  resource: ViewerResource | null;
  onClose: () => void;
};

// Ancla estilizada como `Button` (no hay `asChild` en el design system propio,
// ver `components/ui/button.tsx` — el patrón de anchor-como-botón replica el
// de `components/classroom/resource-list.tsx`).
function DownloadLink({ href, variant = "outline" }: { href: string; variant?: "outline" | "primary" }) {
  return (
    <a
      href={href}
      download
      className={cn(
        "ca-btn-interactive inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40",
        variant === "primary" ? "ca-btn-primary" : "border border-ca-ink/[0.14] bg-transparent text-ca-ink hover:bg-ca-bg-soft",
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Descargar
    </a>
  );
}

/**
 * Visor de documentos in-app: PDF con pdf.js (propio, contra bytes privados),
 * Office vía embed de Microsoft Office Online, imágenes directas.
 *
 * Invariante de seguridad: HTML y SVG nunca se renderizan inline (los cubre
 * `detectViewerKind`, que los degrada a `'download'`) — evita ejecutar script
 * arbitrario servido desde el mismo origen firmado.
 */
export function DocumentViewer({ resource, onClose }: DocumentViewerProps) {
  const kind = resource
    ? detectViewerKind({
        storagePath: resource.storagePath,
        url: resource.viewUrl ?? resource.downloadUrl,
        type: resource.type,
      })
    : "download";

  return (
    <Dialog
      open={!!resource}
      onClose={onClose}
      aria-label={resource?.title ?? "Documento"}
      className="flex h-[85dvh] w-full max-w-5xl flex-col overflow-hidden p-0"
    >
      {resource && (
        <>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ca-ink/[0.08] px-5 py-3">
            <h2 className="min-w-0 truncate text-[14px] font-bold text-ca-ink">{resource.title}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {resource.downloadUrl && <DownloadLink href={resource.downloadUrl} />}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="ca-btn-interactive grid h-11 w-11 place-items-center rounded-full text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-ink md:h-9 md:w-9"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto bg-ca-bg-soft">
            <ViewerBody resource={resource} kind={kind} />
          </div>
        </>
      )}
    </Dialog>
  );
}

function ViewerBody({ resource, kind }: { resource: ViewerResource; kind: ReturnType<typeof detectViewerKind> }) {
  if (kind === "pdf" && resource.viewUrl) {
    return <PdfCanvas url={resource.viewUrl} downloadUrl={resource.downloadUrl} />;
  }

  if (kind === "office" && resource.viewUrl) {
    return <OfficePreview url={resource.viewUrl} title={resource.title} downloadUrl={resource.downloadUrl} />;
  }

  if (kind === "image" && resource.viewUrl) {
    return <ImagePreview url={resource.viewUrl} title={resource.title} downloadUrl={resource.downloadUrl} />;
  }

  return (
    <UnsupportedState title="No se puede previsualizar este archivo" downloadUrl={resource.downloadUrl} />
  );
}

function UnsupportedState({ title, downloadUrl }: { title: string; downloadUrl: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-[14px] font-bold text-ca-ink">{title}</p>
      {downloadUrl ? (
        <DownloadLink href={downloadUrl} variant="primary" />
      ) : (
        <p className="text-[13px] text-ca-ink-soft">Este recurso no está disponible.</p>
      )}
    </div>
  );
}

function OfficePreview({ url, title, downloadUrl }: { url: string; title: string; downloadUrl: string | null }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  // Si el iframe no avisa carga dentro del timeout, degrada a un estado de
  // error claro en vez de dejar al alumno viendo un iframe en blanco.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setStatus("error"), OFFICE_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === "error") {
    return (
      <UnsupportedState
        title="No pudimos mostrar la vista previa. Descarga el archivo para verlo."
        downloadUrl={downloadUrl}
      />
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ca-bg-soft">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ca-violet border-t-transparent" />
        </div>
      )}
      <iframe
        src={officeEmbedUrl(url)}
        className="h-full w-full border-0"
        title={title}
        onLoad={() => setStatus("loaded")}
      />
      {status === "loaded" && (
        <p className="shrink-0 border-t border-ca-ink/[0.08] bg-ca-surface px-4 py-2 text-center text-[11px] text-ca-ink-soft">
          Vista previa procesada por Microsoft Office Online.{" "}
          {downloadUrl && (
            <a href={downloadUrl} download className="font-bold text-ca-violet hover:underline">
              ¿No se ve? Descárgalo.
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function ImagePreview({ url, title, downloadUrl }: { url: string; title: string; downloadUrl: string | null }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (status === "error") {
    return <UnsupportedState title="No se pudo cargar la imagen" downloadUrl={downloadUrl} />;
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      {status === "loading" && (
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ca-violet border-t-transparent" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        className={cn("mx-auto max-h-full max-w-full object-contain", status !== "loaded" && "hidden")}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}

function PdfCanvas({ url, downloadUrl }: { url: string; downloadUrl: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);

  // Carga el documento una vez por URL.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    setPage(1);
    setNumPages(0);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }
        const bytes = await fetch(url, { signal: controller.signal }).then((r) => {
          if (!r.ok) throw new Error(`fetch pdf ${r.status}`);
          return r.arrayBuffer();
        });
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus("ready");
      } catch (err) {
        // Un abort() al cerrar/cambiar de recurso dispara un error esperado.
        console.error("pdf load error", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      renderTaskRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url]);

  // Renderiza la página activa.
  useEffect(() => {
    if (status !== "ready" || !docRef.current || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      const doc = docRef.current;
      if (!doc) return;
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        const targetWidth = canvas.parentElement?.clientWidth ?? 800;
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const scale = targetWidth / unscaledViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        // Renderiza al tamaño físico de pixeles (dpr) pero mantiene el
        // tamaño lógico en CSS, para nitidez en pantallas retina/HiDPI.
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.scale(dpr, dpr);

        const renderTask = pdfPage.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        // Un cancel()/destroy() dispara una excepción esperada; solo tratamos
        // como error real (visible) lo que no venga de una cancelación.
        if (!cancelled) {
          console.error("pdf render error", err);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [status, page]);

  if (status === "error") {
    return <UnsupportedState title="No se pudo cargar el PDF" downloadUrl={downloadUrl} />;
  }

  return (
    <div className="flex h-full flex-col items-center gap-3 p-4">
      {status === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ca-violet border-t-transparent" />
        </div>
      )}
      <div className={cn("w-full flex-1 overflow-auto", status !== "ready" && "hidden")}>
        <canvas ref={canvasRef} className="mx-auto shadow-sm" />
      </div>
      {status === "ready" && numPages > 1 && (
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="ca-btn-interactive grid h-11 w-11 place-items-center rounded-full border border-ca-ink/[0.1] text-ca-ink disabled:pointer-events-none disabled:opacity-40 md:h-9 md:w-9"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-[12px] font-semibold text-ca-ink-soft">
            {page} / {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            aria-label="Página siguiente"
            className="ca-btn-interactive grid h-11 w-11 place-items-center rounded-full border border-ca-ink/[0.1] text-ca-ink disabled:pointer-events-none disabled:opacity-40 md:h-9 md:w-9"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
