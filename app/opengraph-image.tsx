import { ImageResponse } from "next/og";
import { BrandCard, CA, OG_SIZE } from "@/lib/og/brand";

export const alt =
  "Capital Academy · Escuela de negocios inmobiliarios de Capital Inteligente";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <BrandCard
        eyebrow="Escuela de negocios · Capital Inteligente"
        title="La escuela de negocios inmobiliarios de Chile"
        subtitle="Diplomado · Liderazgo · Workshop · Ruta Inmobiliaria"
        accent={CA.violet}
        footerLeft="capitalacademy.cl"
        footerRight="Formación ejecutiva · Certificación"
      />
    ),
    { ...size },
  );
}
