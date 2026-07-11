import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Recuperar contraseña",
  description: "Solicita un enlace para restablecer tu contraseña.",
};

export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/classroom");
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
          <h1 className="mt-4 text-[22px] font-black tracking-tight" style={{ color: "var(--color-ca-ink)" }}>
            Recuperar contraseña
          </h1>
          <p className="mt-1 text-center text-[13px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </div>

        <div className="ca-card overflow-hidden p-7">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-[11px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
          Capital Academy · Capital Inteligente © 2026
        </p>
      </div>
    </main>
  );
}
