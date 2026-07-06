"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RetryButton({ programId }: { programId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRetry = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/classroom/certificate/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Error al generar certificado");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="ca-btn-primary inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="ca-spin-slow inline-block h-4 w-4 rounded-full border-2 border-white border-r-transparent" />
            Generando…
          </>
        ) : (
          <>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v5h-5M21 12a9 9 0 0 1-15.5 6.3M3 20v-5h5" />
            </svg>
            Generar certificado
          </>
        )}
      </button>
      {error && (
        <p className="text-[13px] font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}
