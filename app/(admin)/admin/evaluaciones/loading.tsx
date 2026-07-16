import { Skeleton } from "@/components/ui/skeleton";

export default function EvaluacionesLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-48 rounded-full" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-3 w-32" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, j) => (
                <Skeleton key={j} className="h-16 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
