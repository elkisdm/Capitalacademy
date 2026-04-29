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
    default: "Capital Academy",
    template: "%s · Capital Academy",
  },
  description:
    "Plataforma académica del Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria.",
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Capital Academy",
    title: "Capital Academy",
    description:
      "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Formación profesional para corredores y asesores.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Capital Academy",
    description:
      "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Formación profesional para corredores y asesores.",
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
