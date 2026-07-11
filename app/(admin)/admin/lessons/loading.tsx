import { Skeleton } from "@/components/ui/skeleton";

export default function LessonsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36 rounded-full" />
      </div>
      <div className="mb-8 flex gap-4">
        <Skeleton className="h-14 w-full max-w-xs" />
        <Skeleton className="h-14 w-full max-w-xs" />
      </div>

      <div className="space-y-10">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <div className="mb-3 border-b border-ca-ink/[0.08] pb-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-6 w-56" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-16 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
