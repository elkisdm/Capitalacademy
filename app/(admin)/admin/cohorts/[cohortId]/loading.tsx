import { Skeleton } from "@/components/ui/skeleton";

export default function CohortDetailLoading() {
  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      {/* "Volver" skeleton */}
      <Skeleton className="mb-5 h-4 w-16" />

      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-56" />
      </div>

      {/* Tabs skeleton */}
      <div className="mb-8 flex gap-6 border-b border-ca-ink/[0.08] pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>

      {/* Stat cards skeleton */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-ca-ink/[0.06] p-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-8 w-12" />
          </div>
        ))}
      </div>

      {/* List skeleton */}
      <div className="flex flex-col divide-y divide-ca-ink/[0.06] rounded-2xl border border-ca-ink/[0.06]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-1.5 h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
