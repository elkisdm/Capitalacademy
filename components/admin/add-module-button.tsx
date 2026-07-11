"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

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

  if (programs.length === 0) return null;

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo módulo
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Programa</label>
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Código</label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="M1" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ca-ink-soft">Título</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del módulo"
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
        <Button
          type="button"
          onClick={handleCreate}
          disabled={saving || !programId || !code.trim() || !title.trim()}
        >
          {saving ? "Creando…" : "Crear módulo"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
