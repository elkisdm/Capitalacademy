import { ImageResponse } from "next/og";
import { BrandCard, OG_SIZE } from "@/lib/og/brand";

// Violeta claro de la marca (--color-ca-violet-soft): el violeta corporativo
// pleno queda sin contraste sobre el fondo navy de la tarjeta.
const VIOLET_SOFT = "#d2b3f8";

export const alt =
  "Programa de Liderazgo Comercial Inmobiliario · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <BrandCard
        eyebrow="Programa ejecutivo · Inmobiliario"
        title="Programa de Liderazgo Comercial Inmobiliario"
        titleSize={60}
        subtitle="Atrae talento, integra asesores, ordena la gestión y desarrolla un sistema aplicable a tu equipo."
        accent={VIOLET_SOFT}
        footerLeft="16 HORAS · 4 JORNADAS PRESENCIALES"
        footerRight="capitalacademy.cl/liderazgo"
      />
    ),
    { ...size },
  );
}
