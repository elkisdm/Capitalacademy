"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export default function ClassroomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[classroom] unhandled error:", error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <Image
        src="/brand/logo-on-light.png"
        alt="Capital Academy"
        width={96}
        height={95}
        className="mb-4 h-12 w-auto"
      />
      <div className="relative mb-6">
        <div className="shape-circle h-24 w-24 bg-red-500 opacity-[0.08]" />
        <div className="absolute inset-0 grid place-items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10 text-red-500"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
      </div>
      <h1 className="text-[22px] font-black tracking-tight text-ca-ink">
        Algo salió mal
      </h1>
      <p className="mt-2 max-w-sm text-[14px] text-ca-ink-soft">
        Ocurrió un error inesperado. Puedes intentar nuevamente o volver al
        inicio del classroom.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="ca-btn-primary inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
        >
          Reintentar
        </button>
        <Link
          href="/classroom"
          className="inline-flex items-center gap-2 rounded-full border border-ca-ink/10 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ca-ink transition-colors hover:bg-ca-ink/5"
        >
          Volver al Classroom
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 font-mono text-[11px] text-ca-ink-soft/60">
          Código de error: {error.digest}
        </p>
      )}
    </div>
  );
}
