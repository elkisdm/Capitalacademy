import { Suspense } from "react";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
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
                Capital Academy
              </p>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.3em]"
                style={{ color: "#c5f122" }}
              >
                Plataforma educativa
              </p>
            </div>
            <div className="text-center">
              <div
                className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
                style={{ borderColor: "#5e17eb", borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: "#6b6e8a" }}>
                Cargando&hellip;
              </p>
            </div>
          </div>
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
