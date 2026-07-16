import { Skeleton } from "@/components/ui/skeleton";

export default function EvaluationDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <Skeleton className="mb-6 h-4 w-36" />

      <div className="mb-6">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="mt-2 h-8 w-72" />
      </div>

      <div className="rounded-xl border border-ca-ink/[0.08] bg-ca-surface p-6">
        <Skeleton className="mb-4 h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
