"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { DocumentViewer, type ViewerResource } from "@/components/classroom/document-viewer";
import { detectViewerKind } from "@/lib/classroom/resource-viewer";
import type { SessionResource, SessionResourceType } from "@/lib/classroom/types";

const RESOURCE_ICON: Record<SessionResourceType | "other", string> = {
  pdf: "📄",
  link: "🔗",
  template: "📋",
  document: "📝",
  other: "📎",
};

type ClassMaterialProps = {
  resources: SessionResource[];
};

/** Material de una clase en vivo: fila por recurso con acción "Ver" (visor
 * in-app) y "Descargar", enganchado a `DocumentViewer`. */
export function ClassMaterial({ resources }: ClassMaterialProps) {
  const [active, setActive] = useState<ViewerResource | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Link externo: la URL no expira; se usa tal cual sin llamar al endpoint.
  // Archivo subido: se pide una signed URL fresca al clic (anti-IDOR + evita
  // que expire la firma de 2 h que vive en el render).
  async function freshUrls(
    r: SessionResource,
  ): Promise<{ viewUrl: string | null; downloadUrl: string | null } | null> {
    if (!r.storage_path) return { viewUrl: null, downloadUrl: r.url };
    try {
      const res = await fetch(`/api/classroom/resources/${r.id}/url?table=session`);
      if (!res.ok) return null;
      return (await res.json()) as { viewUrl: string | null; downloadUrl: string | null };
    } catch {
      return null;
    }
  }

  async function handleView(r: SessionResource) {
    setBusyId(r.id);
    const fresh = await freshUrls(r);
    setBusyId(null);
    // Si falla, el visor abre con URLs nulas → UnsupportedState visible (no crash).
    setActive({
      title: r.title,
      viewUrl: fresh?.viewUrl ?? null,
      downloadUrl: fresh?.downloadUrl ?? null,
      storagePath: r.storage_path,
      type: r.type,
    });
  }

  async function handleDownload(r: SessionResource) {
    setBusyId(r.id);
    const fresh = await freshUrls(r);
    setBusyId(null);
    const href = fresh?.downloadUrl;
    if (!href) {
      // Error visible en vez de link muerto silencioso.
      setActive({ title: r.title, viewUrl: null, downloadUrl: null, storagePath: r.storage_path, type: r.type });
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
      <div className="flex flex-col gap-2">
        {resources.map((r) => {
          const kind = detectViewerKind({
            storagePath: r.storage_path,
            url: r.viewUrl ?? r.url,
            type: r.type,
          });
          const canPreview = kind !== "external" && kind !== "download" && !!r.storage_path;
          const hasUrl = !!(r.url || r.viewUrl || r.storage_path);

          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border border-ca-ink/[0.1] bg-ca-surface px-3 py-2${hasUrl ? "" : " pointer-events-none opacity-60"}`}
            >
              <span aria-hidden="true">{RESOURCE_ICON[r.type] ?? RESOURCE_ICON.other}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ca-ink">{r.title}</span>
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
                {kind === "external" ? (
                  <a
                    href={r.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={r.url ? undefined : true}
                    className="ca-btn-interactive rounded-full border border-ca-ink/[0.1] px-3 py-1 text-[11px] font-bold text-ca-ink hover:border-ca-violet hover:text-ca-violet"
                  >
                    Abrir
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownload(r)}
                    disabled={busyId === r.id}
                    aria-label="Descargar"
                    className="ca-btn-interactive grid h-7 w-7 place-items-center rounded-full text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-ink"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
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
