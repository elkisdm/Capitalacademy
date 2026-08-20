import type { Metadata } from "next";
import {
  HeaderLiderazgo,
  HeroLiderazgo,
  QueEncontraras,
  Resultados,
  Malla,
  PublicoObjetivo,
  EquipoAcademico,
  InfoPractica,
  Inscripcion,
  CierreLiderazgo,
} from "@/components/landing/liderazgo/secciones";

export const metadata: Metadata = {
  title: "Programa de Liderazgo Comercial Inmobiliario",
  description:
    "Programa ejecutivo para líderes comerciales: atrae talento, integra asesores, ordena la gestión y desarrolla un sistema aplicable a tu equipo. 16 horas, 4 jornadas presenciales y proyecto aplicado.",
  alternates: { canonical: "/liderazgo" },
  openGraph: {
    title: "Programa de Liderazgo Comercial Inmobiliario | Capital Academy",
    description:
      "Programa ejecutivo para líderes comerciales del rubro inmobiliario. 16 horas, 4 jornadas presenciales y proyecto aplicado.",
    url: "/liderazgo",
    type: "website",
  },
};

export default function LiderazgoLanding() {
  return (
    <>
      <HeaderLiderazgo />
      <main id="main" className="bg-[var(--color-ca-surface)]">
        <HeroLiderazgo />
        <QueEncontraras />
        <Resultados />
        <Malla />
        <PublicoObjetivo />
        <EquipoAcademico />
        <InfoPractica />
        <Inscripcion />
      </main>
      <CierreLiderazgo />
    </>
  );
}
