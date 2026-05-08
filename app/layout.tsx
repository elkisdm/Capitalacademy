import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://capitalacademy.cl"),
  title: {
    default:
      "Capital Academy | Escuela de negocios inmobiliarios de Capital Inteligente",
    template: "%s · Capital Academy",
  },
  description:
    "Programas de formación ejecutiva para asesores, líderes y emprendedores de la industria inmobiliaria. Conoce Capital Academy, la escuela de negocios de Capital Inteligente.",
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Capital Academy",
    title: "Capital Academy | Escuela de negocios inmobiliarios",
    description:
      "Formación ejecutiva para elevar el estándar de la industria inmobiliaria.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Capital Academy | Escuela de negocios inmobiliarios",
    description:
      "Formación ejecutiva para elevar el estándar de la industria inmobiliaria.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
