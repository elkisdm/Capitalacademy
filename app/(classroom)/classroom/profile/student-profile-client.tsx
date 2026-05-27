"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatRut, cleanRut, isValidRut } from "@/lib/utils/rut";
import { BrandShapes } from "@/components/classroom/primitives";
import { CohortRoleBadge, StateBadge } from "@/components/admin/user-primitives";

type ProfileData = {
  full_name: string | null;
  email: string;
  phone: string | null;
  rut: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  bio: string | null;
  avatar_url: string | null;
  system_role: string;
  created_at: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type CohortInfo = {
  cohort_id: string;
  role: "student" | "teacher" | "assistant";
  cohort_name: string;
  cohort_code: string;
  cohort_slug: string;
  cohort_status: string;
};

type StudentProfileClientProps = {
  profile: ProfileData;
  lastSignIn: string | null;
  cohorts: CohortInfo[];
};

function PencilIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Sin actividad";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  return formatDate(iso);
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  ops: "Operaciones",
  user: "Alumno",
};

type InfoFieldProps = {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  onSave: (value: string) => Promise<void>;
  type?: "text" | "tel" | "url";
};

function InfoField({ label, value, icon, onSave, type = "text" }: InfoFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setDraft(value ?? "");
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="ca-card group relative overflow-hidden px-4 py-3.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
          {label}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded-lg border bg-ca-bg px-3 py-1.5 text-[14px] font-medium text-ca-ink outline-none focus:border-ca-violet"
            style={{ borderColor: "rgba(20,22,58,0.12)" }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
            style={{ background: "var(--color-ca-violet)" }}
          >
            <CheckIcon />
          </button>
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(false); }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ca-card group relative cursor-pointer overflow-hidden px-4 py-3.5 transition-all hover:border-ca-ink/[0.14]"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
          {label}
        </div>
        <span className="text-ca-ink-soft opacity-0 transition-opacity group-hover:opacity-100">
          <PencilIcon />
        </span>
      </div>
      {value ? (
        <div className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-ca-ink">
          {icon}
          {label === "RUT" ? formatRut(value) : value}
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--color-ca-violet)" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agregar {label.toLowerCase()}
        </div>
      )}
    </div>
  );
}

export function StudentProfileClient({ profile, lastSignIn, cohorts }: StudentProfileClientProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const initials = getInitials(profile.full_name, profile.email);
  const displayName = profile.full_name || profile.email;

  const saveField = async (field: string, value: string) => {
    await fetch("/api/onboarding/complete-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        rut: profile.rut ?? "",
        [field]: value || null,
      }),
    });
    router.refresh();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
  };

  return (
    <>
      {/* Hero card */}
      <div className="ca-card relative mb-6 overflow-hidden p-6 md:p-8">
        <BrandShapes variant="corner-violet" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div
            className="shape-circle grid shrink-0 place-items-center font-black text-white"
            style={{
              width: 96,
              height: 96,
              fontSize: 32,
              background: profile.avatar_url ? "transparent" : "var(--color-ca-violet)",
            }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[24px] font-black tracking-[-0.025em] text-ca-ink md:text-[28px]">
                {displayName}
              </h1>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{
                  background: "rgba(20,22,58,0.08)",
                  color: "var(--color-ca-ink-soft)",
                }}
              >
                {ROLE_LABELS[profile.system_role] ?? profile.system_role}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ca-ink-soft">
                <MailIcon />
                {profile.email}
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-[13px] font-medium text-ca-ink-soft">
                  <PhoneIcon />
                  {profile.phone}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-ca-ink-soft">
                <span className="flex items-center gap-1.5">
                  <CalendarIcon />
                  Miembro desde {formatDate(profile.created_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  <ClockIcon />
                  {lastSignIn
                    ? `Último acceso ${timeAgo(lastSignIn)}`
                    : "Sin acceso registrado"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Información personal */}
      <div className="mb-6">
        <h2 className="mb-4 text-[18px] font-black tracking-tight text-ca-ink">
          Información personal
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoField
            label="Teléfono"
            value={profile.phone}
            type="tel"
            onSave={(v) => saveField("phone", v)}
          />
          <InfoField
            label="RUT"
            value={profile.rut}
            onSave={(v) => saveField("rut", cleanRut(v))}
          />
          <InfoField
            label="Empresa"
            value={profile.company}
            onSave={(v) => saveField("company", v)}
          />
          <InfoField
            label="Cargo"
            value={profile.job_title}
            onSave={(v) => saveField("job_title", v)}
          />
          <InfoField
            label="LinkedIn"
            value={profile.linkedin_url}
            type="url"
            onSave={(v) => saveField("linkedin_url", v)}
          />
          <InfoField
            label="Cumpleaños"
            value={null}
            onSave={() => Promise.resolve()}
          />
        </div>

        {/* Bio full-width */}
        <div className="mt-3">
          <InfoField
            label="Bio"
            value={profile.bio}
            onSave={(v) => saveField("bio", v)}
          />
        </div>
      </div>

      {/* Contacto de emergencia */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[18px] font-black tracking-tight text-ca-ink">
            Contacto de emergencia
          </h2>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ background: "rgba(20,22,58,0.06)", color: "var(--color-ca-ink-soft)" }}
          >
            <ShieldIcon />
            Confidencial
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoField
            label="Nombre"
            value={profile.emergency_contact_name}
            onSave={(v) => saveField("emergency_contact_name", v)}
          />
          <InfoField
            label="Teléfono"
            value={profile.emergency_contact_phone}
            type="tel"
            onSave={(v) => saveField("emergency_contact_phone", v)}
          />
        </div>
      </div>

      {/* Mis cohortes */}
      {cohorts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-4 text-[18px] font-black tracking-tight text-ca-ink">
            Mis cohortes
          </h2>
          <div className="flex flex-col gap-3">
            {cohorts.map((cr) => (
              <div
                key={`${cr.cohort_id}-${cr.role}`}
                className="ca-card ca-card-hoverable group relative cursor-pointer overflow-hidden px-5 py-4 transition-all"
                onClick={() => router.push(`/classroom/${cr.cohort_slug}`)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: cr.role === "teacher"
                        ? "rgba(94,23,235,0.10)"
                        : "rgba(168,211,16,0.15)",
                      color: cr.role === "teacher"
                        ? "var(--color-ca-violet)"
                        : "#3f5a05",
                    }}
                  >
                    <BookIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-ca-ink">
                        {cr.cohort_name}
                      </span>
                      <span className="font-mono text-[11px] text-ca-ink-soft">
                        {cr.cohort_code}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CohortRoleBadge role={cr.role} />
                    <StateBadge state={cr.cohort_status as "active" | "completed" | "suspended" | "upcoming"} />
                  </div>
                  <span className="text-ca-ink-soft opacity-0 transition-opacity group-hover:opacity-100">
                    <ChevronRightIcon />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account section */}
      <div className="mt-8 border-t pt-6" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] font-bold transition-colors hover:bg-ca-bg-soft"
            style={{ borderColor: "rgba(20,22,58,0.14)", color: "var(--color-ca-ink)" }}
          >
            <LockIcon />
            Cambiar contraseña
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] font-bold transition-colors hover:bg-red-50 disabled:opacity-50"
            style={{ borderColor: "rgba(225,29,72,0.3)", color: "#e11d48" }}
          >
            <LogoutIcon />
            {signingOut ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </>
  );
}
