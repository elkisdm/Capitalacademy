import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarioLoading() {
  return (
    <div className="ca-fade-up mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-9 w-48" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      {/* Month calendar skeleton */}
      <Skeleton className="h-[520px] w-full rounded-[28px]" />
    </div>
  );
}
