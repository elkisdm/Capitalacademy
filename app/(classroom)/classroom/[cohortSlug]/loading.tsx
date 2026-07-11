export default function CohortLoading() {
  return (
    <div className="ca-fade-up mx-auto max-w-[1400px] px-6 py-8 md:px-8">
      {/* Hero skeleton — franja compacta */}
      <div className="mb-4 h-40 w-full animate-pulse rounded-3xl bg-ca-ink/[0.08]" />

      {/* Banda "Continuar" skeleton */}
      <div className="mb-8 flex h-[72px] w-full items-center gap-4 rounded-2xl bg-ca-ink/[0.08] px-5">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/20" />
        <div className="flex-1">
          <div className="h-3 w-24 animate-pulse rounded bg-white/20" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-white/20" />
        </div>
      </div>

      {/* Grid 2 columnas: acordeón de módulos + aside de progreso */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="ca-card flex h-[72px] items-center gap-4 px-5"
            >
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-ca-ink/[0.06]" />
              <div className="flex-1">
                <div className="h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
                <div className="mt-2 h-4 w-48 animate-pulse rounded bg-ca-ink/[0.08]" />
              </div>
              <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-ca-ink/[0.06]" />
            </div>
          ))}
        </div>

        <div className="ca-card h-fit p-6">
          <div className="mx-auto h-24 w-24 animate-pulse rounded-full bg-ca-ink/[0.06]" />
          <div className="mx-auto mt-4 h-3 w-32 animate-pulse rounded bg-ca-ink/[0.06]" />
          <div className="mt-6 space-y-3 border-t border-ca-ink/[0.08] pt-4">
            <div className="h-3 w-full animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-ca-ink/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}
