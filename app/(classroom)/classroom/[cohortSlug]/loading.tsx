export default function CohortLoading() {
  return (
    <div className="ca-fade-up mx-auto max-w-5xl px-6 py-8 md:px-8">
      {/* Hero skeleton */}
      <div className="mb-10 flex items-center gap-4">
        <div className="flex-1">
          <div className="h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
          <div className="mt-2 h-9 w-72 animate-pulse rounded bg-ca-ink/[0.08]" />
          <div className="mt-3 h-4 w-96 animate-pulse rounded bg-ca-ink/[0.06]" />
        </div>
      </div>

      {/* Module cards skeleton */}
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-ca-ink/[0.06] p-6">
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-5 w-48 animate-pulse rounded bg-ca-ink/[0.08]" />
            <div className="mt-3 flex items-center gap-3">
              <div className="h-6 w-6 animate-pulse rounded-full bg-ca-ink/[0.06]" />
              <div className="h-3 w-28 animate-pulse rounded bg-ca-ink/[0.06]" />
            </div>
            <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-ca-ink/[0.06]" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-ca-ink/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
