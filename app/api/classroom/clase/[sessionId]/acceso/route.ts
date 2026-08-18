import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassroomAccess } from "@/lib/classroom/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { decideRoomAccess, type RoomSession } from "@/lib/livekit/access";
import { parseSessionRef } from "@/lib/livekit/meeting-code";

export const runtime = "nodejs";

/**
 * Sala de espera de una clase en vivo (ADR-0031, migración 0091).
 *
 * Quien tiene matrícula activa NO pasa por acá. Esto es para alguien CON CUENTA
 * pero SIN matrícula en esa cohorte: pide entrar, el docente decide, y recién
 * ahí la ruta del token le emite credencial.
 *
 * Lo importante: **quien espera nunca entra a la sala de LiveKit**. No se le
 * emite un token recortado ni se le deja presencia oculta; simplemente no hay
 * token hasta que lo aprueban. Así alguien sin permiso jamás toca la sala.
 *
 *   GET   → su propio estado; si es staff, además la lista de pendientes.
 *   POST  → `request` (pedir entrar) o `approve`/`deny` (solo staff).
 */

const pedirLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

// `union` y no `discriminatedUnion`: aprobar a un usuario y aprobar a un
// invitado comparten el mismo `action` y se distinguen por el id que traen
// (`userId` contra `guestId`), que es justo lo que un discriminado no admite.
const schema = z.union([
  z.object({ action: z.literal("request") }),
  z.object({ action: z.enum(["approve", "deny"]), userId: z.string().uuid() }),
  z.object({ action: z.enum(["approve", "deny"]), guestId: z.string().uuid() }),
]);

type Contexto = {
  session: RoomSession;
  esStaff: boolean;
  /** Matrícula activa en la cohorte: quien la tiene NO pasa por sala de espera. */
  tieneMatricula: boolean;
  userId: string;
};

/** Carga la sesión y resuelve si quien pregunta es staff o alumno de esa cohorte. */
async function contexto(sessionId: string, userId: string): Promise<Contexto | null> {
  const ref = parseSessionRef(sessionId);
  if (ref.kind === "invalid") return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();
  if (!data) return null;

  const session = data as RoomSession;
  const access = await getClassroomAccess(userId, session.cohort_id);
  return {
    session,
    esStaff: Boolean(access?.isStaff),
    // Se descartaba, y sin este dato `decideRoomAccess` recibía siempre
    // `hasActiveEnrollment: false`: todo alumno YA matriculado que pulsara
    // "pedir entrar" caía como pendiente en el panel del docente, que terminaba
    // aprobando a gente que ya estaba dentro.
    tieneMatricula: Boolean(access?.enrollment),
    userId,
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const c = await contexto(sessionId, user.id);
  if (!c) return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });

  const admin = createAdminClient();

  const { data: propia } = await admin
    .from("room_join_requests")
    .select("status")
    .eq("session_id", c.session.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // La lista completa es solo para quien dicta: a un alumno no le incumbe
  // quién más está pidiendo entrar a su clase.
  if (!c.esStaff) {
    return NextResponse.json({
      estado: propia?.status ?? null,
      pendientes: null,
      invitadosPendientes: null,
    });
  }

  const { data: pendientes } = await admin
    .from("room_join_requests")
    // `profiles!user_id`: la tabla tiene DOS claves foráneas a profiles
    // (user_id y decided_by), así que el embed sin desambiguar es un error.
    .select("user_id, created_at, profiles!user_id(full_name, email)")
    .eq("session_id", c.session.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Invitados sin cuenta (0099). Van en una lista aparte porque no tienen
  // `user_id` que mostrar: al docente se le identifican solo por el nombre que
  // escribieron, y el panel los marca como invitados para que eso quede claro.
  const { data: invitados } = await admin
    .from("room_guests")
    .select("id, display_name, created_at")
    .eq("session_id", c.session.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return NextResponse.json({
    estado: propia?.status ?? null,
    invitadosPendientes: (invitados ?? []).map((g) => ({
      guestId: g.id as string,
      nombre: g.display_name as string,
      desde: g.created_at as string,
    })),
    pendientes: (pendientes ?? []).map((r) => {
      const p = r.profiles as { full_name: string | null; email: string } | null;
      return {
        userId: r.user_id as string,
        nombre: p?.full_name || p?.email || "Alguien",
        desde: r.created_at as string,
      };
    }),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const limit = pedirLimiter.check(user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  }

  const c = await contexto(sessionId, user.id);
  if (!c) return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });

  const admin = createAdminClient();

  /* ── Pedir entrar ──────────────────────────────────────────── */
  if (parsed.data.action === "request") {
    // Se consulta la decisión de acceso para NO crear solicitudes que no tienen
    // sentido: quien ya puede entrar no debe generar ruido en la lista del
    // docente, y una clase fuera de ventana no admite solicitudes.
    const decision = decideRoomAccess({
      session: c.session,
      cohortId: c.session.cohort_id,
      hasActiveEnrollment: c.tieneMatricula,
      isStaff: c.esStaff,
      now: new Date(),
    });

    if (decision.allowed) {
      return NextResponse.json({ error: "Ya puedes entrar a esta clase." }, { status: 409 });
    }
    if (decision.reason !== "needs_approval" && decision.reason !== "awaiting_approval") {
      return NextResponse.json({ error: "No puedes pedir entrar a esta clase." }, { status: 409 });
    }

    // `upsert` sobre (session_id, user_id): volver a pedir REUTILIZA la fila.
    // Si el docente ya había rechazado, vuelve a pending — pedir de nuevo es
    // legítimo (puede haberse resuelto por otro canal) y el docente vuelve a
    // decidir; lo que no puede es acumular cinco filas suyas en la lista.
    const { error } = await admin
      .from("room_join_requests")
      .upsert(
        {
          session_id: c.session.id,
          user_id: user.id,
          status: "pending",
          decided_at: null,
          decided_by: null,
        },
        { onConflict: "session_id,user_id" },
      );

    if (error) {
      console.error("[clase/acceso] no se pudo registrar la solicitud", error);
      return NextResponse.json({ error: "No se pudo pedir el acceso" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, estado: "pending" });
  }

  /* ── Aprobar o rechazar ────────────────────────────────────── */
  if (!c.esStaff) {
    return NextResponse.json({ error: "No puedes decidir sobre esta clase." }, { status: 403 });
  }

  if ("guestId" in parsed.data) {
    const { error, data } = await admin
      .from("room_guests")
      .update({
        status: parsed.data.action === "approve" ? "approved" : "denied",
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq("id", parsed.data.guestId)
      // Acotado a ESTA sesión: sin esto, el docente de una clase podría decidir
      // sobre el invitado de otra con solo cambiar el id.
      .eq("session_id", c.session.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[clase/acceso] no se pudo decidir sobre el invitado", error);
      return NextResponse.json({ error: "No se pudo aplicar la decisión" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Esa solicitud ya no existe." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      estado: parsed.data.action === "approve" ? "approved" : "denied",
    });
  }

  const { error, data } = await admin
    .from("room_join_requests")
    .update({
      status: parsed.data.action === "approve" ? "approved" : "denied",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("session_id", c.session.id)
    .eq("user_id", parsed.data.userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.error("[clase/acceso] no se pudo decidir", error);
    return NextResponse.json({ error: "No se pudo aplicar la decisión" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Esa solicitud ya no existe." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, estado: parsed.data.action === "approve" ? "approved" : "denied" });
}
