export type DisplayResource = {
  id: string;
  title: string;
  type: string;
  url: string | null;
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
export function ResourceList({ resources }: { resources: DisplayResource[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {resources.map((r) => {
        const tone = TONE[r.type] ?? "#4a4f73";
        const isExternal = r.type === "link";
        return (
          <a
            key={r.id}
            // url puede ser null si la firma de la signed URL falló; sin href el
            // <a> no navega (degradación elegante, no link muerto).
            href={r.url ?? undefined}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            download={!isExternal || undefined}
            aria-disabled={r.url ? undefined : true}
            className={`ca-card ca-card-hoverable group flex items-center gap-4 p-4${r.url ? "" : " pointer-events-none opacity-60"}`}
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
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ca-bg-soft text-ca-ink transition-transform group-hover:scale-110">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={isExternal ? "M5 12h14M12 5l7 7-7 7" : "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"} />
              </svg>
            </div>
          </a>
        );
      })}
    </div>
  );
}
