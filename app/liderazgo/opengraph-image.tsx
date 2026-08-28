import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/brand";
import { loadPhotoCardAssets, PhotoCard } from "@/lib/og/photo-card";

export const alt =
  "Programa de Liderazgo Comercial Inmobiliario · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

// Fecha y formato: los mismos que publica la sección Formato de la landing
// (lib/landing/liderazgo.ts). Sin precio: el aviso del creativo trae un
// tachado que el sistema no respalda.
export default async function OpenGraphImage() {
  const { foto, logo, fonts } = await loadPhotoCardAssets("public/landing/liderazgo/og-bg.jpg");
  return new ImageResponse(
    (
      <PhotoCard
        foto={foto}
        logo={logo}
        eyebrow="Programa ejecutivo · Liderazgo comercial"
        title="Lidera tu equipo comercial con sistema"
        subtitle="Atrae talento, integra asesores, ordena la gestión y desarrolla un sistema aplicable a tu equipo."
        chips={["16 horas", "4 jornadas presenciales", "Proyecto aplicado"]}
        pill="Cupos limitados · Inicio 25 de septiembre"
        url="capitalacademy.cl/liderazgo"
        titleSize={64}
      />
    ),
    { ...size, fonts },
  );
}
