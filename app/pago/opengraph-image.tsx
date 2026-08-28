import { ImageResponse } from "next/og";
import { OG_SIZE } from "@/lib/og/brand";
import { loadPhotoCardAssets, PhotoCard } from "@/lib/og/photo-card";

export const alt = "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria · Capital Academy";
export const size = OG_SIZE;
export const contentType = "image/png";

// Misma foto y datos que la landing del Diplomado: quien comparte el enlace
// de pago ve la misma tarjeta que la del programa (antes decía "modalidad
// online", que no es cierto: es híbrida).
export default async function OpenGraphImage() {
  const { foto, logo, fonts } = await loadPhotoCardAssets("public/landing/diplomado/og-bg.jpg");
  return new ImageResponse(
    (
      <PhotoCard
        foto={foto}
        logo={logo}
        eyebrow="Inscripción · Diplomado ejecutivo"
        title="Inscríbete al Diplomado en Ventas y Asesoría de Inversión Inmobiliaria"
        subtitle="Pago seguro en línea con opción de cuotas. Al confirmarse el pago recibes tu acceso por correo."
        chips={["12 semanas", "Modalidad híbrida", "Diploma certificado"]}
        pill="Inscripciones abiertas · Inicio 17 de octubre"
        url="capitalacademy.cl/pago"
        titleSize={50}
      />
    ),
    { ...size, fonts },
  );
}
