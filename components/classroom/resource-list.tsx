"use client";

import { useState } from "react";
import { DocumentViewer, type ViewerResource } from "@/components/classroom/document-viewer";
import { detectViewerKind } from "@/lib/classroom/resource-viewer";

export type DisplayResource = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  // Signed URL sin forzar descarga, para el visor in-app (null en links externos
  // o si aún no se resolvió). Opcional: filas crudas de Supabase no la traen.
  viewUrl?: string | null;
  storage_path?: string | null;
};

const TONE: Record<string, string> = {
  pdf: "#e11d48",
  link: "#5e17eb",
  template: "#a8d310",
  document: "#2a3287",
};

const ICON: Record<string, string> = {
  pdf: "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M9 14h6M9 18h4",
  link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  template: "M3 3h18v18H3zM3 9h18M9 21V9",
};

const TYPE_LABEL: Record<string, string> = {
  link: "Link externo",
  template: "Plantilla editable",
  pdf: "PDF",
  document: "Documento",
};

/** Grilla reutilizable de tarjetas de recurso (lección, sesión, centro de recursos). */
export function ResourceList({
  resources,
  table = "lesson",
}: {
  resources: DisplayResource[];
  table?: "lesson" | "session";
}) {
  const [active, setActive] = useState<ViewerResource | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Link externo: la URL no expira; se usa tal cual sin llamar al endpoint.
  // Archivo subido: se pide una signed URL fresca al clic (anti-IDOR + evita
  // que expire la firma de 2 h que vive en el render).
  async function freshUrls(
    r: DisplayResource,
  ): Promise<{ viewUrl: string | null; downloadUrl: string | null } | null> {
    if (!r.storage_path) return { viewUrl: null, downloadUrl: r.url };
    try {
      const res = await fetch(`/api/classroom/resources/${r.id}/url?table=${table}`);
      if (!res.ok) return null;
      return (await res.json()) as { viewUrl: string | null; downloadUrl: string | null };
    } catch {
      return null;
    }
  }

  async function handleView(r: DisplayResource) {
    setBusyId(r.id);
    const fresh = await freshUrls(r);
    setBusyId(null);
    // Si falla, el visor abre con URLs nulas → UnsupportedState visible (no crash).
    setActive({
      title: r.title,
      viewUrl: fresh?.viewUrl ?? null,
      downloadUrl: fresh?.downloadUrl ?? null,
      storagePath: r.storage_path ?? null,
      type: r.type,
    });
  }

  async function handleDownload(r: DisplayResource) {
    setBusyId(r.id);
    const fresh = await freshUrls(r);
    setBusyId(null);
    const href = fresh?.downloadUrl;
    if (!href) {
      // Error visible en vez de link muerto silencioso.
      setActive({ title: r.title, viewUrl: null, downloadUrl: null, storagePath: r.storage_path ?? null, type: r.type });
      return;
    }
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {resources.map((r) => {
          const tone = TONE[r.type] ?? "#4a4f73";
          const isExternal = r.type === "link";
          const kind = detectViewerKind({
            storagePath: r.storage_path ?? null,
            url: r.viewUrl ?? r.url,
            type: r.type,
          });
          const canPreview = kind !== "external" && kind !== "download" && !!r.storage_path;
          const hasAction = !!(r.url || r.viewUrl || r.storage_path);
          return (
            <div
              key={r.id}
              className={`ca-card group flex items-center gap-4 p-4${hasAction ? "" : " pointer-events-none opacity-60"}`}
            >
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
                style={{ background: `${tone}14`, color: tone }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICON[r.type] ?? ICON.pdf} />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold tracking-tight text-ca-ink">{r.title}</div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ca-ink-soft">
                  {TYPE_LABEL[r.type] ?? "Documento"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canPreview && (
                  <button
                    type="button"
                    onClick={() => handleView(r)}
                    disabled={busyId === r.id}
                    className="ca-btn-interactive rounded-full border border-ca-ink/[0.1] px-3 py-1 text-[11px] font-bold text-ca-ink hover:border-ca-violet hover:text-ca-violet"
                  >
                    Ver
                  </button>
                )}
                {isExternal ? (
                  <a
                    href={r.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={r.url ? undefined : true}
                    aria-label="Abrir en otra pestaña"
                    className="grid h-9 w-9 place-items-center rounded-full bg-ca-bg-soft text-ca-ink transition-transform group-hover:scale-110"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownload(r)}
                    disabled={busyId === r.id}
                    aria-label="Descargar"
                    className="grid h-9 w-9 place-items-center rounded-full bg-ca-bg-soft text-ca-ink transition-transform group-hover:scale-110"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <DocumentViewer resource={active} onClose={() => setActive(null)} />
    </>
  );
}
