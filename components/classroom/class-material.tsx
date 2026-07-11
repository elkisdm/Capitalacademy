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

  return (
    <>
      <div className="flex flex-col gap-2">
        {resources.map((r) => {
          const kind = detectViewerKind({
            storagePath: r.storage_path,
            url: r.viewUrl ?? r.url,
            type: r.type,
          });
          const canPreview = kind !== "external" && kind !== "download" && !!r.viewUrl;
          const hasUrl = !!(r.url || r.viewUrl);

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
                    onClick={() =>
                      setActive({
                        title: r.title,
                        viewUrl: r.viewUrl ?? null,
                        downloadUrl: r.url,
                        storagePath: r.storage_path,
                        type: r.type,
                      })
                    }
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
                  <a
                    href={r.url ?? undefined}
                    download
                    aria-disabled={r.url ? undefined : true}
                    aria-label="Descargar"
                    className="ca-btn-interactive grid h-7 w-7 place-items-center rounded-full text-ca-ink-soft hover:bg-ca-bg-soft hover:text-ca-ink"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
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
