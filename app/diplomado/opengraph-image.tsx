import { ImageResponse } from "next/og";
import { BrandCard, CA, OG_SIZE } from "@/lib/og/brand";

export const alt =
  "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <BrandCard
        eyebrow="Diplomado ejecutivo · 5ª generación"
        title="Diplomado en Ventas y Asesoría de Inversión Inmobiliaria"
        titleSize={56}
        subtitle="Fundamentos financieros, lectura de mercado y metodología consultiva para asesorar con criterio."
        accent={CA.lime}
        footerLeft="12 SEMANAS · HÍBRIDO · INICIO 17 DE OCTUBRE"
        footerRight="capitalacademy.cl/diplomado"
      />
    ),
    { ...size },
  );
}
