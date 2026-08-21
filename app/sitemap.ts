import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://capitalacademy.cl";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Fase de campaña de Liderazgo: la landing es lo único público que se
  // muestra (el home y la calculadora redirigen ahí, ver next.config.ts),
  // así que es lo único que se ofrece a los buscadores.
  return [
    {
      url: `${SITE_URL}/liderazgo`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
