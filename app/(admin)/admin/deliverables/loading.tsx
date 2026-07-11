import { Skeleton } from "@/components/ui/skeleton";

export default function DeliverablesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
