"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/admin/toast";
import type { Certificate } from "./types";
import { formatDate } from "./types";
import { CheckCircleIcon, DownloadIcon, LoaderIcon, PlusIcon } from "./icons";

export function CertificadosTab({ programId }: { programId: string }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  const { toast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/certificates?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCertificates(data.certificates ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  const handleIssue = async () => {
    if (!enrollmentId.trim()) return;
    setIssuing(true);
    try {
      const res = await fetch("/api/admin/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: enrollmentId.trim() }),
      });
      if (res.ok) {
        toast("Certificado emitido exitosamente", "success");
        setEnrollmentId("");
        setShowIssueForm(false);
        // Refresh
        const refresh = await fetch(`/api/admin/certificates?programId=${programId}`);
        if (refresh.ok) {
          const data = await refresh.json();
          setCertificates(data.certificates ?? []);
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al emitir", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setIssuing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando certificados...</p>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer />

      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[13px] font-bold text-ca-ink">
          {certificates.length} {certificates.length === 1 ? "certificado" : "certificados"} emitidos
        </span>
        <button
          onClick={() => setShowIssueForm(!showIssueForm)}
          className="flex items-center gap-2 rounded-xl border-2 border-ca-violet/20 px-4 py-2 text-[13px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/5"
        >
          <PlusIcon />
          Emitir manualmente
        </button>
      </div>

      {/* Issue form */}
      {showIssueForm && (
        <div className="ca-card mb-5 border-2 border-ca-violet/20 p-5">
          <div className="mb-3 text-[13px] font-bold text-ca-ink">Emitir certificado manual</div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
                ID de enrollment
              </label>
              <input
                aria-label="ID de enrollment"
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
                placeholder="ej: abc123-def456…"
                className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] font-mono text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
              />
            </div>
            <button
              onClick={handleIssue}
              disabled={issuing || !enrollmentId.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {issuing ? <LoaderIcon /> : <CheckCircleIcon />}
              {issuing ? "Emitiendo…" : "Emitir"}
            </button>
            <button
              onClick={() => {
                setShowIssueForm(false);
                setEnrollmentId("");
              }}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {certificates.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h6" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin certificados</div>
            <div className="text-[12px] text-ca-ink-soft">
              Aun no se han emitido certificados para este programa.
            </div>
          </div>
        </div>
      ) : (
        <div className="ca-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Alumno
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Codigo
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Fecha emision
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id} className="border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft">
                    <td className="px-5 py-3">
                      <span className="text-[13px] font-bold text-ca-ink">{c.studentName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] font-semibold text-ca-ink-soft">
                        {c.verificationCode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-medium text-ca-ink-soft">
                        {formatDate(c.issuedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.pdfUrl ? (
                        <a
                          href={c.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/5"
                        >
                          <DownloadIcon />
                          Descargar
                        </a>
                      ) : (
                        <span className="text-[11px] text-ca-ink-soft">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
