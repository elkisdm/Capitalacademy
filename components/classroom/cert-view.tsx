"use client";

import { useState } from "react";
import { Logo } from "@/components/classroom/primitives";

type CertViewProps = {
  studentName: string;
  programTitle: string;
  cohortName: string;
  verificationCode: string;
  issuedAt: string; // ISO date
  scorePct: number;
  pdfUrl: string;
  academicHours?: string;
};

/* ------------------------------------------------------------------ */
/*  Inline SVG icon helper (mirrors design prototype CIcon)           */
/* ------------------------------------------------------------------ */
function Icon({
  name,
  size = 18,
  stroke = 1.5,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s: React.CSSProperties = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...style,
  };

  const paths: Record<string, React.ReactNode> = {
    check: <path d="M5 13l4 4L19 7" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
    linkedin: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="3" />
        <path d="M7 10v7M7 7.5v.5M11 17v-4a2 2 0 014 0v4M11 10v7" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </>
    ),
    bookmark: <path d="M5 3h14v18l-7-4-7 4V3z" />,
    chevronRight: <path d="M9 18l6-6-6-6" />,
    chevronLeft: <path d="M15 18l-6-6 6-6" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={s} className={className}>
      {paths[name] ?? null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  FakeQR — procedural QR placeholder (from design primitives)       */
/* ------------------------------------------------------------------ */
function FakeQR({ size = 72, fg = "var(--color-ca-ink)", bg = "#fff" }: { size?: number; fg?: string; bg?: string }) {
  const cells = 13;
  const cs = size / cells;
  const filled = (r: number, c: number) => {
    if ((r < 3 && c < 3) || (r < 3 && c > cells - 4) || (r > cells - 4 && c < 3)) {
      return r === 0 || r === 2 || c === 0 || c === 2 || (r === 1 && c === 1);
    }
    return (r * 31 + c * 17 + r * c) % 7 < 3;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ borderRadius: 6, background: bg }}>
      {Array.from({ length: cells }, (_, r) =>
        Array.from(
          { length: cells },
          (_, c) =>
            filled(r, c) && (
              <rect key={`${r}-${c}`} x={c * cs} y={r * cs} width={cs * 0.92} height={cs * 0.92} fill={fg} />
            ),
        ),
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Pill (badge)                                                      */
/* ------------------------------------------------------------------ */
function Pill({
  children,
  tone = "ink",
  size = "md",
  icon,
}: {
  children: React.ReactNode;
  tone?: "ink" | "violet" | "lime" | "rose" | "dark" | "outline" | "glass";
  size?: "sm" | "md" | "lg";
  icon?: string;
}) {
  const tones: Record<string, React.CSSProperties> = {
    ink: { background: "var(--color-ca-bg-soft)", color: "var(--color-ca-ink)" },
    violet: { background: "var(--color-ca-violet-mist)", color: "var(--color-ca-violet-deep)" },
    lime: { background: "var(--color-ca-lime-mist)", color: "#3f5a05" },
    rose: { background: "#fdebef", color: "var(--color-ca-rose)" },
    dark: { background: "var(--color-ca-ink)", color: "#fff" },
    outline: { background: "transparent", color: "var(--color-ca-ink)", border: "1px solid var(--color-ca-outline-strong)" },
    glass: { background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" },
  };
  const sizes: Record<string, string> = {
    sm: "text-[9.5px] px-2 py-0.5",
    md: "text-[10.5px] px-2.5 py-1",
    lg: "text-[11.5px] px-3 py-1.5",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-[0.16em] ${sizes[size]}`}
      style={tones[tone]}
    >
      {icon && <Icon name={icon} size={11} stroke={2.5} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Date formatting                                                   */
/* ------------------------------------------------------------------ */
function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/*  CertView component                                                */
/* ------------------------------------------------------------------ */
export function CertView({
  studentName,
  programTitle,
  cohortName,
  verificationCode,
  issuedAt,
  scorePct,
  pdfUrl,
  academicHours,
}: CertViewProps) {
  const [copied, setCopied] = useState(false);

  const verifyUrl = `capitalacademy.cl/verificar/${verificationCode}`;

  const nameParts = studentName.split(" ");
  const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ca-ink-soft">
            <span>Mis certificados</span>
            <Icon name="chevronRight" size={11} />
            <span className="text-ca-ink">{programTitle}</span>
          </div>
          <h1 className="mt-1 text-[28px] font-black tracking-[-0.025em] text-ca-ink">
            Tu certificado ejecutivo
          </h1>
        </div>
        <Pill tone="lime" icon="check" size="lg">
          Verificado
        </Pill>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* PDF preview frame */}
        <div className="relative">
          <div className="ca-card relative overflow-hidden p-6">
            {/* Top bar */}
            <div className="relative mb-3 flex items-center justify-between">
              <Pill tone="ink" icon="bookmark" size="sm">
                PDF - Vista previa
              </Pill>
              <div className="flex items-center gap-1.5">
                <span className="shape-circle grid h-7 w-7 place-items-center" style={{ background: "var(--color-ca-bg-soft)" }}>
                  <Icon name="chevronLeft" size={12} />
                </span>
                <span className="font-mono text-[10px] font-bold tracking-wider text-ca-ink-soft">1 / 1</span>
                <span className="shape-circle grid h-7 w-7 place-items-center" style={{ background: "var(--color-ca-bg-soft)" }}>
                  <Icon name="chevronRight" size={12} />
                </span>
              </div>
            </div>

            {/* Faux certificate PDF */}
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: 10,
                border: "1px solid var(--color-ca-outline-strong)",
                boxShadow: "0 24px 48px rgba(20,22,58,0.10)",
              }}
            >
              {/* Decorative shapes */}
              <div className="shape-circle absolute -left-12 -top-12 h-32 w-32" style={{ background: "var(--color-ca-violet)", opacity: 0.08 }} />
              <div className="shape-circle absolute -bottom-12 -right-12 h-32 w-32" style={{ background: "var(--color-ca-lime)", opacity: 0.45 }} />
              <div className="shape-circle absolute right-6 top-6 h-3 w-3" style={{ background: "var(--color-ca-violet)" }} />

              <div className="relative grid md:grid-cols-[1fr_auto]">
                {/* Main content */}
                <div className="p-7">
                  <Logo />
                  <div className="mt-6 font-mono text-[9px] font-bold uppercase tracking-[0.32em] text-ca-ink-soft">
                    Certificado de finalización
                  </div>
                  <div className="mt-1 text-[10px] font-semibold text-ca-ink-soft">Se otorga el presente a</div>

                  <h2 className="mt-2 text-[38px] font-black leading-[0.95] tracking-[-0.035em] text-ca-ink">
                    {firstName}
                    {lastName && (
                      <>
                        <br />
                        <span className="opacity-30">{lastName}</span>
                      </>
                    )}
                  </h2>

                  <div className="mt-5 max-w-md text-[11px] leading-relaxed text-ca-ink">
                    Por haber aprobado el quiz final del programa con un puntaje de <strong>{scorePct}%</strong>.
                  </div>
                  <h3 className="mt-2 text-[20px] font-black tracking-tight" style={{ color: "var(--color-ca-violet)" }}>
                    {programTitle}
                  </h3>
                  <div className="mt-1 text-[10px] font-semibold text-ca-ink-soft">
                    {cohortName}
                    {academicHours && ` · ${academicHours}`}
                    {" · e-learning"}
                  </div>

                  {/* Signatures */}
                  <div className="mt-7 grid max-w-md grid-cols-2 gap-6">
                    <div>
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">Director Académico</div>
                      <div className="mt-0.5 text-[14px] font-bold italic text-ca-ink">Andrés Balmaceda C.</div>
                      <div className="mt-0.5 h-px" style={{ background: "var(--color-ca-ink)" }} />
                    </div>
                    <div>
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">Head of Education</div>
                      <div className="mt-0.5 text-[14px] font-bold italic text-ca-ink">Carol Maldonado</div>
                      <div className="mt-0.5 h-px" style={{ background: "var(--color-ca-ink)" }} />
                    </div>
                  </div>
                </div>

                {/* Side panel */}
                <div className="relative p-5" style={{ background: "var(--color-ca-ink)", color: "#fff", width: 168 }}>
                  <div className="shape-circle absolute -left-3 top-1/3 h-5 w-5" style={{ background: "var(--color-ca-lime)" }} />
                  <div className="font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-white/60">Validación</div>
                  <div className="mt-3 inline-block rounded-md bg-white p-1.5">
                    <FakeQR size={96} />
                  </div>
                  <div className="mt-2 space-y-2">
                    {(
                      [
                        ["Folio", verificationCode],
                        ["Calif.", `${scorePct} / 100`],
                        ["Fecha", fmtDateShort(issuedAt)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="border-t border-white/10 pt-2">
                        <div className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-white/55">{k}</div>
                        <div className="font-mono text-[10.5px] font-bold">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side: metadata + actions */}
        <div className="flex flex-col gap-4">
          {/* Meta card */}
          <div className="ca-card p-6">
            <div className="flex items-center justify-between">
              <Pill tone="lime" icon="shield">
                Verificado
              </Pill>
              <div className="font-mono text-[10.5px] font-bold text-ca-ink-soft">{verificationCode}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              {(
                [
                  ["Graduado", studentName],
                  ["Programa", programTitle],
                  ["Cohorte", cohortName],
                  ["Emitido", fmtDate(issuedAt)],
                  ["Calificación", `${scorePct} / 100`],
                  ["Horas", academicHours ?? "-"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{k}</div>
                  <div className="mt-0.5 text-[13.5px] font-extrabold tracking-tight text-ca-ink">{v}</div>
                </div>
              ))}
            </div>

            {/* Verification code block */}
            <div className="mt-5 rounded-xl p-3" style={{ background: "var(--color-ca-violet-mist)" }}>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--color-ca-violet-deep)" }}>
                Código de verificación
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="font-mono text-[15px] font-black tracking-wide" style={{ color: "var(--color-ca-violet-deep)" }}>
                  {verificationCode}
                </code>
                <button
                  onClick={copyCode}
                  className="shape-circle grid h-7 w-7 place-items-center"
                  style={{ background: "#fff", color: "var(--color-ca-violet)" }}
                  aria-label="Copiar código"
                >
                  <Icon name={copied ? "check" : "link"} size={12} stroke={2} />
                </button>
              </div>
              <div className="mt-1 text-[10.5px] font-medium" style={{ color: "var(--color-ca-violet-deep)", opacity: 0.8 }}>
                {verifyUrl}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="ca-card p-6">
            <h4 className="text-[14px] font-extrabold tracking-tight text-ca-ink">Compartir tu logro</h4>
            <div className="mt-4 flex flex-col gap-2.5">
              <a
                href={pdfUrl}
                download
                className="ca-btn-lime inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-bold uppercase tracking-[0.08em]"
              >
                <Icon name="download" size={15} stroke={2} />
                <span>Descargar PDF</span>
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://${verifyUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-white"
                style={{ background: "var(--color-ca-ink)", border: "1px solid var(--color-ca-ink)" }}
              >
                <Icon name="linkedin" size={15} stroke={2} />
                <span>Compartir en LinkedIn</span>
              </a>
              <a
                href={`/verificar/${verificationCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border px-5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-ca-ink"
                style={{ background: "transparent", borderColor: "var(--color-ca-outline-strong)" }}
              >
                <Icon name="shield" size={15} stroke={2} />
                <span>Verificar autenticidad</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
