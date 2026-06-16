export default function CalendarLoading() {
  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      {/* Header skeleton */}
      <div className="h-36 w-full animate-pulse rounded-[28px] bg-ca-ink/[0.08]" />

      {/* Sessions skeleton */}
      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-ca-ink/[0.06]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-ca-ink/[0.06] p-4"
          >
            <div className="h-12 w-14 shrink-0 animate-pulse rounded-2xl bg-ca-ink/[0.06]" />
            <div className="flex-1">
              <div className="h-3 w-32 animate-pulse rounded bg-ca-ink/[0.06]" />
              <div className="mt-2 h-4 w-56 animate-pulse rounded bg-ca-ink/[0.08]" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-ca-ink/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
