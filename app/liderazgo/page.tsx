import type { Metadata } from "next";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { LIDERAZGO } from "@/lib/landing/liderazgo";
import { LIDERAZGO_REGULAR_PRICE_CLP } from "@/lib/programs/liderazgo";
import {
  HeaderLiderazgo,
  HeroLiderazgo,
  QueEncontraras,
  Resultados,
  BandaClase,
  Malla,
  PublicoObjetivo,
  EquipoAcademico,
  InfoPractica,
  Inscripcion,
  BandaGraduacion,
  FooterLiderazgo,
} from "@/components/landing/liderazgo/secciones";

const DESCRIPCION =
  "Programa ejecutivo para líderes comerciales del rubro inmobiliario: atrae talento, integra asesores, ordena la gestión y desarrolla un sistema aplicable a tu equipo. 16 horas, 4 jornadas presenciales. Inicio: 25 de septiembre de 2026.";

export const metadata: Metadata = {
  title: "Programa de Liderazgo Comercial Inmobiliario",
  description: DESCRIPCION,
  alternates: { canonical: "/liderazgo" },
  openGraph: {
    title: "Programa de Liderazgo Comercial Inmobiliario | Capital Academy",
    description: DESCRIPCION,
    url: "/liderazgo",
    type: "website",
  },
  // Sin esto la tarjeta de X/Twitter hereda el título genérico del sitio.
  twitter: {
    card: "summary_large_image",
    title: "Programa de Liderazgo Comercial Inmobiliario | Capital Academy",
    description: DESCRIPCION,
  },
};

/**
 * Schema.org del programa (AEO): describe el curso para buscadores y motores
 * de respuesta. Solo afirma lo publicado en la página — fecha, formato y
 * valor sí; el lugar no, que sigue "por confirmar" en Formato.
 *
 * El precio es el de contado sin código (`LIDERAZGO_REGULAR_PRICE_CLP`): el
 * de cuotas incluye recargo y el de lanzamiento depende de un código, y
 * ninguno de los dos es "el precio del curso" para un buscador.
 */
const CURSO_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: LIDERAZGO.nombre,
  description: DESCRIPCION,
  url: "https://capitalacademy.cl/liderazgo",
  inLanguage: "es",
  provider: {
    "@type": "EducationalOrganization",
    name: "Capital Academy",
    url: "https://capitalacademy.cl",
  },
  teaches: LIDERAZGO.jornadas.map((j) => j.titulo),
  audience: {
    "@type": "EducationalAudience",
    educationalRole: "professional",
    audienceType:
      "Líderes y coordinadores de equipos comerciales inmobiliarios",
  },
  offers: {
    "@type": "Offer",
    price: LIDERAZGO_REGULAR_PRICE_CLP,
    priceCurrency: "CLP",
    category: "Paid",
    availability: "https://schema.org/InStock",
    url: "https://capitalacademy.cl/pago/liderazgo",
  },
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Onsite",
    startDate: "2026-09-25",
    courseWorkload: "PT16H",
    instructor: LIDERAZGO.equipo.map((p) => ({
      "@type": "Person",
      name: p.nombre,
      jobTitle: p.rol,
    })),
  },
};

export default function LiderazgoLanding() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(CURSO_JSONLD) }}
      />
      <MetaPixel />
      <HeaderLiderazgo />
      <main id="main" className="bg-[var(--color-ca-surface)]">
        <HeroLiderazgo />
        <QueEncontraras />
        <Resultados />
        <BandaClase />
        <Malla />
        <PublicoObjetivo />
        <EquipoAcademico />
        <InfoPractica />
        <Inscripcion />
        <BandaGraduacion />
      </main>
      <FooterLiderazgo />
    </>
  );
}
