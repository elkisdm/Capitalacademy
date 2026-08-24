import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { StatStrip } from "@/components/admin/students/shared";
import { getAllLeads } from "@/lib/admin/leads-queries";
import { LeadsPanel } from "./leads-panel";

export const metadata = {
  title: "Leads",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminLeadsPage() {
  const { data: { user } } = await getAuthUser();
  if (!user) redirect("/login");

  const leads = await getAllLeads();

  const now = Date.now();
  const last7 = leads.filter((l) => now - new Date(l.created_at).getTime() < 7 * DAY_MS).length;
  const last24 = leads.filter((l) => now - new Date(l.created_at).getTime() < DAY_MS).length;
  const deCampana = leads.filter((l) => l.utm_campaign).length;

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Captación
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Leads
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ca-ink-soft">
          Contactos que dejaron sus datos en los formularios públicos (landing,
          campañas, calculadora). Los más recientes van primero.
        </p>
      </div>

      <StatStrip
        items={[
          { label: "Total", value: `${leads.length}`, sub: "histórico", tone: "var(--color-ca-navy)" },
          { label: "Últimos 7 días", value: `${last7}`, tone: "var(--color-ca-lime-deep)" },
          { label: "Últimas 24 horas", value: `${last24}`, tone: "var(--color-ca-violet)" },
          { label: "De campañas", value: `${deCampana}`, sub: "llegaron con UTM de anuncios" },
        ]}
      />

      <LeadsPanel leads={leads} />
    </div>
  );
}
