import { Skeleton } from "@/components/ui/skeleton";

export default function LessonDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <Skeleton className="mb-6 h-4 w-36" />

      <div className="mb-6">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-2 h-8 w-72" />
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mb-8 rounded-xl border border-ca-ink/[0.08] bg-ca-surface p-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
