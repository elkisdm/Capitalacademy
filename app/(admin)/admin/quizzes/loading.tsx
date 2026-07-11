import { Skeleton } from "@/components/ui/skeleton";

export default function QuizzesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-96" />
      </div>

      <div className="flex flex-col gap-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-11 w-full" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
