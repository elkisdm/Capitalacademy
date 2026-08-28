import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/brand";
import { loadPhotoCardAssets, PhotoCard } from "@/lib/og/photo-card";

export const alt =
  "Inscripción al Programa de Liderazgo Comercial Inmobiliario · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const { foto, logo, fonts } = await loadPhotoCardAssets("public/landing/liderazgo/og-bg.jpg");
  return new ImageResponse(
    (
      <PhotoCard
        foto={foto}
        logo={logo}
        eyebrow="Inscripción · Programa de Liderazgo"
        title="Inscríbete al Programa de Liderazgo Comercial Inmobiliario"
        subtitle="Pago seguro en línea con opción de cuotas. Al confirmarse el pago recibes tu acceso por correo."
        chips={["16 horas", "4 jornadas presenciales", "Diploma certificado"]}
        pill="Inscripciones abiertas · Inicio 25 de septiembre"
        url="capitalacademy.cl/pago/liderazgo"
        titleSize={52}
      />
    ),
    { ...size, fonts },
  );
}
