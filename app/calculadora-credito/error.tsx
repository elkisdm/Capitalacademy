"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function CalculadoraError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[calculadora-credito] unhandled error:", error);
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center bg-ca-bg px-6 text-center"
    >
      <h1 className="text-3xl font-black tracking-[-0.02em] text-ca-ink">
        No pudimos cargar la calculadora
      </h1>
      <p className="mt-4 max-w-md text-base text-ca-ink-soft">
        Algo falló de nuestro lado. Vuelve a intentarlo en unos segundos.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset} size="lg" className="uppercase tracking-[0.15em]">
          Reintentar
        </Button>
        {/* Ancla estilizada como `Button`: el design system propio no tiene
            `asChild` (mismo patrón que `components/classroom/document-viewer.tsx`). */}
        <Link
          href="/"
          className="ca-btn-interactive inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full border border-ca-ink/[0.14] bg-transparent px-6 text-[15px] font-bold uppercase tracking-[0.15em] text-ca-ink hover:bg-ca-bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
