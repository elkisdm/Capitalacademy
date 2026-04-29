import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Capital Academy — Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public", "brand", "logo-light.png"),
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

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
          background:
            "radial-gradient(circle at 85% 15%, #3a14c7 0%, transparent 55%), radial-gradient(circle at 15% 95%, #0b1fe8 0%, transparent 50%), #070a29",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="Capital Academy"
            width={120}
            height={120}
            style={{ objectFit: "contain" }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.1,
            }}
          >
            <span
              style={{
                fontSize: 28,
                color: "#d9f55e",
                letterSpacing: 4,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Capital Academy
            </span>
            <span
              style={{
                fontSize: 22,
                color: "rgba(255,255,255,0.72)",
                marginTop: 8,
              }}
            >
              capitalacademy.cl
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 980,
            }}
          >
            Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria
          </span>
          <span
            style={{
              fontSize: 30,
              color: "rgba(255,255,255,0.78)",
              maxWidth: 900,
              lineHeight: 1.3,
            }}
          >
            Formación profesional para corredores y asesores que quieren cerrar
            más operaciones con método y estrategia.
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(217, 245, 94, 0.28)",
            paddingTop: 24,
          }}
        >
          <span
            style={{
              fontSize: 24,
              color: "#d9f55e",
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            INSCRIPCIONES ABIERTAS
          </span>
          <span
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Modalidad online · Certificación
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
