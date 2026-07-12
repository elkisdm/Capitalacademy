/**
 * Piezas compartidas para las imágenes Open Graph (next/og · Satori).
 *
 * Reglas de Satori a respetar en todo consumidor de este módulo:
 * - Todo `div` con más de un hijo debe declarar `display: "flex"` explícito.
 * - Solo flexbox (sin `display: grid`).
 * - No mezclar texto suelto con elementos hermanos dentro de un mismo nodo.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const CA = {
  violet: "#5e17eb",
  violetDeep: "#4a0fd1",
  lime: "#c5f122",
  limeDeep: "#a8d310",
  navy: "#2a3287",
  navyInk: "#0f1340",
  ink: "#14163a",
  inkSoft: "#3d4266",
  amber: "#f5a524",
  rose: "#d14a6b",
  surface: "#ffffff",
} as const;

/**
 * Réplica del `PublicLogo` (app/verificar/[code]/page.tsx) en primitivas
 * compatibles con Satori: círculo violet + punto lime + iniciales "CA".
 */
export function CaMonogram({ size = 96 }: { size?: number }) {
  const dot = Math.round(size * 0.37);
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          borderRadius: 9999,
          background: CA.violet,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          right: 0,
          width: dot,
          height: dot,
          borderRadius: 9999,
          background: CA.lime,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.42),
          fontWeight: 900,
          color: CA.surface,
          letterSpacing: -1,
        }}
      >
        CA
      </div>
    </div>
  );
}

export function BrandCard({
  eyebrow,
  title,
  subtitle,
  accent,
  footerLeft,
  footerRight,
  titleSize = 72,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  footerLeft: string;
  footerRight: string;
  titleSize?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: `radial-gradient(circle at 85% 15%, ${accent} 0%, transparent 55%), linear-gradient(160deg, ${CA.navyInk} 0%, ${CA.ink} 100%)`,
        color: CA.surface,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <CaMonogram size={96} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span
            style={{
              display: "flex",
              fontSize: 28,
              color: CA.surface,
              letterSpacing: 1,
              fontWeight: 800,
            }}
          >
            Capital Academy
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 20,
              color: accent,
              marginTop: 8,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <span
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 980,
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: "flex",
            fontSize: 30,
            color: "rgba(255,255,255,0.78)",
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${accent}48`,
          paddingTop: 24,
        }}
      >
        <span style={{ display: "flex", fontSize: 24, color: accent, fontWeight: 700, letterSpacing: 1 }}>
          {footerLeft}
        </span>
        <span style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.6)" }}>{footerRight}</span>
      </div>
    </div>
  );
}
