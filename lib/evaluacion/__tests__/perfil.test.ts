import { describe, it, expect } from "vitest";
import { perfilCrediticio, type DatosPerfil } from "@/lib/evaluacion/perfil";
import {
  ANTIGUEDAD,
  CARGA_FINANCIERA,
  PIE_PROPORCION_ESCENARIO_ALTO,
  PIE_PROPORCION_ESCENARIO_BAJO,
} from "@/lib/evaluacion/perfil-constants";

const UF = 39_000;
const CREDITO_BASE = 150_000_000;

/** Perfil que sale verde en los cinco ejes; cada test empeora solo lo suyo. */
const IMPECABLE: DatosPerfil = {
  fuenteRenta: "sueldo_indefinido",
  antiguedadMeses: 60,
  cuotasMensuales: 100_000,
  ingresoReconocido: 3_000_000,
  patrimonioNeto: 60_000_000,
  ahorroDisponible: CREDITO_BASE * PIE_PROPORCION_ESCENARIO_BAJO,
  creditoBase: CREDITO_BASE,
};

const estadoDe = (d: DatosPerfil, clave: string) =>
  perfilCrediticio(d, UF).ejes.find((e) => e.clave === clave)!.estado;

const ejeDe = (d: DatosPerfil, clave: string) =>
  perfilCrediticio(d, UF).ejes.find((e) => e.clave === clave)!;

describe("eje: estabilidad de renta", () => {
  it("sueldo indefinido es verde", () => {
    expect(estadoDe(IMPECABLE, "estabilidad")).toBe("verde");
  });

  it("plazo fijo y mixto son amarillos", () => {
    expect(estadoDe({ ...IMPECABLE, fuenteRenta: "sueldo_plazo_fijo" }, "estabilidad")).toBe("amarillo");
    expect(estadoDe({ ...IMPECABLE, fuenteRenta: "mixto" }, "estabilidad")).toBe("amarillo");
  });

  it("solo honorarios es rojo", () => {
    expect(estadoDe({ ...IMPECABLE, fuenteRenta: "honorarios" }, "estabilidad")).toBe("rojo");
  });
});

describe("eje: antigüedad laboral", () => {
  it("desde 2 años es verde, y el borde exacto cuenta", () => {
    expect(estadoDe({ ...IMPECABLE, antiguedadMeses: ANTIGUEDAD.verdeMeses }, "antiguedad")).toBe("verde");
    expect(estadoDe({ ...IMPECABLE, antiguedadMeses: ANTIGUEDAD.verdeMeses - 1 }, "antiguedad")).toBe("amarillo");
  });

  it("bajo un año es rojo", () => {
    expect(estadoDe({ ...IMPECABLE, antiguedadMeses: ANTIGUEDAD.amarilloMeses }, "antiguedad")).toBe("amarillo");
    expect(estadoDe({ ...IMPECABLE, antiguedadMeses: ANTIGUEDAD.amarilloMeses - 1 }, "antiguedad")).toBe("rojo");
  });

  it("la mejora dice cuántos meses faltan", () => {
    const eje = ejeDe({ ...IMPECABLE, antiguedadMeses: 18 }, "antiguedad");
    expect(eje.mejora).toContain("6 meses");
  });

  it("una antigüedad negativa no rompe el conteo", () => {
    expect(estadoDe({ ...IMPECABLE, antiguedadMeses: -5 }, "antiguedad")).toBe("rojo");
  });
});

describe("eje: carga financiera", () => {
  const conCarga = (proporcion: number): DatosPerfil => ({
    ...IMPECABLE,
    ingresoReconocido: 2_000_000,
    cuotasMensuales: 2_000_000 * proporcion,
  });

  it("bajo 15% es verde", () => {
    expect(estadoDe(conCarga(0.1), "carga")).toBe("verde");
  });

  it("entre 15% y 30% es amarillo, con los bordes incluidos", () => {
    expect(estadoDe(conCarga(CARGA_FINANCIERA.verdeMax), "carga")).toBe("amarillo");
    expect(estadoDe(conCarga(CARGA_FINANCIERA.amarilloMax), "carga")).toBe("amarillo");
  });

  it("sobre 30% es rojo", () => {
    expect(estadoDe(conCarga(0.35), "carga")).toBe("rojo");
  });

  // Sin la cifra, "reducir deudas" no le sirve a nadie en una reunión.
  it("la mejora dice cuánta cuota hay que bajar", () => {
    const eje = ejeDe(conCarga(0.25), "carga");
    // 25% de 2.000.000 = 500.000; para llegar a 15% (300.000) sobran 200.000.
    expect(eje.mejora).toContain("200.000");
  });

  it("sin ingreso reconocido no divide por cero", () => {
    expect(estadoDe({ ...IMPECABLE, ingresoReconocido: 0 }, "carga")).toBe("rojo");
  });
});

describe("eje: patrimonio neto", () => {
  // Referencia: creditoBase/0,8 = 187,5M; el 20% son 37,5M.
  it("sobre el 20% del valor de referencia es verde", () => {
    expect(estadoDe({ ...IMPECABLE, patrimonioNeto: 37_500_000 }, "patrimonio")).toBe("verde");
  });

  it("positivo pero bajo el umbral es amarillo", () => {
    expect(estadoDe({ ...IMPECABLE, patrimonioNeto: 5_000_000 }, "patrimonio")).toBe("amarillo");
  });

  it("cero o negativo es rojo", () => {
    expect(estadoDe({ ...IMPECABLE, patrimonioNeto: 0 }, "patrimonio")).toBe("rojo");
    expect(estadoDe({ ...IMPECABLE, patrimonioNeto: -2_000_000 }, "patrimonio")).toBe("rojo");
  });
});

