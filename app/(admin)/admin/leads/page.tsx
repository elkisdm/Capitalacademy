import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { StatStrip } from "@/components/admin/students/shared";
import {
  getAllLeads,
  getAllLeadActivity,
  getAllLeadTasks,
} from "@/lib/admin/leads-queries";
import { LEAD_STAGES_TERMINALES, esContacto } from "@/lib/admin/leads-pipeline";
import { LeadsPanel } from "./leads-panel";

export const metadata = {
  title: "Leads",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminLeadsPage() {
  const { data: { user } } = await getAuthUser();
  if (!user) redirect("/login");

  const [leads, activity, tasks] = await Promise.all([
    getAllLeads(),
    getAllLeadActivity(),
    getAllLeadTasks(),
  ]);

  const now = Date.now();
  const last24 = leads.filter((l) => now - new Date(l.created_at).getTime() < DAY_MS).length;
  // "En gestión" es el embudo vivo: todo lo que no terminó en matrícula ni en
  // descarte. Es el número que dice cuánto trabajo hay encima, que era lo que
  // el total histórico no respondía.
  const enGestion = leads.filter((l) => !LEAD_STAGES_TERMINALES.includes(l.stage)).length;
  const matriculados = leads.filter((l) => l.stage === "matriculado").length;
  // `esContacto` y no "tiene alguna fila de actividad": un cambio de etapa no es
  // haber hablado con nadie. Sin este filtro, un lead movido a "Contactado" y
  // devuelto a "Nuevo" desaparecería de este contador mientras la planilla lo
  // sigue mostrando como "Sin contactar" — dos números que se contradicen.
  const sinContactar = leads.filter(
    (l) =>
      l.stage === "nuevo" &&
      !activity.some((a) => a.lead_id === l.id && esContacto(a.kind)),
  ).length;

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
          { label: "En gestión", value: `${enGestion}`, sub: `de ${leads.length} en total`, tone: "var(--color-ca-navy)" },
          { label: "Sin contactar", value: `${sinContactar}`, sub: "nadie los ha tocado", tone: "var(--color-ca-violet)" },
          { label: "Últimas 24 horas", value: `${last24}`, sub: "leads nuevos", tone: "var(--color-ca-lime-deep)" },
          { label: "Matriculados", value: `${matriculados}`, sub: "cerraron" },
        ]}
      />

      <LeadsPanel leads={leads} activity={activity} tasks={tasks} />
    </div>
  );
}
