import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "./forgot-password-form";
import { getBrandBySlug, loginPath } from "@/lib/programs/registry";
import { safeNextPath } from "@/lib/auth/redirects";

export const metadata = {
  title: "Enlace de acceso",
  description: "Recibe un enlace para entrar a la plataforma.",
};

export default async function ForgotPasswordPage(
  props: { searchParams: Promise<{ next?: string; brand?: string; email?: string }> },
) {
  const { next, brand: brandSlug, email } = await props.searchParams;
  const brand = getBrandBySlug(brandSlug);
  const dest = safeNextPath(next, "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(dest || "/classroom");
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6" style={{ background: "var(--color-ca-bg)" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="shape-circle absolute -left-32 -top-32 h-[500px] w-[500px] opacity-[0.06]" style={{ background: "var(--color-ca-violet)" }} />
        <div className="shape-circle absolute -bottom-20 -right-20 h-80 w-80 opacity-[0.08]" style={{ background: "var(--color-ca-lime)" }} />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={96}
            height={95}
            priority
            className="h-14 w-auto"
          />
          {/*
            El copy cubre a propósito los dos casos con las mismas palabras: la
            persona que nunca activó su cuenta y la que olvidó su contraseña
            reciben exactamente el mismo enlace.
          */}
          <h1 className="mt-4 text-[22px] font-black tracking-tight" style={{ color: "var(--color-ca-ink)" }}>
            Entra con un enlace
          </h1>
          <p className="mt-1 text-center text-[13px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
            Ingresa tu email y te mandamos un enlace para entrar. Sirve igual si es tu
            primera vez o si olvidaste tu contraseña.
          </p>
        </div>

        <div className="ca-card overflow-hidden p-7">
          <ForgotPasswordForm
            next={dest}
            brand={brand.slug}
            initialEmail={email ?? ""}
            backToLoginHref={
              dest
                ? `${loginPath(brand)}?next=${encodeURIComponent(dest)}`
                : loginPath(brand)
            }
          />
        </div>

        <p className="mt-6 text-center text-[11px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
          Capital Academy · Capital Inteligente © 2026
        </p>
      </div>
    </main>
  );
}
