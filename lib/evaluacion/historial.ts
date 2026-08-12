/**
 * Historial LOCAL de evaluaciones (enmienda 2 al ADR-0032).
 *
 * Vive en localStorage del computador del asesor, NUNCA en el servidor: la
 * decisión 1 del ADR-0032 sigue en pie — la ficha contiene datos financieros de
 * un tercero identificado y no viaja a ninguna parte. Guardar es una acción
 * explícita del asesor, con la advertencia de que queda solo en esa máquina.
 *
 * El tope de entradas evita que el almacén crezca sin control y acota la
 * exposición: lo viejo se descarta primero.
 */

import type { Ficha } from "./ficha";
import type { Evaluacion } from "./evaluar";

const CLAVE = "ca-evaluaciones-historial-v1";
export const HISTORIAL_MAXIMO = 20;

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

function leerTodo(storage: Storage): EntradaHistorial[] {
  try {
    const crudo = storage.getItem(CLAVE);
    if (!crudo) return [];
    const lista = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    // Filtro estructural mínimo: si otra versión dejó basura, se ignora esa
    // entrada en vez de romper toda la pantalla.
    return lista.filter(
      (e): e is EntradaHistorial =>
        typeof e === "object" &&
        e !== null &&
        typeof e.id === "string" &&
        typeof e.guardadoEn === "number" &&
        typeof e.valorUF === "number" &&
        typeof e.ficha === "object" &&
        typeof e.evaluacion === "object",
    );
  } catch {
    return [];
  }
}

function escribirTodo(storage: Storage, lista: EntradaHistorial[]): boolean {
  try {
    storage.setItem(CLAVE, JSON.stringify(lista));
    return true;
  } catch {
    // Cuota llena o storage bloqueado: se avisa arriba, no se revienta.
    return false;
  }
}

export function listarHistorial(storage: Storage): EntradaHistorial[] {
  // Más reciente primero: es la entrada que el asesor va a buscar.
  return leerTodo(storage).sort((a, b) => b.guardadoEn - a.guardadoEn);
}

export function guardarEnHistorial(
  storage: Storage,
  datos: { nombre: string; valorUF: number; ficha: Ficha; evaluacion: Evaluacion; ahora?: number },
): EntradaHistorial | null {
  const entrada: EntradaHistorial = {
    id: `ev-${(datos.ahora ?? Date.now()).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    guardadoEn: datos.ahora ?? Date.now(),
    nombre: datos.nombre.trim() || "Ficha sin nombre",
    valorUF: datos.valorUF,
    ficha: datos.ficha,
    evaluacion: datos.evaluacion,
  };

  const lista = listarHistorial(storage);
  const recortada = [entrada, ...lista].slice(0, HISTORIAL_MAXIMO);
  return escribirTodo(storage, recortada) ? entrada : null;
}

export function eliminarDelHistorial(storage: Storage, id: string): void {
  escribirTodo(
    storage,
    leerTodo(storage).filter((e) => e.id !== id),
  );
}
