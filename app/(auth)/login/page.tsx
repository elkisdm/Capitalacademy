import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage(
  props: { searchParams: Promise<{ next?: string; error?: string }> },
) {
  const { next, error } = await props.searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(next || "/classroom");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6" style={{ background: "var(--color-ca-bg)" }}>
      {/* Background brand shapes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="shape-circle absolute -left-32 -top-32 h-[500px] w-[500px] opacity-[0.06]" style={{ background: "var(--color-ca-violet)" }} />
        <div className="shape-circle absolute -bottom-20 -right-20 h-80 w-80 opacity-[0.08]" style={{ background: "var(--color-ca-lime)" }} />
        <div className="shape-half-left absolute right-0 top-1/3 h-40 w-20 opacity-[0.05]" style={{ background: "var(--color-ca-violet)" }} />
        <div className="shape-circle absolute bottom-20 left-20 h-6 w-6 opacity-20" style={{ background: "var(--color-ca-lime)" }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative h-14 w-14">
            <div className="shape-circle absolute inset-0" style={{ background: "var(--color-ca-violet)" }} />
            <div className="shape-circle absolute -right-0.5 -top-0.5 h-5 w-5" style={{ background: "var(--color-ca-lime)" }} />
            <div className="absolute inset-0 grid place-items-center text-[18px] font-black tracking-tight text-white">
              CA
            </div>
          </div>
          <h1 className="mt-4 text-[22px] font-black tracking-tight" style={{ color: "var(--color-ca-ink)" }}>
            Capital Academy
          </h1>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
            Accede a tu classroom
          </p>
        </div>

        {/* Card */}
        <div className="ca-card overflow-hidden p-7">
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
              {error === "invalid" ? "Email o contraseña incorrectos." : "Ocurrió un error. Intenta de nuevo."}
            </div>
          )}

          <LoginForm redirectTo={next || "/classroom"} />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
          Capital Academy · Capital Inteligente © 2026
        </p>
      </div>
    </main>
  );
}
