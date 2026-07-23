import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.fintoc.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.fintoc.com https://*.fintoc.com https://*.mux.com https://*.fastly.mux.com",
  "media-src 'self' https://stream.mux.com https://*.fastly.mux.com blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.fintoc.com https://view.officeapps.live.com",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
