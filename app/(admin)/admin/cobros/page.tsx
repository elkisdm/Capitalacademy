import { CobroGenerator } from "./cobro-generator";
import { getCobroSigningSecret, signCobroAmount } from "@/lib/cobro/sign";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cobros · Admin" };

const MAX_CLP = 5_000_000;

export default async function AdminCobrosPage({
  searchParams,
}: {
  searchParams: Promise<{ monto?: string }>;
}) {
  const sp = await searchParams;
  const secret = getCobroSigningSecret();

  let monto: number | null = null;
  let generatedLink: string | null = null;
  let error: string | null = null;

  if (sp.monto !== undefined) {
    const parsed = Number(sp.monto);
    if (!secret) {
      error = "Falta configurar COBRO_SIGNING_SECRET en el servidor.";
    } else if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_CLP) {
      error = `Monto inválido. Debe ser un entero entre 1 y ${MAX_CLP.toLocaleString("es-CL")} CLP.`;
    } else {
      monto = parsed;
      const baseUrl = (
        process.env.NEXT_PUBLIC_APP_URL ?? "https://capitalacademy.cl"
      ).replace(/\/$/, "");
      const sig = signCobroAmount(parsed, secret);
      generatedLink = `${baseUrl}/pago/cobro?monto=${parsed}&sig=${sig}`;
    }
  }

  return (
    <div className="ca-fade-up mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-7">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-ink-soft)]">
          Operaciones
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
          Generar link de cobro
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ca-ink-soft)]">
          Crea un enlace de pago por un monto puntual. El cliente paga por Flow;
          el monto va firmado y no se puede alterar.
        </p>
      </header>

      <CobroGenerator
        monto={monto}
        generatedLink={generatedLink}
        error={error}
        maxClp={MAX_CLP}
      />
    </div>
  );
}
