import Image from "next/image";
import { LoginForm } from "./login-form";
import { CA_LOGO_ON_LIGHT, type ProgramBrand } from "@/lib/programs/registry";

/**
 * Pantalla de login branded por entorno. La usan el /login genérico y las
 * rutas dedicadas /login/[programa]: misma estructura, distinta marca.
 */
export function LoginScreen({
  brand,
  redirectTo,
  error,
}: {
  brand: ProgramBrand;
  redirectTo: string;
  error?: string;
}) {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6"
      style={{ background: "var(--color-ca-bg)" }}
    >
      {/* Background brand shapes (tintadas con el acento del entorno) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="shape-circle absolute -left-32 -top-32 h-[500px] w-[500px] opacity-[0.06]" style={{ background: brand.accent }} />
        <div className="shape-circle absolute -bottom-20 -right-20 h-80 w-80 opacity-[0.08]" style={{ background: "var(--color-ca-lime)" }} />
        <div className="shape-half-left absolute right-0 top-1/3 h-40 w-20 opacity-[0.05]" style={{ background: brand.accent }} />
        <div className="shape-circle absolute bottom-20 left-20 h-6 w-6 opacity-20" style={{ background: "var(--color-ca-lime)" }} />
      </div>

      <div className="ca-fade-up relative w-full max-w-sm">
        {/* Logo + identidad del entorno */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src={CA_LOGO_ON_LIGHT}
            alt={brand.displayName}
            width={96}
            height={95}
            priority
            className="h-14 w-auto"
          />
          <h1 className="mt-4 text-center text-[22px] font-black tracking-tight" style={{ color: "var(--color-ca-ink)" }}>
            {brand.login.title}
          </h1>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
            {brand.login.subtitle}
          </p>
        </div>

        {/* Card */}
        <div className="ca-card overflow-hidden p-7">
          {/*
            El aviso de error NO se renderiza acá: lo dibuja `LoginForm` como
            estado inicial. Antes se pintaban dos cajas rojas a la vez (la del
            `?error=` del servidor y la del intento fallido del formulario) y el
            alumno veía dos diagnósticos contradictorios apilados.
          */}
          <LoginForm
            redirectTo={redirectTo}
            accent={brand.accent}
            initialError={error}
            forgotHref={`/forgot-password?next=${encodeURIComponent(redirectTo)}&brand=${brand.slug}`}
          />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
          Capital Academy · Capital Inteligente © 2026
        </p>
      </div>
    </main>
  );
}
