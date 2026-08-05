"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Check, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/classroom/primitives";
import type { InstructorProfile } from "@/lib/instructors/types";

const BIO_MAX = 4000;
const HEADLINE_MAX = 120;

type Props = {
  instructor: InstructorProfile & { is_active: boolean };
  /**
   * Endpoint del PATCH. Por defecto el del panel (edita la ficha de cualquiera);
   * la pantalla del docente pasa `/api/docente/perfil`, que resuelve la ficha
   * por la sesión y nunca por un id de la URL.
   */
  endpoint?: string;
  /** Abre el editor de entrada: en su propia pantalla no hay nada que desplegar. */
  defaultOpen?: boolean;
  /** Sin la tarjeta exterior, cuando quien lo usa ya aporta el contenedor. */
  bare?: boolean;
};

/**
 * Edita el perfil público de un docente (ADR-0028 §5). Solo los campos que el
 * alumno ve: titular, reseña y las tres redes. Mismo patrón que
 * `module-edit-form`: colapsado por defecto, PATCH a la API y `router.refresh()`.
 */
export function InstructorEditForm({
  instructor,
  endpoint = `/api/admin/instructors/${instructor.id}`,
  defaultOpen = false,
  bare = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [headline, setHeadline] = useState(instructor.headline ?? "");
  const [bio, setBio] = useState(instructor.bio ?? "");
  const [linkedin, setLinkedin] = useState(instructor.linkedin_url ?? "");
  const [instagram, setInstagram] = useState(instructor.instagram_url ?? "");
  const [website, setWebsite] = useState(instructor.website_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled =
    [instructor.headline, instructor.bio, instructor.linkedin_url, instructor.instagram_url, instructor.website_url]
      .filter((v) => v && v.trim()).length;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          bio,
          linkedin_url: linkedin,
          instagram_url: instagram,
          website_url: website,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo guardar");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={bare ? "" : "ca-card p-4 md:p-5"}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar initials={instructor.full_name} avatarUrl={instructor.photo_url} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-extrabold tracking-tight text-ca-ink">
              {instructor.full_name}
            </span>
            {!instructor.is_active && (
              <span className="rounded-full bg-ca-ink/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ca-ink-soft">
                Inactivo
              </span>
            )}
          </div>
          <div className="text-[12px] text-ca-ink-soft">
            {filled === 0
              ? "Perfil vacío — el alumno no verá nada más que el nombre"
              : `${filled} de 5 campos completos`}
          </div>
        </div>
        {!open && !defaultOpen && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar perfil
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-lg border border-ca-violet/20 bg-ca-violet/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
              Perfil público
            </span>
            {!defaultOpen && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="h-auto min-h-0 rounded p-1"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div>
            <label htmlFor={`headline-${instructor.id}`} className="mb-1 block text-xs font-medium text-ca-ink-soft">
              Titular o cargo ({headline.length}/{HEADLINE_MAX})
            </label>
            <Input
              id={`headline-${instructor.id}`}
              value={headline}
              maxLength={HEADLINE_MAX}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Directora Académica · Capital Academy"
            />
          </div>

          <div>
            <label htmlFor={`bio-${instructor.id}`} className="mb-1 block text-xs font-medium text-ca-ink-soft">
              Reseña ({bio.length}/{BIO_MAX})
            </label>
            <Textarea
              id={`bio-${instructor.id}`}
              value={bio}
              rows={5}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Qué hace, qué enseña y por qué vale la pena escucharle."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`linkedin-${instructor.id}`} className="mb-1 block text-xs font-medium text-ca-ink-soft">
                LinkedIn
              </label>
              <Input
                id={`linkedin-${instructor.id}`}
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="linkedin.com/in/usuario"
              />
            </div>
            <div>
              <label htmlFor={`instagram-${instructor.id}`} className="mb-1 block text-xs font-medium text-ca-ink-soft">
                Instagram
              </label>
              <Input
                id={`instagram-${instructor.id}`}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="instagram.com/usuario"
              />
            </div>
            <div>
              <label htmlFor={`website-${instructor.id}`} className="mb-1 block text-xs font-medium text-ca-ink-soft">
                Sitio web
              </label>
              <Input
                id={`website-${instructor.id}`}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="misitio.cl"
              />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ca-ink-soft">
            Los enlaces se guardan siempre como https://. Puedes escribirlos sin el protocolo y
            se completa solo. Deja un campo en blanco para quitar ese enlace.
          </p>

          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando…" : saved ? "Guardado" : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
