import { describe, it, expect, vi } from "vitest";
import {
  ordenarSegmentos,
  huecosEnSecuencia,
  listarTodo,
  bajarConReintento,
} from "../rescatar-segmentos.mjs";

const nombre = (i: number) => `clase_${String(i).padStart(5, "0")}.ts`;

describe("ordenarSegmentos", () => {
  it("ordena por número de secuencia y descarta lo que no es segmento", () => {
    expect(
      ordenarSegmentos(["clase_00002.ts", "clase.m3u8", "clase_00000.ts", "clase_00001.ts"]),
    ).toEqual(["clase_00000.ts", "clase_00001.ts", "clase_00002.ts"]);
  });

  it("no se deja engañar por el orden alfabético si el egress deja de rellenar con ceros", () => {
    // Alfabéticamente "clase_10.ts" va antes que "clase_9.ts": ordenar por
    // nombre dejaría el minuto 10 delante del 9 y el rescate saldría barajado
    // sin que nada falle a la vista.
    expect(ordenarSegmentos(["clase_10.ts", "clase_9.ts", "clase_1.ts"])).toEqual([
      "clase_1.ts",
      "clase_9.ts",
      "clase_10.ts",
    ]);
  });

  it("mantiene el orden en una clase completa de 2 h (1.200 segmentos)", () => {
    const barajados = Array.from({ length: 1200 }, (_, i) => nombre(i)).reverse();
    const ordenados = ordenarSegmentos(barajados);
    expect(ordenados).toHaveLength(1200);
    expect(ordenados[0]).toBe("clase_00000.ts");
    expect(ordenados.at(-1)).toBe("clase_01199.ts");
  });

  it("devuelve vacío cuando no hay segmentos", () => {
    expect(ordenarSegmentos(["clase.m3u8"])).toEqual([]);
  });
});

describe("huecosEnSecuencia", () => {
  it("no reporta huecos en una secuencia completa", () => {
    expect(huecosEnSecuencia(["clase_00000.ts", "clase_00001.ts", "clase_00002.ts"])).toEqual([]);
  });

  it("reporta el tramo perdido cuando falta un segmento", () => {
    expect(huecosEnSecuencia(["clase_00000.ts", "clase_00003.ts", "clase_00004.ts"])).toEqual([
      [0, 3],
    ]);
  });
});

describe("listarTodo", () => {
  /** Storage falso que pagina de a 100, como el real. */
  function storageCon(total: number) {
    const objetos = Array.from({ length: total }, (_, i) => ({ name: nombre(i) }));
    return {
      list: vi.fn(async (_p: string, o: { limit: number; offset: number }) => ({
        data: objetos.slice(o.offset, o.offset + o.limit),
        error: null,
      })),
    };
  }

  it("trae los 1.200 segmentos de una clase de 2 h, no solo la primera página", async () => {
    // El fallo que esto previene es silencioso: quedarse con 100 objetos
    // produce un MP4 válido de 10 minutos de una clase de dos horas, sin un
    // solo error a la vista.
    const storage = storageCon(1200);
    const nombres = await listarTodo(storage, "sesion/grabacion-hls");
    expect(nombres).toHaveLength(1200);
    expect(nombres.at(-1)).toBe("clase_01199.ts");
    // 12 páginas llenas + una 13ª vacía: con un total múltiplo de 100 no hay
    // forma de saber que se acabó sin preguntar una vez más.
    expect(storage.list).toHaveBeenCalledTimes(13);
  });

  it("corta cuando la última página viene incompleta", async () => {
    const storage = storageCon(250);
    expect(await listarTodo(storage, "p")).toHaveLength(250);
    expect(storage.list).toHaveBeenCalledTimes(3);
  });

  it("no se queda pegado con un prefijo vacío", async () => {
    const storage = storageCon(0);
    expect(await listarTodo(storage, "p")).toEqual([]);
    expect(storage.list).toHaveBeenCalledTimes(1);
  });

  it("propaga el error del listado en vez de rescatar a medias", async () => {
    const storage = { list: vi.fn(async () => ({ data: null, error: { message: "sin permiso" } })) };
    await expect(listarTodo(storage, "p")).rejects.toThrow("sin permiso");
  });
});

describe("bajarConReintento", () => {
  it("reintenta un fallo transitorio en vez de tirar abajo el rescate entero", async () => {
    let llamadas = 0;
    const storage = {
      download: vi.fn(async () => {
        llamadas++;
        return llamadas < 3
          ? { data: null, error: { message: "ECONNRESET" } }
          : { data: "contenido", error: null };
      }),
    };
    expect(await bajarConReintento(storage, "p/clase_00000.ts", 3, 1)).toBe("contenido");
    expect(llamadas).toBe(3);
  });

  it("se rinde con un mensaje que nombra el segmento tras agotar los intentos", async () => {
    const storage = {
      download: vi.fn(async () => ({ data: null, error: { message: "404" } })),
    };
    await expect(bajarConReintento(storage, "p/clase_00042.ts", 2, 1)).rejects.toThrow(
      "clase_00042.ts",
    );
    expect(storage.download).toHaveBeenCalledTimes(2);
  });
});
