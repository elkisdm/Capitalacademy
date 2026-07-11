import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});

const SITE_URL = "https://capitalacademy.cl";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Capital Academy | Escuela de negocios inmobiliarios de Capital Inteligente",
    template: "%s · Capital Academy",
  },
  description:
    "Programas de formación ejecutiva para asesores, líderes y emprendedores de la industria inmobiliaria. Conoce Capital Academy, la escuela de negocios de Capital Inteligente.",
  keywords: [
    "Capital Academy",
    "Capital Inteligente",
    "escuela de negocios inmobiliarios",
    "formación ejecutiva inmobiliaria",
    "diplomado ventas inmobiliarias",
    "liderazgo equipos comerciales",
    "ruta inmobiliaria",
    "broker Chile",
    "asesor inmobiliario",
  ],
  authors: [{ name: "Capital Academy" }],
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Capital Academy",
    title: "Capital Academy | Escuela de negocios inmobiliarios",
    description:
      "Formación ejecutiva para elevar el estándar de la industria inmobiliaria.",
    url: "/",
    images: [{ url: "/brand/logo-light.png", width: 400, height: 400 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Capital Academy | Escuela de negocios inmobiliarios",
    description:
      "Formación ejecutiva para elevar el estándar de la industria inmobiliaria.",
    images: ["/brand/logo-light.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "Capital Academy",
  alternateName: "Capital Academy · Capital Inteligente",
  description:
    "Escuela de negocios de Capital Inteligente. Formación ejecutiva para la industria inmobiliaria.",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/logo-light.png`,
  parentOrganization: {
    "@type": "Organization",
    name: "Capital Inteligente",
  },
  sameAs: [],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Programas Capital Academy",
    itemListElement: [
      {
        "@type": "Course",
        name: "Diplomado en Ventas y Asesoría Inmobiliaria",
        description:
          "Formación ejecutiva para brokers, asesores inmobiliarios y ejecutivos de sala de venta.",
        provider: { "@type": "Organization", name: "Capital Academy" },
      },
      {
        "@type": "Course",
        name: "Programa de Liderazgo y Gestión de Equipos Comerciales",
        description:
          "Programa para jefaturas y líderes que buscan construir y sostener equipos comerciales de alto desempeño.",
        provider: { "@type": "Organization", name: "Capital Academy" },
      },
      {
        "@type": "Course",
        name: "Programa Ruta Inmobiliaria",
        description:
          "Programa para emprendedores y profesionales que ingresan al mundo inmobiliario.",
        provider: { "@type": "Organization", name: "Capital Academy" },
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full`}>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[var(--color-ca-violet)] focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-[0_8px_24px_rgba(94,23,235,0.4)]"
        >
          Saltar al contenido principal
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </body>
    </html>
  );
}
