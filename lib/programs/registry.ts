/**
 * Registro de identidad por entorno (programa).
 *
 * Fuente ÚNICA de la marca con que se brandean la puerta de entrada (login) y
 * el onboarding de cada programa. Se indexa por un `slug` ESTABLE de ruta
 * (`/login/diplomado`, `/onboarding/diplomado/...`), no por cohorte: así la
 * marca sobrevive a nuevas generaciones (G4, G5, …). El cohorte sigue siendo
 * el dato de aislamiento de datos; el programa es la marca.
 *
 * Server + client safe: solo datos y tipos, sin imports de servidor.
 *
 * La cuenta es ÚNICA por persona (Supabase email+password). Esta capa NO crea
 * credenciales por programa: solo cambia la identidad visual de la entrada.
 * Los admins son transversales y NO se brandean (ver getClassroomAccess /
 * isStaff): el branding aplica al recorrido del alumno.
 */

export type ProgramBrand = {
  /** Slug de ruta. Estable, no cambia entre generaciones. */
  slug: string;
  /** UUID del programa en `public.programs`. null si aún no tiene classroom. */
  programId: string | null;
  /** Código del programa en DB (`programs.code`). */
  code: string | null;
  /** Nombre completo del programa. */
  displayName: string;
  /** Nombre corto para encabezados compactos. */
  shortName: string;
  /** Etiqueta pequeña en mayúsculas sobre el nombre. */
  eyebrow: string;
  /** Acento de marca (hex, tomado de los tokens ca-*). */
  accent: string;
  /** Acento tenue para fondos/halos (hex). */
  accentSoft: string;
  login: {
    title: string;
    subtitle: string;
  };
  onboarding: {
    setPasswordTitle: string;
    setPasswordSubtitle: string;
    welcomeTitle: string;
    welcomeSubtitle: string;
  };
  /** A dónde mandar tras completar el onboarding. */
  redirectTo: string;
};

const CA_LOGO_ON_LIGHT = "/brand/logo-on-light.png";

/**
 * Marca genérica Capital Academy. Es el fallback de toda ruta sin programa
 * resoluble y el branding del `/login` y `/onboarding` genéricos.
 */
export const DEFAULT_BRAND: ProgramBrand = {
  slug: "capital-academy",
  programId: null,
  code: null,
  displayName: "Capital Academy",
  shortName: "Capital Academy",
  eyebrow: "Plataforma educativa",
  accent: "#5e17eb", // ca-violet
  accentSoft: "#ede4fd", // ca-violet-mist
  login: {
    title: "Capital Academy",
    subtitle: "Accede a tu classroom",
  },
  onboarding: {
    setPasswordTitle: "Crea tu contraseña",
    setPasswordSubtitle: "Elige una contraseña segura para acceder a tu cuenta.",
    welcomeTitle: "Completa tu perfil",
    welcomeSubtitle: "Unos datos para personalizar tu experiencia.",
  },
  redirectTo: "/classroom",
};

/**
 * Entornos con identidad propia. Cada uno hereda la estructura del default y
 * sobrescribe nombre, acento y copy. El logo es el de Capital Academy (no hay
 * logos por programa todavía); la diferenciación es por acento + copy.
 */
