import { Skeleton } from "@/components/ui/skeleton";

export default function CalculadoraLoading() {
  return (
    <main className="ca-fade-up min-h-dvh bg-ca-bg pb-24 pt-28 sm:pt-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-14 w-full max-w-xl" />
          <Skeleton className="mt-4 h-14 w-full max-w-md" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-3xl border border-ca-outline bg-ca-surface p-6 sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-6 w-44" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[0, 1, 2].map((j) => (
                    <div key={j}>
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="mt-2 h-11 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-ca-outline bg-ca-surface p-6 sm:p-8">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="mt-5 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
