"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export type TeacherAccount = {
  id: string;
  full_name: string | null;
  email: string;
};

/**
 * Enlaza una ficha de `instructors` con una cuenta de la plataforma.
 *
 * Es el prerrequisito para que el docente edite su propio perfil en
 * `/docente/perfil`: sin `profile_id` no hay forma de saber qué ficha le
 * corresponde a quien inicia sesión. No se puede deducir solo —hoy 19 de 20
 * fichas no tienen correo y varias difieren del nombre de la cuenta por una
 * tilde— así que lo elige operaciones a mano.
 */
export function InstructorLinkAccount({
  instructorId,
  instructorName,
  currentProfileId,
  accounts,
}: {
  instructorId: string;
  instructorName: string;
  currentProfileId: string | null;
  accounts: TeacherAccount[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentProfileId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = accounts.find((a) => a.id === currentProfileId);

  const save = async (profileId: string) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo enlazar");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Error de red al enlazar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border-t border-ca-ink/[0.08] pt-3">
      <label
        htmlFor={`cuenta-${instructorId}`}
        className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ca-ink-soft"
      >
        <Link2 className="h-3.5 w-3.5" />
        Cuenta de {instructorName}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          id={`cuenta-${instructorId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-[260px] flex-1"
        >
          <option value="">Sin cuenta enlazada</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name || a.email} — {a.email}
            </option>
          ))}
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving || value === (currentProfileId ?? "")}
          onClick={() => save(value)}
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saving ? "Enlazando…" : saved ? "Enlazado" : "Enlazar"}
        </Button>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-ca-ink-soft">
        {linked
          ? `${linked.full_name || linked.email} puede editar esta ficha desde su propio panel.`
          : "Sin enlazar, esta ficha solo se puede editar desde acá."}
      </p>

      {error && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
