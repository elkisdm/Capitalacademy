import { ImageResponse } from "next/og";
import { BrandCard, CaMonogram, CA, OG_SIZE } from "@/lib/og/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandByProgramId } from "@/lib/programs/registry";

export const alt = "Verificación de certificado · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

async function getCertificate(code: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("student_name, program_id, verification_code")
    .eq("verification_code", code.toUpperCase())
    .single();

  if (error || !data) return null;
  return data;
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cert = await getCertificate(code);

  if (!cert) {
    return new ImageResponse(
      (
        <BrandCard
          eyebrow="Verificación de certificado"
          title="Capital Academy"
          subtitle="Consulta la autenticidad de un certificado emitido por Capital Academy."
          accent={CA.violet}
          footerLeft="capitalacademy.cl"
          footerRight="Registro oficial de certificados"
        />
      ),
      { ...size },
    );
  }

  const brand = getBrandByProgramId(cert.program_id);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `radial-gradient(circle at 85% 15%, ${brand.accent} 0%, transparent 55%), linear-gradient(160deg, ${CA.navyInk} 0%, ${CA.ink} 100%)`,
          color: CA.surface,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <CaMonogram size={80} />
            <span style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>
              Capital Academy
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 9999,
                background: CA.lime,
              }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24" style={{ display: "flex" }}>
                <path
                  d="M5 13l4 4L19 7"
                  stroke={CA.ink}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
            <span
              style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: CA.lime,
              }}
            >
              Certificado verificado
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Otorgado a
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1000,
            }}
          >
            {cert.student_name}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 6, height: 34, borderRadius: 9999, background: brand.accent }} />
            <span style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              {brand.shortName}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${brand.accent}48`,
            paddingTop: 24,
          }}
        >
          <span style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.6)" }}>
            Capital Academy · Registro oficial
          </span>
          <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: brand.accent }}>
            CÓDIGO {cert.verification_code}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
