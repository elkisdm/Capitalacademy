import { Suspense } from "react";
import { SetPasswordForm } from "../../set-password/set-password-form";
import { getBrandBySlug } from "@/lib/programs/registry";

export async function generateMetadata(
  props: { params: Promise<{ programa: string }> },
) {
  const { programa } = await props.params;
  const brand = getBrandBySlug(programa);
  return { title: `Crea tu contraseña · ${brand.shortName}` };
}

/**
 * Set-password branded por entorno: /onboarding/diplomado/set-password, etc.
 * Slug desconocido → marca genérica.
 */
export default async function ProgramSetPasswordPage(
  props: { params: Promise<{ programa: string }> },
) {
  const { programa } = await props.params;
  const brand = getBrandBySlug(programa);

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center px-4 py-12"
          style={{ background: "#070a29" }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-8 text-center">
              <p className="text-[22px] font-black tracking-tight" style={{ color: "#14163a" }}>
                {brand.shortName}
              </p>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.3em]"
                style={{ color: brand.accent }}
              >
                {brand.eyebrow}
              </p>
            </div>
            <div className="text-center">
              <div
                className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
                style={{ borderColor: brand.accent, borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: "#6b6e8a" }}>
                Cargando&hellip;
              </p>
            </div>
          </div>
        </div>
      }
    >
      <SetPasswordForm brand={brand} />
    </Suspense>
  );
}