const BRANDS: ProgramBrand[] = [
  {
    ...DEFAULT_BRAND,
    slug: "diplomado",
    programId: "a0000000-0000-0000-0000-000000000002",
    code: "DIP-VENTAS",
    displayName:
      "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria",
    shortName: "Diplomado Ejecutivo",
    eyebrow: "Diplomado · Capital Academy",
    accent: "#5e17eb", // ca-violet
    accentSoft: "#ede4fd", // ca-violet-mist
    login: {
      title: "Diplomado Ejecutivo",
      subtitle: "Accede a tu classroom del Diplomado",
    },
    onboarding: {
      setPasswordTitle: "Crea tu contraseña",
      setPasswordSubtitle:
        "Elige una contraseña segura para acceder al Diplomado.",
      welcomeTitle: "Bienvenido al Diplomado",
      welcomeSubtitle:
        "Completa tu perfil para comenzar tu formación ejecutiva.",
    },
    redirectTo: "/classroom",
  },
  {
    ...DEFAULT_BRAND,
    slug: "workshop",
    programId: "a0000000-0000-0000-0000-000000000001",
    code: "WS-INMOB",
    displayName: "Workshop Inmobiliario",
    shortName: "Workshop Inmobiliario",
    eyebrow: "Workshop · Capital Academy",
    accent: "#2a3287", // ca-navy
    accentSoft: "#dfe2f3",
    login: {
      title: "Workshop Inmobiliario",
      subtitle: "Accede a tu classroom del Workshop",
    },
    onboarding: {
      setPasswordTitle: "Crea tu contraseña",
      setPasswordSubtitle:
        "Elige una contraseña segura para acceder al Workshop.",
      welcomeTitle: "Bienvenido al Workshop Inmobiliario",
      welcomeSubtitle: "Completa tu perfil para comenzar.",
    },
    redirectTo: "/classroom",
  },
  {
    // Liderazgo: hoy es solo checkout (sin cohorte/classroom). Queda listo en
    // el registro para cuando se active su entorno. programId: null → no se
    // resuelve por matrícula todavía, pero la ruta /login/liderazgo ya brandea.
    ...DEFAULT_BRAND,
    slug: "liderazgo",
    programId: null,
    code: null,
    displayName: "Programa de Liderazgo y Gestión de Equipos Comerciales",
    shortName: "Programa de Liderazgo",
    eyebrow: "Liderazgo · Capital Academy",
    accent: "#f5a524", // ca-amber
    accentSoft: "#fdf0d9",
    login: {
      title: "Programa de Liderazgo",
      subtitle: "Accede a tu classroom de Liderazgo",
    },
    onboarding: {
      setPasswordTitle: "Crea tu contraseña",
      setPasswordSubtitle:
        "Elige una contraseña segura para acceder al programa.",
      welcomeTitle: "Bienvenido al Programa de Liderazgo",
      welcomeSubtitle: "Completa tu perfil para comenzar.",
    },
    redirectTo: "/classroom",
  },
];

const BY_SLUG = new Map(BRANDS.map((b) => [b.slug, b]));
const BY_PROGRAM_ID = new Map(
  BRANDS.filter((b) => b.programId).map((b) => [b.programId as string, b]),
);

/** Marca por slug de ruta. Slug desconocido → marca genérica (degradación segura). */
export function getBrandBySlug(slug: string | undefined | null): ProgramBrand {
  if (!slug) return DEFAULT_BRAND;
  return BY_SLUG.get(slug) ?? DEFAULT_BRAND;
}

/** Marca por UUID de programa (para el flujo genérico que se brandea desde la matrícula). */
export function getBrandByProgramId(
  programId: string | undefined | null,
): ProgramBrand {
  if (!programId) return DEFAULT_BRAND;
  return BY_PROGRAM_ID.get(programId) ?? DEFAULT_BRAND;
}

/** Slugs con entorno real (para generateStaticParams si se quiere). */
export function knownBrandSlugs(): string[] {
  return BRANDS.map((b) => b.slug);
}

/**
 * Ruta de set-password branded del entorno. La marca genérica usa la ruta
 * histórica `/onboarding/set-password`; un entorno usa `/onboarding/<slug>/set-password`.
 */
export function onboardingSetPasswordPath(brand: ProgramBrand): string {
  return brand.slug === DEFAULT_BRAND.slug
    ? "/onboarding/set-password"
    : `/onboarding/${brand.slug}/set-password`;
}

/** Ruta de login branded del entorno (genérico → `/login`). */
export function loginPath(brand: ProgramBrand): string {
  return brand.slug === DEFAULT_BRAND.slug ? "/login" : `/login/${brand.slug}`;
}

export { CA_LOGO_ON_LIGHT };
