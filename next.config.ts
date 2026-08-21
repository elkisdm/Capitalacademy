import type { NextConfig } from "next";
import { buildCsp, PERMISSIONS_POLICY } from "./lib/security/csp";

// El CSP se arma en `lib/security/csp.ts` para poder testearlo: un origen que
// falta no rompe el build ni ningún test, solo la función en producción.
const csp = buildCsp({
  isDev: process.env.NODE_ENV !== "production",
  livekitUrl: process.env.LIVEKIT_URL,
});

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "image.mux.com" },
      // Avatares en Supabase Storage: habilita el optimizador de next/image
      // (resize/WebP) en vez de servir el archivo original (hasta 2MB).
      { protocol: "https", hostname: "igatsyghbadccbrjiurl.supabase.co" },
    ],
  },
  // Fase de campaña de Liderazgo (2026-08): lo único público que se muestra es
  // la landing /liderazgo, así que el home y la calculadora redirigen ahí.
  // `permanent: false` a propósito —es una fase, no una mudanza—: cuando el
  // sitio completo vuelva, basta borrar estas dos entradas. El resto de rutas
  // públicas (login, /pago, /sala, /verificar, /asistencia, /auth) son
  // funcionales, no vitrinas, y no se tocan.
  async redirects() {
    return [
      { source: "/", destination: "/liderazgo", permanent: false },
      { source: "/calculadora-credito", destination: "/liderazgo", permanent: false },
    ];
  },
  // Presentaciones estáticas en public/presentaciones/<slug>/index.html:
  // permite la URL limpia /presentaciones/<slug> sin el index.html.
  async rewrites() {
    return [
      {
        source: "/presentaciones/:slug",
        destination: "/presentaciones/:slug/index.html",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
        ],
      },
      {
        // Los pesados de una presentación (imágenes, fuentes, el .pptx) no cambian
        // salvo que se reexporte: se cachean un día y se revalidan en segundo plano
        // durante una semana. El index.html queda fuera a propósito, para poder
        // corregir una lámina y que se vea en la siguiente visita.
        // OJO: en producción esto no alcanza —el CDN de Netlify sirve public/ por su
        // cuenta e ignora estas cabeceras—; la regla que manda está en netlify.toml.
        source: "/presentaciones/:slug/:path((?!index\\.html).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
