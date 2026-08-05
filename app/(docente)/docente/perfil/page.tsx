import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INSTRUCTOR_PROFILE_COLUMNS } from "@/lib/instructors/types";
import type { InstructorProfile } from "@/lib/instructors/types";
import { InstructorEditForm } from "@/components/admin/instructor-edit-form";

/**
 * El docente edita su propia ficha pública (ADR-0028).
 *
 * La ficha se resuelve por `profile_id = auth.uid()`, igual que la ruta que
 * guarda. Se lee con el cliente admin porque la policy de lectura de
 * `instructors` (0059) exige que el docente dicte una sesión del programa del
 * que consulta, y eso no aplica a "mirar mi propia ficha".
 */
export default async function DocentePerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = createAdminClient();
  const { data } = await db
    .from("instructors")
    .select(`${INSTRUCTOR_PROFILE_COLUMNS}, is_active`)
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  const instructor = data as unknown as
    | (InstructorProfile & { is_active: boolean })
    | null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-5">
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Profesor · Mi perfil
        </div>
        <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em] text-ca-ink">
          Tu perfil público
        </h1>
        <p className="mt-1 text-[14px] font-semibold text-ca-ink-soft">
          Esto es lo que ven tus alumnos cuando tocan tu nombre en una clase.
        </p>
      </div>

      {instructor ? (
        <>
          <InstructorEditForm
            instructor={instructor}
            endpoint="/api/docente/perfil"
            defaultOpen
          />
          <p className="mt-4 text-[12px] leading-relaxed text-ca-ink-soft">
            Tu foto y tu nombre los administra el equipo de operaciones: si hay
            algo que corregir ahí, escríbeles. La reseña que escribiste en{" "}
            <Link href="/classroom/profile" className="font-bold text-ca-violet hover:underline">
              tu perfil personal
            </Link>{" "}
            es otra cosa y no la ven tus alumnos.
          </p>
        </>
      ) : (
        <div className="ca-card p-5">
          <p className="text-[15px] font-bold text-ca-ink">
            Todavía no tienes una ficha de docente enlazada a tu cuenta.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ca-ink-soft">
            Tu ficha existe —es la que aparece en el calendario y en tus clases—
            pero aún no está conectada con este usuario, así que no podemos saber
            cuál es la tuya. Pídele a operaciones que la vincule y vuelve a esta
            pantalla.
          </p>
        </div>
      )}
    </div>
  );
}