describe("eje: capacidad de ahorro", () => {
  it("cubrir el pie del escenario exigente es verde", () => {
    const ahorro = CREDITO_BASE * PIE_PROPORCION_ESCENARIO_BAJO;
    expect(estadoDe({ ...IMPECABLE, ahorroDisponible: ahorro }, "ahorro")).toBe("verde");
  });

  it("cubrir solo el pie del escenario holgado es amarillo", () => {
    const ahorro = CREDITO_BASE * PIE_PROPORCION_ESCENARIO_ALTO;
    expect(estadoDe({ ...IMPECABLE, ahorroDisponible: ahorro }, "ahorro")).toBe("amarillo");
  });

  it("no cubrir ninguno es rojo", () => {
    expect(estadoDe({ ...IMPECABLE, ahorroDisponible: 1_000_000 }, "ahorro")).toBe("rojo");
  });

  // Esta es la palanca que la herramienta va a recomendar; sin el número exacto
  // el asesor no puede convertirla en un acuerdo con el cliente.
  it("la mejora dice cuánto pie falta, en UF y en pesos", () => {
    const eje = ejeDe({ ...IMPECABLE, ahorroDisponible: 20_000_000 }, "ahorro");

    // Faltan 37,5M − 20M = 17,5M ≈ 449 UF
    expect(eje.mejora).toContain("UF");
    expect(eje.mejora).toContain("17.500.000");
  });

  // Cuando el límite es el múltiplo de renta, más pie NO sube el tope. Prometerlo
  // en un texto fijo hace que la herramienta mienta en la mitad de los casos:
  // el eje afirma el hecho y la pantalla de resultado destaca la palanca real.
  it("no promete que subirá el valor alcanzable", () => {
    const eje = ejeDe({ ...IMPECABLE, ahorroDisponible: 20_000_000 }, "ahorro");

    expect(eje.mejora).not.toMatch(/sube el valor|aumenta el valor|más propiedad/i);
  });

  it("un ahorro negativo se trata como cero", () => {
    expect(estadoDe({ ...IMPECABLE, ahorroDisponible: -100 }, "ahorro")).toBe("rojo");
  });
});

describe("composición del semáforo", () => {
  it("los cinco ejes en verde dan perfil verde y puntaje máximo", () => {
    const p = perfilCrediticio(IMPECABLE, UF);

    expect(p.color).toBe("verde");
    expect(p.puntaje).toBe(10);
    expect(p.fortalezas).toHaveLength(5);
    expect(p.mejoras).toHaveLength(0);
  });

  it("todo en rojo da perfil rojo y ninguna fortaleza", () => {
    const p = perfilCrediticio(
      {
        fuenteRenta: "honorarios",
        antiguedadMeses: 3,
        cuotasMensuales: 900_000,
        ingresoReconocido: 2_000_000,
        patrimonioNeto: -1_000_000,
        ahorroDisponible: 0,
        creditoBase: CREDITO_BASE,
      },
      UF,
    );

    expect(p.color).toBe("rojo");
    expect(p.puntaje).toBe(0);
    expect(p.fortalezas).toHaveLength(0);
    expect(p.mejoras).toHaveLength(5);
  });

  // La carga es el eje que el banco mira primero y el único capaz de tumbar una
  // operación por sí solo, así que no puede quedar tapado por buen puntaje.
  it("una carga financiera en rojo bloquea el verde aunque el puntaje alcance", () => {
    const d: DatosPerfil = {
      ...IMPECABLE,
      ingresoReconocido: 2_000_000,
      cuotasMensuales: 800_000, // 40% de la renta
    };
    const p = perfilCrediticio(d, UF);

    expect(p.puntaje).toBe(8); // alcanzaría para verde
    expect(p.color).toBe("amarillo");
  });

  it("un perfil mixto cae en amarillo con fortalezas y mejoras a la vez", () => {
    const p = perfilCrediticio(
      { ...IMPECABLE, fuenteRenta: "mixto", antiguedadMeses: 14, ahorroDisponible: 18_000_000 },
      UF,
    );

    expect(p.color).toBe("amarillo");
    expect(p.fortalezas.length).toBeGreaterThan(0);
    expect(p.mejoras.length).toBeGreaterThan(0);
  });

  // El texto no puede leerse como una preaprobación bancaria.
  it("el resumen habla de evaluar, nunca de aprobar", () => {
    for (const d of [IMPECABLE, { ...IMPECABLE, fuenteRenta: "honorarios" as const }]) {
      const p = perfilCrediticio(d, UF);
      expect(p.resumen.toLowerCase()).not.toContain("aprob");
    }
  });

  it("cada eje en verde aporta su fortaleza y ninguna mejora", () => {
    const p = perfilCrediticio(IMPECABLE, UF);

    for (const eje of p.ejes) {
      expect(eje.estado).toBe("verde");
      expect(eje.mejora).toBeNull();
    }
  });
});
