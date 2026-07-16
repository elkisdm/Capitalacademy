import { Skeleton } from "@/components/ui/skeleton";

export default function CertificadosLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
      </div>

      <Skeleton className="h-40 w-full" />
    </div>
  );
}
