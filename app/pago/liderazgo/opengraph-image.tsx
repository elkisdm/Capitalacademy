import { ImageResponse } from "next/og";
import { BrandCard, CA, OG_SIZE } from "@/lib/og/brand";

export const alt =
  "Programa de Liderazgo y Gestión de Equipos Comerciales · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <BrandCard
        eyebrow="Liderazgo · Capital Academy"
        title="Programa de Liderazgo y Gestión de Equipos Comerciales"
        titleSize={60}
        subtitle="Construye y sostén equipos comerciales de alto desempeño. Cupos limitados."
        accent={CA.amber}
        footerLeft="INSCRIPCIONES ABIERTAS"
        footerRight="Certificación · SERNAC 10 días"
      />
    ),
    { ...size },
  );
}
