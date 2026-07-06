"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";

type ProgramOption = { id: string; name: string };

export function AddModuleButton({ programs }: { programs: ProgramOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!programId || !code.trim() || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, code: code.trim(), title: title.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo crear el módulo");
        return;
      }
      setCode("");
      setTitle("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de red al crear");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-ca-ink/[0.08] px-3 py-2 text-sm focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30";

  if (programs.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep"
      >
        <Plus className="h-4 w-4" />
        Nuevo módulo
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Programa</label>
          <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={inputCls}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Código</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="M1"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del módulo"
            className={inputCls}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !programId || !code.trim() || !title.trim()}
          className="rounded-md bg-ca-violet px-4 py-2 text-sm font-medium text-white hover:bg-ca-violet-deep disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear módulo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-md px-4 py-2 text-sm text-ca-ink-soft hover:bg-ca-bg-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
