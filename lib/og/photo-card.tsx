import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CA } from "./brand";

/**
 * Tarjeta OG con foto real (1200×630), a juego con las landings de campaña:
 * foto de clase con el degradado navy del hero, logo oficial, Montserrat y
 * los datos de la convocatoria como chips + botón lima.
 *
 * Todo se lee del disco en build (`process.cwd()`): sin red ni CDN. Satori
 * obliga a `display: flex` en todo div con más de un hijo.
 */
export async function loadPhotoCardAssets(fotoRel: string) {
  const root = process.cwd();
  const [foto, logo, extraBold, medium] = await Promise.all([
    readFile(join(root, fotoRel), "base64"),
    readFile(join(root, "public/brand/logo-light.png"), "base64"),
    readFile(join(root, "lib/og/fonts/Montserrat-800.ttf")),
    readFile(join(root, "lib/og/fonts/Montserrat-500.ttf")),
  ]);
  return {
    foto,
    logo,
    fonts: [
      { name: "Montserrat", data: extraBold, weight: 800 as const, style: "normal" as const },
      { name: "Montserrat", data: medium, weight: 500 as const, style: "normal" as const },
    ],
  };
}

export function PhotoCard({
  foto,
  logo,
  eyebrow,
  title,
  subtitle,
  chips,
  pill,
  url,
  titleSize = 60,
}: {
  foto: string;
  logo: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  chips: string[];
  pill: string;
  url: string;
  titleSize?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "Montserrat",
        color: CA.surface,
        background: CA.navyInk,
      }}
    >
      <img
        src={`data:image/jpeg;base64,${foto}`}
        alt=""
        width={1200}
        height={630}
        style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          background:
            "linear-gradient(90deg, rgba(15,19,64,0.96) 0%, rgba(15,19,64,0.88) 42%, rgba(15,19,64,0.45) 72%, rgba(15,19,64,0.15) 100%)",
        }}
      />
      <div
        style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: 1200, height: 8, background: CA.lime }}
      />

      <div
        style={{
          display: "flex",
          position: "relative",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "56px 64px 52px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img src={`data:image/png;base64,${logo}`} alt="" width={58} height={58} style={{ width: 58, height: 58 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>Capital Academy</span>
            <span
              style={{
                display: "flex",
                fontSize: 16,
                fontWeight: 800,
                color: CA.lime,
                textTransform: "uppercase",
                letterSpacing: 4,
                marginTop: 4,
              }}
            >
              {eyebrow}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <span
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: -2,
              maxWidth: 760,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 500,
              lineHeight: 1.35,
              color: "rgba(255,255,255,0.85)",
              maxWidth: 640,
            }}
          >
            {subtitle}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1.5px solid rgba(255,255,255,0.4)",
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, background: CA.lime }} />
                {c}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 26px",
              borderRadius: 999,
              background: CA.lime,
              color: CA.ink,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 0.5,
            }}
          >
            {pill}
          </div>
          <span style={{ display: "flex", fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>{url}</span>
        </div>
      </div>
    </div>
  );
}
