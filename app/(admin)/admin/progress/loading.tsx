import { Skeleton } from "@/components/ui/skeleton";

export default function ProgressLoading() {
  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      {/* Header skeleton */}
      <div className="mb-7">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-9 w-72" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* Cohort selector skeleton */}
      <div className="mb-6">
        <Skeleton className="mb-1.5 h-3 w-16" />
        <Skeleton className="h-11 w-full max-w-sm" />
      </div>

      {/* KPI cards skeleton */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ca-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="ca-card hidden overflow-hidden md:block">
        <div className="border-b border-ca-ink/[0.08] p-4">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ca-ink/[0.08] p-4 first:border-t-0">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-10 w-20 rounded-xl" />
            <Skeleton className="h-10 w-20 rounded-xl" />
            <Skeleton className="h-10 w-20 rounded-xl" />
          </div>
        ))}
      </div>

      {/* Mobile cards skeleton */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ca-card flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
