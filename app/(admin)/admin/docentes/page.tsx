import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { InstructorEditForm } from "@/components/admin/instructor-edit-form";
import { InstructorLinkAccount, type TeacherAccount } from "@/components/admin/instructor-link-account";
import { INSTRUCTOR_PROFILE_COLUMNS, type InstructorProfile } from "@/lib/instructors/types";

export const metadata = {
  title: "Docentes · Admin",
};

/**
 * CRUD mínimo del perfil público del docente (ADR-0028 §5).
 *
 * Hasta ahora `instructors` solo se editaba por SQL. Esta pantalla cubre lo que
 * el alumno ve: titular, reseña y redes. No crea ni borra fichas — el alta sigue
 * viniendo del seed del entorno, y borrar una ficha con sesiones asignadas es
 * una operación de datos que no corresponde a este panel.
 *
 * El acceso ya lo gatea `app/(admin)/layout.tsx` (redirige a /classroom a quien
 * no sea ops/admin) y, en la escritura, la RLS `instructors_staff_write`.
 */
export default async function DocentesAdminPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .select(`${INSTRUCTOR_PROFILE_COLUMNS}, is_active, profile_id`)
    .order("full_name", { ascending: true });

  if (error) console.error("[admin/docentes] instructors", error);

  const instructors = (data ?? []) as unknown as Array<
    InstructorProfile & { is_active: boolean; profile_id: string | null }
  >;

  // Candidatos a enlazar: quien tenga rol de docente o asistente en alguna
  // cohorte. No se listan los 500+ perfiles de la plataforma para no convertir
  // el selector en una lotería.
  const { data: cohortStaff } = await supabase
    .from("cohort_roles")
    .select("user_id, profiles(id, full_name, email)")
    .in("role", ["teacher", "assistant"]);

  const accountsById = new Map<string, TeacherAccount>();
  for (const row of cohortStaff ?? []) {
    const p = row.profiles as unknown as TeacherAccount | null;
    if (p?.id) accountsById.set(p.id, p);
  }
  // Las cuentas YA enlazadas se suman aunque no tengan rol de cohorte: si no,
  // su fila mostraría el placeholder del selector como si estuviera sin enlazar,
  // y pulsar "Enlazar" la desvincularía sin querer.
  const linkedIds = instructors
    .map((i) => i.profile_id)
    .filter((id): id is string => Boolean(id) && !accountsById.has(id as string));

  if (linkedIds.length > 0) {
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", linkedIds);
    for (const p of (linkedProfiles ?? []) as TeacherAccount[]) {
      accountsById.set(p.id, p);
    }
  }

  const accounts = [...accountsById.values()].sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email, "es"),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <div className="mb-7">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Configuración
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">
          Docentes
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft">
          Edita la reseña y las redes que los alumnos ven en el perfil de cada profesor. El
          nombre y el correo no se editan aquí: son la identidad de la ficha con la que se
          asignan las clases.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-ca-violet/20 bg-ca-violet/5 p-4 text-[13px] leading-relaxed text-ca-ink-soft">
        Un alumno solo ve el perfil de los docentes que dictan alguna clase de su programa. Si
        completas una ficha y el perfil no aparece, revisa que ese docente tenga al menos una
        sesión asignada en el calendario.
      </div>

      {instructors.length === 0 ? (
        <div className="ca-card p-8 text-center">
          <p className="text-[14px] font-bold text-ca-ink">Todavía no hay docentes cargados</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Las fichas se crean con el seed del entorno. Cuando exista alguna, la vas a poder
            editar desde aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {instructors.map((instructor) => (
            <div key={instructor.id} className="ca-card p-4 md:p-5">
              <InstructorEditForm instructor={instructor} bare />
              <InstructorLinkAccount
                instructorId={instructor.id}
                instructorName={instructor.full_name}
                currentProfileId={instructor.profile_id}
                accounts={accounts}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
