import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { buildInstructorPatch } from "@/lib/instructors/patch";
import { uuidLike } from "@/lib/utils/zod";
import { INSTRUCTOR_PROFILE_COLUMNS } from "@/lib/instructors/types";

export const runtime = "nodejs";

/**
 * Edición del perfil público del docente (ADR-0028).
 *
 * Solo los campos que el alumno ve en `/classroom/[cohortSlug]/docente/[id]`.
 * NO se edita `full_name`, `email` ni `profile_id`: son la identidad de la ficha
 * y cambiarlos desde acá desalinearía el calendario y el puente con `profiles`.
 * Tampoco se crea ni se borra: el alta sigue viniendo del seed.
 *
 * La escritura la gatea la RLS (`instructors_staff_write`, solo platform staff);
 * `authorizeAdmin` es la primera barrera para devolver 401/403 con un mensaje
 * claro en vez de un 0-filas ambiguo.
 */
/**
 * `profile_id` SÍ se acepta acá (y solo acá): es el enlace entre la ficha y la
 * cuenta de la plataforma, y es lo que habilita que el docente edite su propio
 * perfil en `/docente/perfil`. No se puede deducir solo: hoy 19 de las 20 fichas
 * no tienen email, y varias difieren del nombre de la cuenta por una tilde, así
 * que enlazarlas automáticamente sería adivinar. Lo decide operaciones.
 */
const linkSchema = z.object({ profile_id: uuidLike.nullable() });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ instructorId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { instructorId } = await ctx.params;
  if (!uuidLike.safeParse(instructorId).success) {
    return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Enlazar/desenlazar la ficha con una cuenta es una operación aparte de
  // editar el contenido del perfil: llega sola, sin los campos de texto.
  const link = linkSchema.safeParse(body);
  if (link.success) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("instructors")
      .update({ profile_id: link.data.profile_id } as never)
      .eq("id", instructorId)
      .select(`${INSTRUCTOR_PROFILE_COLUMNS}, profile_id`)
      .maybeSingle();

    if (error) {
      console.error("instructor link error", error);
      if (error.code === "42501") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
      // 23503 = foreign_key_violation: la cuenta elegida no existe.
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Esa cuenta no existe" },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: "Error al enlazar la ficha con la cuenta" },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const built = buildInstructorPatch(body);
  if (!built.ok) {
    return NextResponse.json(
      { error: built.error, ...(built.field ? { field: built.field } : {}) },
      { status: built.status },
    );
  }
  const patch = built.patch;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    // `headline` y las tres URLs son de la migración 0086 y todavía no están en
    // los tipos generados (`supabase gen types` corre DESPUÉS de aplicarla). El
    // cast es acotado a esta llamada: `InstructorPatchKey` mantiene el chequeo
    // de tipos de nuestro lado, y se puede borrar al regenerar los tipos.
    .update(patch as never)
    .eq("id", instructorId)
    .select(INSTRUCTOR_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("instructor update error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // 23514 = check_violation. Solo debería llegar si alguien saltó la
    // normalización de arriba; se traduce a un 422 legible en vez de un 500.
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "Algún dato no cumple el formato permitido. Revisa los enlaces" },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Error al actualizar el perfil del docente" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}
