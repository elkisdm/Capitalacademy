import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCertificateSignedUrl } from "@/lib/certificates/get-certificate-url";

export const metadata: Metadata = {
  title: "Verificar certificado | Capital Academy",
  description: "Verifica la autenticidad de un certificado emitido por Capital Academy.",
};

/* ------------------------------------------------------------------ */
/*  Inline SVG icon helper                                            */
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
    x: <path d="M18 6L6 18M6 6l12 12" />,
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
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={s} className={className}>
      {paths[name] ?? null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  ServerQR — generates real QR code SVG at render time              */
/* ------------------------------------------------------------------ */
async function ServerQR({ url, size = 130 }: { url: string; size?: number }) {
  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      width: size,
      margin: 1,
      color: { dark: "#14163a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    return (
      <div
        style={{ width: size, height: size, borderRadius: 8, overflow: "hidden" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } catch {
    return <div style={{ width: size, height: size, borderRadius: 8, background: "#f8f8fc" }} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Pill                                                              */
/* ------------------------------------------------------------------ */
function Pill({
  children,
  tone = "violet",
  icon,
}: {
  children: React.ReactNode;
  tone?: "violet" | "rose";
  icon?: string;
}) {
  const tones: Record<string, React.CSSProperties> = {
    violet: { background: "var(--color-ca-violet-mist)", color: "var(--color-ca-violet-deep)" },
    rose: { background: "#fdebef", color: "var(--color-ca-rose)" },
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em]"
      style={tones[tone]}
    >
      {icon && <Icon name={icon} size={11} stroke={2.5} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Logo (standalone — no sidebar primitives dependency)              */
/* ------------------------------------------------------------------ */
function PublicLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-9 w-9 shrink-0">
        <div className="shape-circle absolute inset-0 bg-ca-violet" />
        <div className="shape-circle absolute right-0 top-0 h-3.5 w-3.5 bg-ca-lime" />
        <div className="absolute inset-0 grid place-items-center text-[13px] font-black tracking-tight text-white">
          CA
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-extrabold tracking-tight text-ca-ink">Capital Academy</div>
        <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">Classroom</div>
      </div>
    </div>
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

function fmtTimestamp() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} · ${hh}:${min}`;
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                     */
/* ------------------------------------------------------------------ */
async function verifyCertificate(code: string) {
  const supabase = createAdminClient();

  const { data: certificate, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("verification_code", code.toUpperCase())
    .single();

  if (error || !certificate) return null;

  // Get program name
  const { data: program } = await supabase
    .from("programs")
    .select("name")
    .eq("id", certificate.program_id)
    .single();

  // Get cohort name via enrollment
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("id", certificate.enrollment_id)
    .single();

  let cohort: { name: string; start_date: string } | null = null;
  if (enrollment) {
    const { data: cohortData } = await supabase
      .from("cohorts")
      .select("name, start_date")
      .eq("id", enrollment.cohort_id)
      .single();
    cohort = cohortData;
  }

  // Get score from quiz attempt
  let scorePct = 0;
  if (certificate.quiz_attempt_id) {
    const { data: attempt } = await supabase
      .from("quiz_attempts")
      .select("score_pct")
      .eq("id", certificate.quiz_attempt_id)
      .single();
    scorePct = Number(attempt?.score_pct) || 0;
  }

  return {
    studentName: certificate.student_name,
    programName: program?.name ?? "Programa Capital Academy",
    cohortName: cohort ? `${cohort.name}` : "",
    cohortYear: cohort ? new Date(cohort.start_date).getFullYear() : new Date().getFullYear(),
    issuedAt: certificate.issued_at,
    scorePct,
    pdfUrl: await getCertificateSignedUrl(certificate.pdf_storage_path),
    verificationCode: certificate.verification_code,
  };
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cert = await verifyCertificate(code);

  return (
    <div className="relative min-h-screen" style={{ background: "var(--color-ca-bg)" }}>
      {/* Public header */}
      <header
        className="flex items-center justify-between border-b px-6 py-5 md:px-12"
        style={{ background: "var(--color-ca-surface)", borderColor: "var(--color-ca-outline)" }}
      >
        <Link href="/">
          <PublicLogo />
        </Link>
        <div className="flex items-center gap-3 text-[11.5px] font-semibold text-ca-ink-soft">
          <Link href="/#programas" className="hidden transition-colors hover:text-ca-ink sm:inline">
            Programas
          </Link>
          <Link href={`/verificar/${code}`} className="hidden transition-colors hover:text-ca-ink sm:inline">
            Verificar
          </Link>
          <Link href="/#contacto" className="hidden transition-colors hover:text-ca-ink sm:inline">
            Contacto
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full border px-4 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ca-ink"
            style={{ borderColor: "var(--color-ca-outline-strong)" }}
          >
            Iniciar sesion
          </Link>
        </div>
      </header>

      <div className="relative">
        <div className="relative mx-auto max-w-[760px] px-4 py-14 md:px-8">
          {cert ? <ValidCertificate cert={cert} code={code} /> : <InvalidCode code={code} />}

          {/* Public footer */}
          <div className="mt-10 text-center text-[11.5px] font-medium text-ca-ink-soft">
            <span>
              {"Algo no calza? "}
              <a href="mailto:academy@capitalinteligente.cl" className="font-bold" style={{ color: "var(--color-ca-violet)" }}>
                Reporta una inconsistencia
              </a>
            </span>
            <span className="mx-2 opacity-50">·</span>
            <span>Capital Academy by Capital Inteligente · Santiago, Chile</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Valid certificate card                                            */
/* ------------------------------------------------------------------ */
function ValidCertificate({
  cert,
  code,
}: {
  cert: NonNullable<Awaited<ReturnType<typeof verifyCertificate>>>;
  code: string;
}) {
  const nameParts = cert.studentName.split(" ");
  const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  return (
    <>
      {/* Eyebrow */}
      <div className="text-center">
        <Pill tone="violet" icon="shield">
          Verificacion de certificado
        </Pill>
        <h1 className="mt-4 text-[40px] font-black leading-[1] tracking-[-0.035em] text-ca-ink">
          Este certificado es{" "}
          <span style={{ color: "var(--color-ca-lime-deep)" }}>autentico</span>.
        </h1>
        <p className="mt-3 text-[14.5px] font-medium text-ca-ink-soft">
          Fue emitido por Capital Academy y figura en nuestros registros oficiales.
        </p>
      </div>

      {/* Main verification card */}
      <article className="ca-card relative mt-8 overflow-hidden">
        {/* Top band */}
        <div className="relative flex items-center gap-4 px-6 py-6 md:px-8" style={{ background: "var(--color-ca-lime)" }}>
          <div
            className="ca-check-pop shape-circle grid h-12 w-12 shrink-0 place-items-center"
            style={{ background: "var(--color-ca-ink)" }}
          >
            <Icon name="check" size={24} stroke={3.5} style={{ color: "var(--color-ca-lime)" }} />
          </div>
          <div className="min-w-0">
            <div className="font-sans text-[10px] font-black uppercase tracking-[0.22em] text-ca-ink">Estado</div>
            <div className="text-[22px] font-black leading-tight tracking-tight text-ca-ink">Certificado valido</div>
          </div>
          <div className="ml-auto hidden text-right sm:block">
            <div className="font-sans text-[9.5px] font-bold uppercase tracking-[0.22em] text-ca-ink/70">Código</div>
            <code className="font-mono text-[14px] font-black tracking-wide text-ca-ink">{cert.verificationCode}</code>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-0 md:grid-cols-[1fr_auto]">
          <div className="p-6 md:p-8">
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">Otorgado a</div>
            <h2 className="mt-1 text-[40px] font-black leading-[1] tracking-[-0.035em] text-ca-ink">
              {firstName}
              {lastName && (
                <>
                  <br />
                  <span className="opacity-30">{lastName}</span>
                </>
              )}
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {(
                [
                  ["Programa", cert.programName],
                  ["Edicion", `${cert.cohortYear} · ${cert.cohortName}`],
                  ["Fecha de emision", fmtDate(cert.issuedAt)],
                  ["Duracion academica", "e-learning"],
                  ["Calificacion", `${cert.scorePct} / 100`],
                  ["Emisor", "Capital Academy"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="font-sans text-[9.5px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">{k}</div>
                  <div className="mt-0.5 text-[14px] font-extrabold tracking-tight text-ca-ink">{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {cert.pdfUrl && (
                <a
                  href={cert.pdfUrl}
                  download
                  className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-white"
                  style={{ background: "var(--color-ca-ink)", border: "1px solid var(--color-ca-ink)" }}
                >
                  <Icon name="download" size={15} stroke={2} />
                  <span>Descargar PDF</span>
                </a>
              )}
            </div>
          </div>

          {/* QR side */}
          <div
            className="relative flex flex-col items-center justify-center p-8 md:w-[224px]"
            style={{ background: "var(--color-ca-ink)", color: "#fff" }}
          >
            <div aria-hidden className="shape-circle absolute -left-3 top-1/4 h-6 w-6" style={{ background: "var(--color-ca-violet)" }} />
            <div aria-hidden className="shape-circle absolute -left-3 bottom-1/4 h-4 w-4" style={{ background: "var(--color-ca-lime)" }} />
            <div className="rounded-xl bg-white p-2">
              <ServerQR url={`https://capitalacademy.cl/verificar/${code}`} size={130} />
            </div>
            <div className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/65">Escanea para verificar</div>
          </div>
        </div>

        {/* Footer line */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 md:px-8"
          style={{ borderColor: "var(--color-ca-outline)" }}
        >
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-ca-ink-soft">
            <Icon name="shield" size={14} stroke={2} style={{ color: "var(--color-ca-violet)" }} />
            Este certificado fue emitido por Capital Academy y puede ser verificado en linea.
          </div>
          <div className="font-mono text-[10.5px] font-bold text-ca-ink-soft">
            Ultima verificacion · {fmtTimestamp()}
          </div>
        </div>
      </article>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Invalid code state                                                */
/* ------------------------------------------------------------------ */
function InvalidCode({ code }: { code: string }) {
  return (
    <>
      {/* Eyebrow */}
      <div className="text-center">
        <Pill tone="rose" icon="x">
          Verificacion fallida
        </Pill>
        <h1 className="mt-4 text-[40px] font-black leading-[1] tracking-[-0.035em] text-ca-ink">
          Codigo no encontrado
        </h1>
        <p className="mt-3 text-[14.5px] font-medium text-ca-ink-soft">
          El codigo <code className="font-mono font-bold text-ca-ink">{code.toUpperCase()}</code> no
          corresponde a ningun certificado en nuestros registros.
        </p>
      </div>

      {/* Error card */}
      <article className="ca-card relative mt-8 overflow-hidden">
        {/* Top band */}
        <div className="relative flex items-center gap-4 px-6 py-6 md:px-8" style={{ background: "#fdebef" }}>
          <div
            className="ca-check-pop shape-circle grid h-12 w-12 shrink-0 place-items-center"
            style={{ background: "var(--color-ca-rose)" }}
          >
            <Icon name="x" size={24} stroke={3.5} style={{ color: "#fff" }} />
          </div>
          <div className="min-w-0">
            <div className="font-sans text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: "var(--color-ca-rose)" }}>
              Estado
            </div>
            <div className="text-[22px] font-black leading-tight tracking-tight text-ca-ink">No encontrado</div>
          </div>
          <div className="ml-auto hidden text-right sm:block">
            <div className="font-sans text-[9.5px] font-bold uppercase tracking-[0.22em] text-ca-ink/70">Código</div>
            <code className="font-sans text-[14px] font-black tracking-wide text-ca-ink">{code.toUpperCase()}</code>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8">
          <h2 className="text-[18px] font-extrabold tracking-tight text-ca-ink">Esto puede deberse a:</h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-[14px] leading-relaxed text-ca-ink-soft">
            <li>El codigo fue ingresado incorrectamente</li>
            <li>El certificado fue revocado</li>
            <li>El enlace fue modificado o es invalido</li>
          </ul>
          <div className="mt-6">
            <Link
              href="/"
              className="ca-btn-lime inline-flex items-center gap-2 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em]"
            >
              Volver al inicio
            </Link>
          </div>
        </div>

        {/* Footer line */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 md:px-8"
          style={{ borderColor: "var(--color-ca-outline)" }}
        >
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-ca-ink-soft">
            <Icon name="shield" size={14} stroke={2} style={{ color: "var(--color-ca-violet)" }} />
            Si crees que esto es un error, contacta a Capital Academy.
          </div>
          <div className="font-mono text-[10.5px] font-bold text-ca-ink-soft">
            Verificacion · {fmtTimestamp()}
          </div>
        </div>
      </article>
    </>
  );
}
