"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatRut, cleanRut, isValidRut } from "@/lib/utils/rut";
import { formatPhone } from "@/lib/utils/phone";
import { normalizeUrl } from "@/lib/utils/url";
import { DEFAULT_BRAND, type ProgramBrand } from "@/lib/programs/registry";
import { Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/** Etiquetas legibles por campo, para mostrar errores de validación útiles. */
const FIELD_LABELS: Record<string, string> = {
  full_name: "Nombre completo",
  phone: "Teléfono",
  rut: "RUT",
  company: "Empresa",
  job_title: "Cargo",
  linkedin_url: "LinkedIn",
  bio: "Bio",
};

type ProfileData = {
  full_name: string;
  phone: string;
  rut: string;
  company: string;
  job_title: string;
  linkedin_url: string;
  bio: string;
  avatar_url: string | null;
};

type CompleteProfileClientProps = {
  email: string;
  profile: ProfileData;
  /** Marca del entorno. Default genérico Capital Academy. */
  brand?: ProgramBrand;
};

function CameraIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

const BIO_MAX = 200;

export function CompleteProfileClient({ email, profile, brand = DEFAULT_BRAND }: CompleteProfileClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone);
  const [rut, setRut] = useState(profile.rut ? formatRut(profile.rut) : "");
  const [company, setCompany] = useState(profile.company);
  const [jobTitle, setJobTitle] = useState(profile.job_title);
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedin_url);
  const [bio, setBio] = useState(profile.bio);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const rutClean = cleanRut(rut);
  const rutValid = rutClean.length >= 8 && isValidRut(rut);
  const rutTouched = rut.length > 0;

  const requiredDone = fullName.trim().length > 0 && phone.trim().length > 0 && rutValid;
  const requiredStarted = fullName.trim().length > 0 || phone.trim().length > 0 || rut.length > 0;

  const handleRutChange = useCallback((value: string) => {
    const cleaned = cleanRut(value);
    if (cleaned.length <= 9) {
      setRut(formatRut(value));
    }
  }, []);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    // TODO: upload to Supabase Storage
  };

  const handleSubmit = async () => {
    if (!requiredDone) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding/complete-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          rut: cleanRut(rut),
          company: company.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          linkedin_url: linkedinUrl.trim() ? normalizeUrl(linkedinUrl) : undefined,
          bio: bio.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const issues = Array.isArray(data?.issues) ? data.issues : [];
        if (issues.length > 0) {
          const fields = Array.from(
            new Set(
              issues.map((i: { path?: (string | number)[] }) => {
                const key = String(i.path?.[0] ?? "");
                return FIELD_LABELS[key] ?? key;
              }),
            ),
          ).join(", ");
          setError(`Revisa estos campos: ${fields}`);
        } else {
          setError(data.error ?? "Error al guardar");
        }
        setSubmitting(false);
        return;
      }

      router.push(brand.redirectTo);
      router.refresh();
    } catch {
      setError("Error de conexión");
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (!requiredStarted) return;
    handleSubmit();
  };

  const checklist: Array<{ label: string; done: boolean; required: boolean }> = [
    { label: "Nombre completo", done: fullName.trim().length > 0, required: true },
    { label: "Teléfono", done: phone.trim().length > 0, required: true },
    { label: "RUT", done: rutValid, required: true },
    { label: "Empresa y cargo", done: company.trim().length > 0 || jobTitle.trim().length > 0, required: false },
    { label: "LinkedIn", done: linkedinUrl.trim().length > 0, required: false },
    { label: "Bio", done: bio.trim().length > 0, required: false },
  ];

  return (
    <div className="flex w-full max-w-[1100px] overflow-hidden rounded-3xl shadow-2xl">
      {/* LEFT PANEL — navy */}
      <div
        className="relative hidden w-[40%] flex-col justify-between overflow-hidden p-8 md:flex lg:p-10"
        style={{ background: "#0f1340" }}
      >
        {/* Decorative shapes */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="shape-circle absolute -left-16 -top-16 h-56 w-56 opacity-[0.12]" style={{ background: "var(--color-ca-violet)" }} />
          <div className="shape-half-right absolute -bottom-12 -right-8 h-40 w-40 opacity-[0.10]" style={{ background: "var(--color-ca-lime)" }} />
          <div className="shape-circle absolute right-12 top-1/3 h-8 w-8 ca-pulse" style={{ background: "var(--color-ca-violet)", opacity: 0.25 }} />
          <div className="shape-circle absolute bottom-1/4 left-12 h-5 w-5" style={{ background: "var(--color-ca-lime)", opacity: 0.3 }} />
        </div>

        {/* Logo */}
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 shrink-0">
              <div className="shape-circle absolute inset-0" style={{ background: "var(--color-ca-violet)" }} />
              <div className="shape-circle absolute right-0 top-0 h-3.5 w-3.5" style={{ background: "var(--color-ca-lime)" }} />
              <div className="absolute inset-0 grid place-items-center text-[13px] font-black tracking-tight text-white">
                CA
              </div>
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-extrabold tracking-tight text-white">{brand.shortName}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Onboarding</div>
            </div>
          </div>

          <h1 className="mt-10 text-[26px] font-black leading-tight tracking-[-0.025em] text-white lg:text-[30px]">
            {brand.onboarding.welcomeTitle}
          </h1>
          <p className="mt-3 text-[14px] font-medium leading-relaxed text-white/60">
            {brand.onboarding.welcomeSubtitle}
          </p>
        </div>

        {/* Checklist */}
        <div className="relative">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Paso 2 de 2
          </div>
          <div className="flex flex-col gap-2.5">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className="shape-circle grid h-5 w-5 shrink-0 place-items-center"
                  style={{
                    background: item.done
                      ? "var(--color-ca-lime)"
                      : "rgba(255,255,255,0.1)",
                  }}
                >
                  {item.done && (
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#0f1340" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: item.done ? "var(--color-ca-lime)" : "rgba(255,255,255,0.6)" }}
                >
                  {item.label}
                </span>
                {item.required && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      background: item.done ? "transparent" : "rgba(255,255,255,0.08)",
                      color: item.done ? "transparent" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {item.done ? "" : "obligatorio"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — white form */}
      <div className="flex w-full flex-col bg-white md:w-[60%]">
        {/* Mobile compact header */}
        <div className="flex items-center gap-3 border-b border-ca-ink/[0.08] px-5 py-4 md:hidden">
          <div className="relative h-8 w-8 shrink-0">
            <div className="shape-circle absolute inset-0" style={{ background: "var(--color-ca-violet)" }} />
            <div className="shape-circle absolute right-0 top-0 h-2.5 w-2.5" style={{ background: "var(--color-ca-lime)" }} />
            <div className="absolute inset-0 grid place-items-center text-[10px] font-black tracking-tight text-white">
              CA
            </div>
          </div>
          <div>
            <div className="text-[14px] font-black tracking-tight text-ca-ink">{brand.onboarding.welcomeTitle}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">Paso 2 de 2</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-10 lg:py-10">
          {error && (
            <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
              {error}
            </div>
          )}

          {/* Avatar */}
          <div className="mb-8 flex items-center gap-5">
            <button
              type="button"
              onClick={handleAvatarClick}
              className="group relative grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-full transition-all"
              style={{ background: avatarPreview ? "transparent" : "var(--color-ca-violet)" }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[28px] font-black text-white">
                  {fullName
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || email.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex flex-col items-center gap-1">
                  <CameraIcon />
                  <span className="text-[10px] font-bold">Cambiar foto</span>
                </div>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div>
              <div className="text-[14px] font-bold text-ca-ink">{fullName || email}</div>
              <div className="text-[12px] font-medium text-ca-ink-soft">{email}</div>
            </div>
          </div>

          {/* Required section */}
          <div className="mb-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
              Datos obligatorios
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Nombre completo */}
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                Nombre completo
              </label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre y apellido"
              />
            </div>

            {/* Teléfono + RUT */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                  Teléfono
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => phone.trim() && setPhone(formatPhone(phone))}
                  placeholder="+56 9 1234 5678"
                />
              </div>

              <div>
                <label htmlFor="rut" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                  RUT
                </label>
                <div className="relative">
                  <Input
                    id="rut"
                    type="text"
                    value={rut}
                    onChange={(e) => handleRutChange(e.target.value)}
                    placeholder="12.345.678-9"
                    className="pr-10"
                    style={{
                      borderColor: rutTouched
                        ? rutValid
                          ? "rgba(63,90,5,0.4)"
                          : rutClean.length >= 8
                            ? "rgba(225,29,72,0.4)"
                            : undefined
                        : undefined,
                    }}
                  />
                  {rutTouched && rutClean.length >= 8 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {rutValid ? (
                        <span className="text-[#3f5a05]"><CheckIcon /></span>
                      ) : (
                        <span className="text-red-500"><AlertIcon /></span>
                      )}
                    </span>
                  )}
                </div>
                {rutTouched && rutClean.length >= 8 && !rutValid && (
                  <p className="mt-1 text-[11px] font-semibold text-red-500">
                    RUT inválido. Verifica el dígito verificador.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-8 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "rgba(20,22,58,0.10)" }} />
            <span className="text-[11px] font-semibold text-ca-ink-soft">
              Opcional · puedes completar esto después
            </span>
            <div className="h-px flex-1" style={{ background: "rgba(20,22,58,0.10)" }} />
          </div>

          {/* Optional section */}
          <div className="mb-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
              Tu contexto profesional
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Empresa + Cargo */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="company" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                  Empresa
                </label>
                <Input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nombre de tu empresa"
                />
              </div>

              <div>
                <label htmlFor="jobTitle" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                  Cargo
                </label>
                <Input
                  id="jobTitle"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Tu cargo actual"
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <label htmlFor="linkedin" className="mb-1.5 block text-[12px] font-bold text-ca-ink">
                LinkedIn
              </label>
              <Input
                id="linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                onBlur={() => linkedinUrl.trim() && setLinkedinUrl(normalizeUrl(linkedinUrl))}
                placeholder="https://linkedin.com/in/tu-perfil"
              />
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="mb-1.5 flex items-center justify-between">
                <span className="text-[12px] font-bold text-ca-ink">Bio</span>
                <span
                  className="text-[11px] font-semibold"
                  style={{
                    color: bio.length > BIO_MAX ? "#e11d48" : "var(--color-ca-ink-soft)",
                  }}
                >
                  {bio.length}/{BIO_MAX}
                </span>
              </label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= BIO_MAX) setBio(e.target.value);
                }}
                rows={3}
                placeholder="Cuéntanos brevemente sobre ti y tu experiencia profesional..."
                className="resize-none"
              />
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div
          className="flex items-center justify-between gap-4 border-t px-6 py-4 lg:px-10"
          style={{ borderColor: "rgba(20,22,58,0.08)" }}
        >
          <div className="hidden items-center gap-2 sm:flex">
            <InfoIcon />
            <span className="text-[12px] font-semibold text-ca-ink-soft">
              {requiredDone
                ? "Todo lo obligatorio está listo"
                : "Completa los 3 campos obligatorios"}
            </span>
          </div>

          <div className="flex w-full items-center gap-3 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              disabled={!requiredDone || submitting}
              className="h-auto px-5 py-2.5 text-[13px]"
            >
              Completar después
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!requiredDone || submitting}
              className="h-auto flex-1 px-6 py-2.5 text-[13px] sm:flex-none"
            >
              {submitting ? "Guardando..." : "Completar y entrar al classroom"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
