import { Skeleton } from "@/components/ui/skeleton";

export default function DocenteLoading() {
  return (
    <div className="ca-fade-up">
      {/* Header skeleton */}
      <Skeleton className="mb-1 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96" />

      {/* Hero skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      {/* Session list skeleton */}
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="mb-8 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <Skeleton className="mb-3 h-4 w-32" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
