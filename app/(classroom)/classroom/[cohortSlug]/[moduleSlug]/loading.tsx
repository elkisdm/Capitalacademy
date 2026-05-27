export default function ModuleLoading() {
  return (
    <div className="ca-fade-up mx-auto max-w-4xl px-6 py-8 md:px-8">
      {/* Header skeleton */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-ca-ink/[0.08] bg-ca-surface p-8">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-8 w-64 animate-pulse rounded bg-ca-ink/[0.08]" />
            <div className="mt-3 flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-ca-ink/[0.06]" />
              <div className="h-4 w-32 animate-pulse rounded bg-ca-ink/[0.06]" />
            </div>
          </div>
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-ca-ink/[0.06]" />
        </div>
        <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-ca-ink/[0.06]" />
      </div>

      {/* Lessons skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-ca-ink/[0.06] p-4">
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-ca-ink/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
              <div className="h-4 w-48 animate-pulse rounded bg-ca-ink/[0.06]" />
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-ca-ink/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
