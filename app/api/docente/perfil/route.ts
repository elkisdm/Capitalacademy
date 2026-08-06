import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInstructorPatch } from "@/lib/instructors/patch";
import { INSTRUCTOR_PROFILE_COLUMNS } from "@/lib/instructors/types";

export const runtime = "nodejs";

/**
 * Autoservicio: el docente edita SU PROPIA ficha pública (ADR-0028).
 *
 * La ficha se resuelve SIEMPRE por `instructors.profile_id = auth.uid()`, nunca
 * por un id que venga del cuerpo o de la URL: así no hay forma de editar la
 * ficha de otra persona, ni siquiera adivinando su id.
 *
 * Escribe con el cliente admin y no con el del usuario, a propósito. La policy
 * `instructors_staff_write` (0085) solo deja escribir a ops/admin, y abrirla al
 * docente obligaría a una policy nueva que —al no poder acotar columnas— le
 * dejaría tocar también `is_active`, `full_name` o `profile_id` de su fila. Con
 * service_role detrás de esta ruta, el conjunto de columnas editables queda
 * fijado acá por `buildInstructorPatch` y es exactamente el mismo que usa el
 * panel de operaciones. Mismo criterio que ADR-0019.
 */
async function resolveOwnInstructor(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("instructors")
    .select(`${INSTRUCTOR_PROFILE_COLUMNS}, is_active`)
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as
    | ({ id: string; is_active: boolean } & Record<string, unknown>)
    | null;
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const built = buildInstructorPatch(body);
  if (!built.ok) {
    return NextResponse.json(
      { error: built.error, ...(built.field ? { field: built.field } : {}) },
      { status: built.status },
    );
  }

  let mine: Awaited<ReturnType<typeof resolveOwnInstructor>>;
  try {
    mine = await resolveOwnInstructor(user.id);
  } catch (e) {
    console.error("[docente/perfil] error resolviendo la ficha", e);
    return NextResponse.json({ error: "Error al leer tu perfil" }, { status: 500 });
  }

  if (!mine) {
    // No es un 403: la persona puede ser docente de una cohorte y aun así no
    // tener ficha enlazada — hoy 19 de 20 fichas no lo están. El mensaje tiene
    // que mandarla a operaciones, no hacerle creer que le falta permiso.
    return NextResponse.json(
      {
        error:
          "Todavía no tienes una ficha de docente enlazada a tu cuenta. Escríbele a operaciones para que la vincule.",
      },
      { status: 404 },
    );
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("instructors")
    .update(built.patch)
    .eq("id", mine.id)
    // Redundante con el `eq("id")` porque el id salió de la consulta por
    // profile_id, pero deja la intención escrita en la consulta misma.
    .eq("profile_id", user.id)
    .select(INSTRUCTOR_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[docente/perfil] error actualizando", error);
    // 23514 = check_violation. Solo llega si algo saltó la normalización.
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "Algún dato no cumple el formato permitido. Revisa los enlaces" },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "Error al guardar tu perfil" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No se pudo guardar tu perfil" }, { status: 500 });
  }

  return NextResponse.json(data);
}
