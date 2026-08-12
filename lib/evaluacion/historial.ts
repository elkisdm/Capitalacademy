/**
 * Historial de evaluaciones a nivel de USUARIO (enmienda 3 al ADR-0032).
 *
 * Vive en la tabla `evaluation_history` con RLS estricta (cada asesor ve solo
 * lo suyo, migración 0098). Guardar sigue siendo una acción EXPLÍCITA: la ficha
 * no se autoguarda nunca — lo que no se guarda desaparece al cerrar.
 *
 * Este módulo es el cliente del endpoint; el tope de entradas y la validación
 * viven en `app/api/classroom/evaluaciones/historial/route.ts`.
 */

import type { Ficha } from "./ficha";
import type { Evaluacion } from "./evaluar";

export type EntradaHistorial = {
  id: string;
  /** Epoch ms del momento en que se guardó. */
  guardadoEn: number;
  nombre: string;
  /** Valor UF con el que se corrió ese análisis (no el del día que se reabre). */
  valorUF: number;
  ficha: Ficha;
  evaluacion: Evaluacion;
};

const ENDPOINT = "/api/classroom/evaluaciones/historial";

type FilaRemota = {
  id: string;
  nombre: string;
  valor_uf: number;
  ficha: Ficha;
  evaluacion: Evaluacion;
  created_at: string;
};

const aEntrada = (f: FilaRemota): EntradaHistorial => ({
  id: f.id,
  guardadoEn: new Date(f.created_at).getTime(),
  nombre: f.nombre,
  valorUF: Number(f.valor_uf),
  ficha: f.ficha,
  evaluacion: f.evaluacion,
});

export async function listarHistorial(): Promise<EntradaHistorial[]> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return [];
    const { entradas } = (await res.json()) as { entradas: FilaRemota[] };
    return entradas.map(aEntrada);
  } catch (e) {
    console.error("No se pudo leer el historial de evaluaciones", e);
    return [];
  }
}

export async function guardarEnHistorial(datos: {
  nombre: string;
  valorUF: number;
  ficha: Ficha;
  evaluacion: Evaluacion;
}): Promise<EntradaHistorial | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
    });
    if (!res.ok) return null;
    const { entrada } = (await res.json()) as { entrada: FilaRemota };
    return aEntrada(entrada);
  } catch (e) {
    console.error("No se pudo guardar en el historial de evaluaciones", e);
    return null;
  }
}

export async function eliminarDelHistorial(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch (e) {
    console.error("No se pudo eliminar del historial de evaluaciones", e);
    return false;
  }
}
