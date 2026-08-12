import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { fichaSchema } from "@/lib/evaluacion/ficha";
import { uuidLike } from "@/lib/utils/zod";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const historialLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });

/** Máximo de entradas por usuario: lo viejo se descarta al guardar. */
const HISTORIAL_MAXIMO = 20;

// La evaluación es un objeto calculado por el motor; se valida su esqueleto y
// se acota su tamaño, no su forma completa (el motor es la fuente de verdad y
// la RLS ya garantiza que cada quien solo ve lo suyo).
const guardarSchema = z.object({
  nombre: z.string().trim().max(120).default(""),
  valorUF: z.number().positive().finite(),
  ficha: fichaSchema,
  evaluacion: z
    .object({ califica: z.boolean() })
    .passthrough()
    .refine((e) => JSON.stringify(e).length <= 100_000, "Evaluación demasiado grande"),
});

// ── GET /api/classroom/evaluaciones/historial ────────────────────────
// Lista los análisis guardados del usuario, el más reciente primero.
// RLS: `evaluation_history` solo devuelve filas con user_id = auth.uid().

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("evaluation_history")
    .select("id, nombre, valor_uf, ficha, evaluacion, created_at")
    .order("created_at", { ascending: false })
    .limit(HISTORIAL_MAXIMO);

  if (error) {
    console.error("historial evaluaciones GET error", error);
    return NextResponse.json({ error: "Error al leer el historial" }, { status: 500 });
  }

  return NextResponse.json({ entradas: data ?? [] });
}

// ── POST /api/classroom/evaluaciones/historial ───────────────────────
// Guarda una foto inmutable del análisis y recorta el historial al tope.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = historialLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = guardarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { nombre, valorUF, ficha, evaluacion } = parsed.data;

  const { data: creada, error } = await supabase
    .from("evaluation_history")
    .insert({
      user_id: user.id,
      nombre: nombre || "Ficha sin nombre",
      valor_uf: valorUF,
      // El passthrough de zod pierde la compatibilidad estructural con Json;
      // el contenido ya está validado y acotado en tamaño.
      ficha: ficha as unknown as Json,
      evaluacion: evaluacion as unknown as Json,
    })
    .select("id, nombre, valor_uf, ficha, evaluacion, created_at")
    .single();

  if (error || !creada) {
    console.error("historial evaluaciones INSERT error", error);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }

  // Recorte al tope: se conservan las HISTORIAL_MAXIMO más recientes. Es un
  // barrido best-effort — si falla, el exceso se recorta en el próximo guardado.
  const { data: sobrantes, error: sobrantesError } = await supabase
    .from("evaluation_history")
    .select("id")
    .order("created_at", { ascending: false })
    .range(HISTORIAL_MAXIMO, HISTORIAL_MAXIMO + 50);

  if (!sobrantesError && sobrantes && sobrantes.length > 0) {
    await supabase
      .from("evaluation_history")
      .delete()
      .in(
        "id",
        sobrantes.map((s) => s.id),
      );
  }

  return NextResponse.json({ entrada: creada }, { status: 201 });
}

// ── DELETE /api/classroom/evaluaciones/historial?id=… ────────────────

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = historialLimiter.check(user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const id = new URL(req.url).searchParams.get("id");
  const parsedId = uuidLike.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Id inválido" }, { status: 422 });
  }

  // La RLS limita el delete a filas propias: un id ajeno simplemente no borra.
  const { error } = await supabase
    .from("evaluation_history")
    .delete()
    .eq("id", parsedId.data);

  if (error) {
    console.error("historial evaluaciones DELETE error", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
