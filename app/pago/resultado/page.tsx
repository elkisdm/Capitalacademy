import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchFlowPaymentStatus, mapFlowStatus } from "@/lib/flow/status";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resultado del pago · Capital Academy",
};

interface PageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function PagoResultadoPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tokenRaw = params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  if (!token) {
    return (
      <ResultLayout
        title="No encontramos tu pago"
        message="Falta el token de la transacción. Si crees que es un error, escríbenos a contacto@capitalacademy.cl."
        tone="error"
      />
    );
  }

  const result = await fetchFlowPaymentStatus(token);
  if (!result.ok) {
    return (
      <ResultLayout
        title="No pudimos verificar el pago"
        message="Tuvimos un problema consultando Flow. Intenta de nuevo en unos minutos o contáctanos."
        tone="error"
      />
    );
  }

  const status = mapFlowStatus(result.data.status);

  if (status === "succeeded") {
    const supabase = createAdminClient();
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("flow_token", token)
      .single();
    if (payment) {
      redirect(`/pago/gracias?id=${payment.id}`);
    }
    return (
      <ResultLayout
        title="¡Pago recibido!"
        message="Estamos terminando de registrarlo. Revisa tu correo en los próximos minutos."
        tone="success"
      />
    );
  }

  if (status === "pending" || status === "processing") {
    return (
      <ResultLayout
        title="Tu pago está en proceso"
        message="Algunos medios (transferencia, Servipag) tardan unos minutos en confirmar. Te avisaremos por email cuando se acredite."
        tone="info"
      />
    );
  }

  return (
    <ResultLayout
      title="El pago no se completó"
      message="No pudimos procesar tu pago. Puedes volver a intentarlo cuando quieras."
      tone="error"
      retry
    />
  );
}

function ResultLayout({
  title,
  message,
  tone,
  retry = false,
}: {
  title: string;
  message: string;
  tone: "success" | "info" | "error";
  retry?: boolean;
}) {
  const accent =
    tone === "success"
      ? "text-[var(--color-ca-lime)]"
      : tone === "error"
        ? "text-[var(--color-magenta-light)]"
        : "text-white";
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-ca-navy-deep)]">
      <div className="aurora-blob aurora-blob-lime" aria-hidden />
      <div className="aurora-blob aurora-blob-violet" aria-hidden />
      <section className="relative z-10 mx-auto flex min-h-dvh max-w-xl items-center px-4 py-16 sm:py-24">
        <div className="w-full text-center">
          <Image
            src="/brand/logo-light.png"
            alt="Capital Academy"
            width={96}
            height={95}
            priority
            className="mx-auto mb-6 h-20 w-auto sm:h-24"
          />
          <h1
            className={`font-sans text-3xl font-black tracking-[-0.03em] sm:text-4xl ${accent}`}
          >
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-white/75 sm:text-base">
            {message}
          </p>
          {retry && (
            <Link
              href="/pago"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(91,45,235,0.35)] transition-all duration-200 hover:bg-[var(--color-ca-violet-deep)]"
            >
              Reintentar pago
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
