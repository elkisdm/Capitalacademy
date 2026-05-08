import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { QueEs } from "@/components/landing/QueEs";
import { NuevoEstandar } from "@/components/landing/NuevoEstandar";
import { Pilares } from "@/components/landing/Pilares";
import { Programas } from "@/components/landing/Programas";
import { DetalleProgramas } from "@/components/landing/DetalleProgramas";
import { PorQueElegir } from "@/components/landing/PorQueElegir";
import { SeccionContacto } from "@/components/landing/SeccionContacto";
import { Cierre } from "@/components/landing/Cierre";
import { Footer } from "@/components/landing/Footer";
import { WhatsappFAB } from "@/components/landing/WhatsappFAB";

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
      <main className="bg-[var(--color-ca-bg)]">
        <Hero />
        <QueEs />
        <NuevoEstandar />
        <Pilares />
        <Programas />
        <DetalleProgramas />
        <PorQueElegir />
        <SeccionContacto />
        <Cierre />
      </main>
      <Footer />
      <WhatsappFAB />
    </>
  );
}
