import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { QueEs } from "@/components/landing/QueEs";
import { NuevoEstandar } from "@/components/landing/NuevoEstandar";
import { Pilares } from "@/components/landing/Pilares";
import { Programas } from "@/components/landing/Programas";
import { CareerPath } from "@/components/landing/CareerPath";
import { Stats } from "@/components/landing/Stats";
import { DetalleProgramas } from "@/components/landing/DetalleProgramas";
import { Comparador } from "@/components/landing/Comparador";
import { Instructor } from "@/components/landing/Instructor";
import { PorQueElegir } from "@/components/landing/PorQueElegir";
import { SeccionContacto } from "@/components/landing/SeccionContacto";
import { FAQSection } from "@/components/landing/FAQ";
import { Cierre } from "@/components/landing/Cierre";
import { Footer } from "@/components/landing/Footer";
import { WhatsappFAB } from "@/components/landing/WhatsappFAB";
import { StickyCTAMobile } from "@/components/landing/StickyCTAMobile";

export const metadata: Metadata = {
  title: "Capital Academy | Escuela de negocios inmobiliarios de Capital Inteligente",
  description:
    "Programas de formación ejecutiva para asesores, líderes y emprendedores de la industria inmobiliaria. Conoce Capital Academy, la escuela de negocios de Capital Inteligente.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Capital Academy | Escuela de negocios inmobiliarios",
    description:
      "Formación ejecutiva para elevar el estándar de la industria inmobiliaria.",
    url: "/",
    type: "website",
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main
        id="main"
        className="bg-[var(--color-ca-bg)] pb-20 md:pb-0"
      >
        <Hero />
        <QueEs />
        <NuevoEstandar />
        <Pilares />
        <Programas />
        <CareerPath />
        <Stats />
        <DetalleProgramas />
        <Comparador />
        <Instructor />
        <PorQueElegir />
        <SeccionContacto />
        <FAQSection />
        <Cierre />
      </main>
      <Footer />
      <WhatsappFAB />
      <StickyCTAMobile />
    </>
  );
}
