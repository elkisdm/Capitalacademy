export default function LessonLoading() {
  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1600px] px-4 py-4 md:px-8 md:py-6">
      {/* Breadcrumb skeleton */}
      <div className="mb-5 flex items-center gap-1.5">
        <div className="h-3 w-32 animate-pulse rounded bg-ca-ink/[0.06]" />
        <div className="h-3 w-3 animate-pulse rounded bg-ca-ink/[0.04]" />
        <div className="h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
        <div className="h-3 w-3 animate-pulse rounded bg-ca-ink/[0.04]" />
        <div className="h-3 w-40 animate-pulse rounded bg-ca-ink/[0.06]" />
      </div>

      {/* Title skeleton */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-28 animate-pulse rounded bg-ca-ink/[0.06]" />
          <div className="h-3 w-16 animate-pulse rounded bg-ca-ink/[0.06]" />
        </div>
        <div className="h-8 w-72 animate-pulse rounded bg-ca-ink/[0.08]" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        {/* Video player skeleton */}
        <div className="min-w-0">
          <div className="aspect-video w-full animate-pulse rounded-[18px] bg-ca-ink/[0.06]" />
          {/* Progress bar skeleton */}
          <div className="mt-2 flex items-center gap-3">
            <div className="h-3 w-16 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-1.5 flex-1 animate-pulse rounded-full bg-ca-ink/[0.06]" />
            <div className="h-3 w-10 animate-pulse rounded bg-ca-ink/[0.06]" />
          </div>
          {/* Tabs skeleton */}
          <div className="mt-8 flex gap-4 border-b border-ca-ink/[0.06] pb-3">
            <div className="h-4 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-4 w-24 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-4 w-28 animate-pulse rounded bg-ca-ink/[0.06]" />
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="hidden w-[360px] lg:block">
          <div className="ca-card flex flex-col gap-3 p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-ca-ink/[0.06]" />
            <div className="h-5 w-48 animate-pulse rounded bg-ca-ink/[0.08]" />
            <div className="mt-2 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-ca-ink/[0.06]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-ca-ink/[0.06]" />
                    <div className="h-3.5 w-36 animate-pulse rounded bg-ca-ink/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
