import { describe, expect, it } from "vitest";
import {
  eliminarDelHistorial,
  guardarEnHistorial,
  HISTORIAL_MAXIMO,
  listarHistorial,
} from "../historial";
import { fichaVacia } from "../ficha";
import { evaluarFicha } from "../evaluar";

/** Storage en memoria con la superficie que usa el módulo. */
function storageFalso(): Storage {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
    clear: () => mapa.clear(),
    key: () => null,
    get length() {
      return mapa.size;
    },
  } as Storage;
}

const FICHA = {
  ...fichaVacia(),
  nombre: "Ana Pérez",
  anioNacimiento: 1988,
  sueldos: [2_800_000, 2_800_000, 2_800_000],
};
const EVALUACION = evaluarFicha(FICHA, {
  valorUF: 39_000,
  hoy: new Date("2026-08-12T12:00:00-04:00"),
});

describe("historial local de evaluaciones", () => {
  it("guarda y lista, con lo más reciente primero", () => {
    const s = storageFalso();
    guardarEnHistorial(s, { nombre: "Ana", valorUF: 39_000, ficha: FICHA, evaluacion: EVALUACION, ahora: 1000 });
    guardarEnHistorial(s, { nombre: "Beto", valorUF: 39_100, ficha: FICHA, evaluacion: EVALUACION, ahora: 2000 });

    const lista = listarHistorial(s);
    expect(lista.map((e) => e.nombre)).toEqual(["Beto", "Ana"]);
    expect(lista[1]!.valorUF).toBe(39_000);
  });

  it("respeta el tope descartando lo más viejo", () => {
    const s = storageFalso();
    for (let i = 0; i < HISTORIAL_MAXIMO + 5; i++) {
      guardarEnHistorial(s, { nombre: `Cliente ${i}`, valorUF: 39_000, ficha: FICHA, evaluacion: EVALUACION, ahora: i });
    }
    const lista = listarHistorial(s);
    expect(lista).toHaveLength(HISTORIAL_MAXIMO);
    expect(lista[0]!.nombre).toBe(`Cliente ${HISTORIAL_MAXIMO + 4}`);
  });

  it("elimina por id y sobrevive a basura en el almacén", () => {
    const s = storageFalso();
    const guardada = guardarEnHistorial(s, { nombre: "Ana", valorUF: 39_000, ficha: FICHA, evaluacion: EVALUACION, ahora: 1000 })!;
    eliminarDelHistorial(s, guardada.id);
    expect(listarHistorial(s)).toHaveLength(0);

    s.setItem("ca-evaluaciones-historial-v1", "{esto no es una lista}");
    expect(listarHistorial(s)).toEqual([]);
  });

  it("una ficha sin nombre queda etiquetada, no vacía", () => {
    const s = storageFalso();
    const e = guardarEnHistorial(s, { nombre: "  ", valorUF: 39_000, ficha: FICHA, evaluacion: EVALUACION, ahora: 1 })!;
    expect(e.nombre).toBe("Ficha sin nombre");
  });
});
