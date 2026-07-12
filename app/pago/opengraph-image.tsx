import { ImageResponse } from "next/og";
import { BrandCard, CA, OG_SIZE } from "@/lib/og/brand";

export const alt = "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <BrandCard
        eyebrow="Diplomado · Capital Academy"
        title="Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria"
        titleSize={65}
        subtitle="Método y estrategia para cerrar más operaciones. Modalidad online."
        accent={CA.violet}
        footerLeft="INSCRIPCIONES ABIERTAS"
        footerRight="Certificación · SERNAC 10 días"
      />
    ),
    { ...size },
  );
}
