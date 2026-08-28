import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/brand";
import { loadPhotoCardAssets, PhotoCard } from "@/lib/og/photo-card";

export const alt =
  "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const { foto, logo, fonts } = await loadPhotoCardAssets("public/landing/diplomado/og-bg.jpg");
  return new ImageResponse(
    (
      <PhotoCard
        foto={foto}
        logo={logo}
        eyebrow="Diplomado ejecutivo · 5ª generación"
        title="Diplomado en Ventas y Asesoría de Inversión Inmobiliaria"
        subtitle="Pasa de vendedor tradicional al asesor de inversión que el mercado busca."
        chips={["12 semanas", "Modalidad híbrida", "17 profesores especialistas"]}
        pill="Cupos limitados · Inicio 17 de octubre"
        url="capitalacademy.cl/diplomado"
      />
    ),
    { ...size, fonts },
  );
}
