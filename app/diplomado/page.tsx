import type { Metadata } from "next";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { DIPLOMADO } from "@/lib/landing/diplomado";
import {
  HeaderDiplomado,
  HeroDiplomado,
  CambioIndustria,
  Cursos,
  BandaClase,
  PracticaReal,
  Respaldo,
  Inscripcion,
  BandaGraduacion,
  FooterDiplomado,
} from "@/components/landing/diplomado/secciones";

const DESCRIPCION =
  "Aprende a vender inversión inmobiliaria con fundamentos financieros, lectura de mercado y una metodología consultiva. 12 semanas, modalidad híbrida, 17 profesores especialistas. Inicio: 17 de octubre de 2026.";

const TITULO = "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/diplomado" },
  openGraph: {
    title: `${TITULO} | Capital Academy`,
    description: DESCRIPCION,
    url: "/diplomado",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITULO} | Capital Academy`,
    description: DESCRIPCION,
  },
};

/**
 * Schema.org del programa (AEO). Solo afirma lo publicado en la página:
 * fecha, formato y carga; sin precio, porque la landing no lo publica (el
 * valor se entrega al lead junto con el proceso de inscripción).
 */
const CURSO_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: DIPLOMADO.nombre,
  description: DESCRIPCION,
  url: "https://capitalacademy.cl/diplomado",
  inLanguage: "es",
  provider: {
    "@type": "EducationalOrganization",
    name: "Capital Academy",
    url: "https://capitalacademy.cl",
  },
  teaches: DIPLOMADO.programa.cursos.map((c) => c.titulo),
  audience: {
    "@type": "EducationalAudience",
    educationalRole: "professional",
    audienceType: "Asesores inmobiliarios, brokers y ejecutivos de sala de venta",
  },
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Blended",
    startDate: "2026-10-17",
    courseSchedule: {
      "@type": "Schedule",
      duration: "P12W",
      repeatFrequency: "Weekly",
      byDay: ["Wednesday", "Saturday"],
    },
  },
};

export default function DiplomadoLanding() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(CURSO_JSONLD) }}
      />
      <MetaPixel />
      <HeaderDiplomado />
      <main id="main" className="bg-[var(--color-ca-surface)]">
        <HeroDiplomado />
        <CambioIndustria />
        <Cursos />
        <BandaClase />
        <PracticaReal />
        <Respaldo />
        <Inscripcion />
        <BandaGraduacion />
      </main>
      <FooterDiplomado />
    </>
  );
}
