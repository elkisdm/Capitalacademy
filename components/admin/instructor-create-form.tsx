"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { TeacherAccount } from "@/components/admin/instructor-link-account";

/**
 * Alta de una ficha docente (ADR-0036).
 *
 * Existe porque `class_sessions.teacher_id` apunta a `instructors`: sin ficha,
 * una persona NO aparece en el selector al crear una clase por más que tenga
 * rol de docente en la cohorte. Hasta ahora el alta solo venía del seed.
 *
 * La cuenta es opcional a propósito: el relator invitado que dicta una clase
 * suelta no usa la plataforma y no tiene por qué tener una.
 */
export function InstructorCreateForm({ accounts }: { accounts: TeacherAccount[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: nombre, profile_id: cuenta || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo crear la ficha");
        return;
      }
      setListo(true);
      setNombre("");
      setCuenta("");
      router.refresh();
      setTimeout(() => {
        setListo(false);
        setAbierto(false);
      }, 1800);
    } catch {
      setError("Error de red al crear la ficha");
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <Button type="button" onClick={() => setAbierto(true)} className="gap-2">
        <UserPlus className="h-4 w-4" />
        Nueva ficha
      </Button>
    );
  }

  return (
    <div className="ca-card w-full p-4">
      <p className="text-[14px] font-bold text-ca-ink">Nueva ficha docente</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
        Con esto la persona ya aparece en el selector de docente al crear una clase. La
        reseña, la foto y las redes se completan después.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label
            htmlFor="nueva-ficha-nombre"
            className="mb-1 block text-xs font-medium text-ca-ink-soft"
          >
            Nombre completo
          </label>
          <Input
            id="nueva-ficha-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Cristian Farias"
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="nueva-ficha-cuenta"
            className="mb-1 block text-xs font-medium text-ca-ink-soft"
          >
            Cuenta de la plataforma (opcional)
          </label>
          <Select
            id="nueva-ficha-cuenta"
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
          >
            <option value="">Sin cuenta — relator invitado</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email} — {a.email}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[12px] text-ca-ink-soft">
            Enlazarla es lo que le permite editar su propio perfil desde su cuenta.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
      {listo && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
          <Check className="h-3.5 w-3.5" />
          Ficha creada
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          onClick={crear}
          disabled={guardando || nombre.trim().length < 2}
        >
          {guardando ? "Creando…" : "Crear ficha"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          disabled={guardando}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
