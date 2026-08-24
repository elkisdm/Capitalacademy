import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-7">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-9 w-32" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* StatStrip */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-8 w-56 rounded-full" />
      </div>

      {/* Lista de leads */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1.5 h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-64 rounded-2xl lg:block" />
      </div>
    </div>
  );
}
