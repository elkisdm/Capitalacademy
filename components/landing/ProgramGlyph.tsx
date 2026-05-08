import type { ProgramId } from "@/lib/landing/programs";

type Props = {
  program: ProgramId;
  className?: string;
};

/**
 * Glifo SVG identitario por programa.
 * Diseño basado en el manual gráfico — formas geométricas (círculo, punto, línea).
 *
 * - Diplomado (lima):  flecha ascendente sobre punto = ventas que crecen
 * - Liderazgo (violet): círculos concéntricos = líder al centro, equipo alrededor
 * - Ruta (lavanda):     punto + línea ondulante + círculo = trayectoria del manual
 */
export function ProgramGlyph({ program, className }: Props) {
  switch (program) {
    case "diplomado":
      return (
        <svg
          viewBox="0 0 64 64"
          className={className}
          fill="none"
          aria-hidden
        >
          <circle cx="14" cy="50" r="6" fill="var(--color-ca-lime)" />
          <path
            d="M14 50 L50 14"
            stroke="var(--color-ca-ink)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M50 14 L50 28 M50 14 L36 14"
            stroke="var(--color-ca-ink)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "liderazgo":
      return (
        <svg
          viewBox="0 0 64 64"
          className={className}
          fill="none"
          aria-hidden
        >
          <circle
            cx="32"
            cy="32"
            r="26"
            stroke="var(--color-ca-violet)"
            strokeWidth="2"
            opacity="0.4"
          />
          <circle
            cx="32"
            cy="32"
            r="17"
            stroke="var(--color-ca-violet)"
            strokeWidth="2.5"
            opacity="0.7"
          />
          <circle cx="32" cy="32" r="7" fill="var(--color-ca-violet)" />
        </svg>
      );

    case "ruta":
      return (
        <svg
          viewBox="0 0 64 64"
          className={className}
          fill="none"
          aria-hidden
        >
          <circle cx="6" cy="44" r="3" fill="var(--color-ca-violet-deep)" />
          <path
            d="M6 44 C 14 22, 22 60, 30 38 S 46 22, 58 30"
            stroke="var(--color-ca-violet-deep)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="58" cy="30" r="6" fill="var(--color-ca-lime)" />
        </svg>
      );
  }
}
