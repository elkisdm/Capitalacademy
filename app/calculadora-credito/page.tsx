import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { CalculadoraCredito } from "@/components/calculadora/CalculadoraCredito";
import { getValorUF } from "@/lib/indicadores/uf";

// El valor de la UF se cachea 12h dentro de `getValorUF`; la página se
// revalida al mismo ritmo para no reconstruirse en cada visita.
export const revalidate = 43200;

export const metadata: Metadata = {
  title: "Calculadora de crédito hipotecario | Capital Academy",
  description:
    "Calcula tu dividendo estimado y descubre a qué monto puedes optar según tu renta, tus deudas y el pie que tengas disponible. Herramienta gratuita para asesores inmobiliarios y compradores.",
  alternates: { canonical: "/calculadora-credito" },
  openGraph: {
    title: "Calculadora de crédito hipotecario",
    description:
      "Tu dividendo estimado según renta, deudas, pie y plazo. Gratis y sin registro previo.",
    url: "/calculadora-credito",
    type: "website",
  },
};

export default async function CalculadoraCreditoPage() {
  const valorUF = await getValorUF();

  return (
    <>
      <Header />
      <main className="min-h-dvh bg-ca-bg pb-24 pt-28 sm:pt-32">
        <div className="mx-auto max-w-6xl px-6">
          <header className="mx-auto max-w-3xl">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-ca-violet">
              Herramienta gratuita
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-ca-ink sm:text-5xl md:text-6xl">
              ¿A cuánto crédito{" "}
              <span className="text-ca-violet">puedes optar</span>?
            </h1>
            <p className="mt-6 text-base leading-relaxed text-ca-ink-soft sm:text-lg">
              Ingresa tus ingresos y tus deudas: te mostramos la renta que el
              banco reconoce y el dividendo estimado para cada combinación de pie
              y plazo. Es la misma lógica que usan los asesores para filtrar
              clientes antes de mandarlos al banco.
            </p>
          </header>

          <div className="mt-12">
            <CalculadoraCredito valorUF={valorUF} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
