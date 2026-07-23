"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { Certificate } from "./types";
import { formatDate } from "./types";
import { CheckCircleIcon, DownloadIcon, LoaderIcon, PlusIcon } from "./icons";

export function CertificadosTab({ programId }: { programId: string }) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [loadError, setLoadError] = useState(false);
  const { toast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/certificates?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setCertificates(data.certificates ?? []);
            setLoadError(false);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Error desconocido" }));
          if (!cancelled) {
            setLoadError(true);
            toast(err.error ?? "No se pudieron cargar los certificados", "error");
          }
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
          setLoadError(false);
        } else {
          const refreshErr = await refresh.json().catch(() => ({ error: "Error desconocido" }));
          setLoadError(true);
          toast(refreshErr.error ?? "No se pudieron cargar los certificados", "error");
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
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowIssueForm(!showIssueForm)}
          className="h-auto gap-2 rounded-xl border-2 border-ca-violet/20 px-4 py-2 text-[13px] font-bold text-ca-violet hover:bg-ca-violet/5"
        >
          <PlusIcon />
          Emitir manualmente
        </Button>
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
              <Input
                aria-label="ID de enrollment"
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
                placeholder="ej: abc123-def456…"
                className="font-mono"
              />
            </div>
            <Button
              type="button"
              variant="lime"
              onClick={handleIssue}
              disabled={issuing || !enrollmentId.trim()}
              className="h-auto gap-2 px-5 py-2.5 text-[13px]"
            >
              {issuing ? <LoaderIcon /> : <CheckCircleIcon />}
              {issuing ? "Emitiendo…" : "Emitir"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowIssueForm(false);
                setEnrollmentId("");
              }}
              className="h-auto px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Grid de certificados */}
      {certificates.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h6" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">
              {loadError ? "No se pudieron cargar los certificados" : "Sin certificados"}
            </div>
            <div className="text-[12px] text-ca-ink-soft">
              {loadError
                ? "Ocurrio un error al consultar el listado. Intenta recargar la pagina."
                : "Aun no se han emitido certificados para este programa."}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {certificates.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-ca-ink/[0.08] bg-white p-4"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-bold text-ca-ink">{c.studentName}</div>
                <div className="mt-0.5 font-mono text-[11.5px] font-semibold text-ca-ink-soft">
                  {c.verificationCode}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-[11.5px] font-medium text-ca-ink-soft">
                  {formatDate(c.issuedAt)}
                </span>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
