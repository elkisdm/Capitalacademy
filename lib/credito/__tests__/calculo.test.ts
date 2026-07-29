import { describe, it, expect } from "vitest";
import {
  dividendoMensual,
  edadDesdeAnioNacimiento,
  matrizDividendos,
  plazoMaximoPorEdad,
  reconocerIngresos,
  rentaFinal,
  rentaRequerida,
  simular,
  tasaMensual,
  type Ingresos,
  type Pasivo,
} from "@/lib/credito/calculo";
import { RENTA_MINIMA_CLP } from "@/lib/credito/constants";

/**
 * Fixtures tomados de la planilla original "CALCULADORA CREDITO.xlsx"
 * (hoja `DIVIDENDO RENTA 25%`), con sus valores ya calculados por Excel.
 */
const PLANILLA = {
  sueldos: [1_300_000, 1_300_000, 1_300_000],
  boletas: [500_000, 800_000, 700_000],
  arriendo: 700_000,
  retirosAnuales: 0,
  cuotaVigente: 80_000,
  valorPropiedadUF: 2500,
  tasaAnual: 0.0332,
  valorUF: 41_000,
};

describe("tasaMensual", () => {
  it("capitaliza geométricamente, no divide entre 12", () => {
    // Planilla C33: =(1+C32)^(1/12)-1
    expect(tasaMensual(0.0332)).toBeCloseTo(0.0027254391280759904, 12);
    expect(tasaMensual(0.0332)).not.toBeCloseTo(0.0332 / 12, 6);
  });

  it("devuelve 0 para tasa 0", () => {
    expect(tasaMensual(0)).toBe(0);
  });
});

describe("reconocerIngresos", () => {
  it("aplica el castigo de cada fuente", () => {
    const r = reconocerIngresos({
      sueldos: PLANILLA.sueldos,
      boletas: PLANILLA.boletas,
      arriendoMensual: PLANILLA.arriendo,
      retirosAnuales: 0,
    });

    expect(r.sueldo).toBe(1_300_000); // 100%
    expect(r.boletas).toBeCloseTo(466_666.67, 2); // promedio de 3 × 70%
    expect(r.arriendo).toBe(700_000); // 100%, igual que la planilla
    expect(r.retiros).toBe(0);
    expect(r.total).toBeCloseTo(2_466_666.67, 2);
  });

  it("CORRECCIÓN: no divide entre 6 cuando hay menos de 6 boletas", () => {
    const r = reconocerIngresos({
      sueldos: [],
      boletas: [500_000, 800_000, 700_000],
      arriendoMensual: 0,
      retirosAnuales: 0,
    });
    // La planilla daba 233.333 (promedio entre 6 celdas × 0,7).
    expect(r.boletas).toBeCloseTo(466_666.67, 2);
    expect(r.boletas).not.toBeCloseTo(233_333.33, 2);
  });

  it("no reconoce boletas si hay menos de 3, y lo advierte", () => {
    const r = reconocerIngresos({
      sueldos: [],
      boletas: [500_000, 800_000],
      arriendoMensual: 0,
      retirosAnuales: 0,
    });
    expect(r.boletas).toBe(0);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain("3 boletas");
  });

  it("no advierte cuando simplemente no hay boletas", () => {
    const r = reconocerIngresos({
      sueldos: [1_000_000],
      boletas: [],
      arriendoMensual: 0,
      retirosAnuales: 0,
    });
    expect(r.advertencias).toHaveLength(0);
  });

  it("mensualiza los retiros anuales y los castiga al 70%", () => {
    const r = reconocerIngresos({
      sueldos: [],
      boletas: [],
      arriendoMensual: 0,
      retirosAnuales: 12_000_000,
    });
    expect(r.retiros).toBe(700_000); // 12M / 12 × 0,7
  });

  it("ignora ceros y negativos al promediar", () => {
    const r = reconocerIngresos({
      sueldos: [1_000_000, 0, -5],
      boletas: [],
      arriendoMensual: -100,
      retirosAnuales: -100,
    });
    expect(r.sueldo).toBe(1_000_000);
    expect(r.arriendo).toBe(0);
    expect(r.retiros).toBe(0);
  });

  it("reproduce el total de la planilla cuando sí hay 6 boletas", () => {
    // Con las 6 boletas cargadas, ambos criterios coinciden: el promedio de la
    // planilla (siempre entre 6) y el nuestro (entre las ingresadas) son el mismo.
    const seisBoletas = [500_000, 800_000, 700_000, 0, 0, 0].map(() => 333_333.33);
    const r = reconocerIngresos({
      sueldos: PLANILLA.sueldos,
      boletas: seisBoletas,
      arriendoMensual: PLANILLA.arriendo,
      retirosAnuales: 0,
    });
    expect(r.total).toBeCloseTo(2_233_333.33, 1); // I10 de la planilla
  });
});

describe("rentaFinal", () => {
  const pasivos: Pasivo[] = [
    { tipo: "consumo", deudaTotal: 5_000_000, valorCuota: 80_000 },
  ];

  it("resta solo las cuotas, nunca la deuda total", () => {
    const { cuotasMensuales, renta } = rentaFinal(2_233_333.33, pasivos);
    expect(cuotasMensuales).toBe(80_000);
    expect(renta).toBeCloseTo(2_153_333.33, 2); // H26 de la planilla
  });

  it("una deuda enorme sin cuota no mueve la renta", () => {
    const { renta } = rentaFinal(2_000_000, [
      { tipo: "rotativo", deudaTotal: 90_000_000, valorCuota: 0 },
    ]);
    expect(renta).toBe(2_000_000);
  });

  it("puede quedar negativa si las cuotas superan el ingreso", () => {
    const { renta } = rentaFinal(500_000, [
      { tipo: "hipotecario", deudaTotal: 0, valorCuota: 800_000 },
    ]);
    expect(renta).toBe(-300_000);
  });
});

describe("dividendoMensual", () => {
  it("reproduce las cuatro esquinas de la matriz de la planilla", () => {
    const base = {
      valorPropiedadUF: PLANILLA.valorPropiedadUF,
      tasaAnual: PLANILLA.tasaAnual,
      valorUF: PLANILLA.valorUF,
    };
    // H59 · pie 7%, 15 años
    expect(dividendoMensual({ ...base, pie: 0.07, plazoAnios: 15 })).toBeCloseTo(
      670_770.4243277464,
      4,
    );
    // K59 · pie 20%, 15 años
    expect(dividendoMensual({ ...base, pie: 0.2, plazoAnios: 15 })).toBeCloseTo(
      577_006.8166260185,
      4,
    );
    // H62 · pie 7%, 30 años
    expect(dividendoMensual({ ...base, pie: 0.07, plazoAnios: 30 })).toBeCloseTo(
      415_935.10706605954,
      4,
    );
    // K62 · pie 20%, 30 años
    expect(dividendoMensual({ ...base, pie: 0.2, plazoAnios: 30 })).toBeCloseTo(
      357_793.6404869329,
      4,
    );
  });

  it("con tasa 0 reparte el capital en cuotas iguales (sin dividir por cero)", () => {
    const d = dividendoMensual({
      valorPropiedadUF: 1200,
      pie: 0,
      tasaAnual: 0,
      plazoAnios: 10,
      valorUF: 40_000,
    });
    expect(d).toBe((1200 / 120) * 40_000);
    expect(Number.isFinite(d)).toBe(true);
  });

  it("devuelve 0 ante entradas degeneradas", () => {
    const base = { tasaAnual: 0.03, valorUF: 40_000 };
    expect(
      dividendoMensual({ ...base, valorPropiedadUF: 0, pie: 0, plazoAnios: 20 }),
    ).toBe(0);
    expect(
      dividendoMensual({ ...base, valorPropiedadUF: 1000, pie: 1, plazoAnios: 20 }),
    ).toBe(0);
    expect(
      dividendoMensual({ ...base, valorPropiedadUF: 1000, pie: 0, plazoAnios: 0 }),
    ).toBe(0);
    expect(
      dividendoMensual({
        valorPropiedadUF: 1000,
        pie: 0,
        tasaAnual: 0.03,
        plazoAnios: 20,
        valorUF: 0,
      }),
    ).toBe(0);
  });

  it("a mayor pie, menor dividendo; a mayor plazo, menor dividendo", () => {
    const base = {
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    };
    expect(dividendoMensual({ ...base, pie: 0.2, plazoAnios: 20 })).toBeLessThan(
      dividendoMensual({ ...base, pie: 0.07, plazoAnios: 20 }),
    );
    expect(dividendoMensual({ ...base, pie: 0.1, plazoAnios: 30 })).toBeLessThan(
      dividendoMensual({ ...base, pie: 0.1, plazoAnios: 15 }),
    );
  });
});

describe("rentaRequerida", () => {
  it("es el dividendo multiplicado por 4 (carga máxima 25%)", () => {
    expect(rentaRequerida(415_935.10706605954)).toBeCloseTo(
      1_663_740.4282642382,
      4,
    ); // H36 de la planilla
  });
});

describe("plazoMaximoPorEdad", () => {
  it("ofrece 30 años mientras el crédito termine antes de los 79", () => {
    expect(plazoMaximoPorEdad(49)).toBe(30); // nacido en 1976 según la planilla
    expect(plazoMaximoPorEdad(45)).toBe(30);
  });

  it("recorta el plazo a medida que sube la edad", () => {
    expect(plazoMaximoPorEdad(52)).toBe(25); // nacido en 1973
    expect(plazoMaximoPorEdad(58)).toBe(20);
    expect(plazoMaximoPorEdad(63)).toBe(15);
  });

  it("corta exactamente en el borde de los 79 años al término", () => {
    expect(plazoMaximoPorEdad(49)).toBe(30); // 49 + 30 = 79 ✓
    expect(plazoMaximoPorEdad(50)).toBe(25); // 50 + 30 = 80 ✗
    expect(plazoMaximoPorEdad(64)).toBe(15); // 64 + 15 = 79 ✓
  });

  it("devuelve null cuando ni el plazo más corto cabe", () => {
    expect(plazoMaximoPorEdad(65)).toBeNull();
    expect(plazoMaximoPorEdad(80)).toBeNull();
  });

  it("cubre los años que la planilla había perdido (1979-1989)", () => {
    // La tabla original no tenía fila para estos años: los pisó la matriz de
    // dividendos. La regla los responde igual que a cualquier otro.
    for (let anio = 1979; anio <= 1989; anio++) {
      const edad = edadDesdeAnioNacimiento(anio, new Date("2026-07-29T12:00:00Z"));
      expect(plazoMaximoPorEdad(edad)).toBe(30);
    }
  });
});

describe("edadDesdeAnioNacimiento", () => {
  it("calcula la edad contra el año en curso", () => {
    expect(
      edadDesdeAnioNacimiento(1976, new Date("2026-07-29T12:00:00Z")),
    ).toBe(50);
  });
});

describe("matrizDividendos", () => {
  const base = {
    valorPropiedadUF: 2500,
    tasaAnual: 0.0332,
    valorUF: 41_000,
  };

  it("devuelve una fila por plazo y una columna por pie", () => {
    const m = matrizDividendos({ ...base, rentaDisponible: 3_000_000 });
    expect(m).toHaveLength(4);
    m.forEach((fila) => expect(fila).toHaveLength(4));
    expect(m[0]![0]!.plazoAnios).toBe(15);
    expect(m[3]![3]!.pie).toBe(0.2);
  });

  it("CORRECCIÓN: marca cada celda según la renta, sin dejarlo al ojo humano", () => {
    // Renta final de la planilla: califica a 30 años pero no a 15.
    const m = matrizDividendos({ ...base, rentaDisponible: 2_153_333.33 });
    const a15pie7 = m[0]![0]!;
    const a30pie7 = m[3]![0]!;

    expect(a15pie7.califica).toBe(false);
    expect(a15pie7.motivo).toBe("renta_insuficiente");
    expect(a30pie7.califica).toBe(true);
    expect(a30pie7.motivo).toBeUndefined();
  });

  it("bloquea por edad los plazos que exceden el máximo", () => {
    const m = matrizDividendos({
      ...base,
      rentaDisponible: 99_000_000,
      edad: 55, // máximo 20 años
    });
    expect(m[1]![0]!.califica).toBe(true); // 20 años
    expect(m[2]![0]!.califica).toBe(false); // 25 años
    expect(m[2]![0]!.motivo).toBe("plazo_excede_edad");
    expect(m[3]![0]!.motivo).toBe("plazo_excede_edad");
  });

  it("sin edad no aplica tope de plazo", () => {
    const m = matrizDividendos({ ...base, rentaDisponible: 99_000_000 });
    expect(m.flat().every((c) => c.califica)).toBe(true);
  });

  it("bloquea TODOS los plazos cuando la edad excede hasta el más corto", () => {
    // Regresión: antes, una edad demasiado alta hacía que plazoMaximoPorEdad
    // devolviera null y NINGUNA celda se bloqueara → el cliente calificaba a
    // los 4 plazos con renta holgada. Debe pasar exactamente lo contrario.
    const m = matrizDividendos({
      ...base,
      rentaDisponible: 99_000_000,
      edad: 70, // 70 + 15 = 85 > 79
    });
    expect(m.flat().every((c) => c.motivo === "plazo_excede_edad")).toBe(true);
    expect(m.flat().some((c) => c.califica)).toBe(false);
  });
});

describe("simular", () => {
  const ingresos: Ingresos = {
    sueldos: PLANILLA.sueldos,
    boletas: PLANILLA.boletas,
    arriendoMensual: PLANILLA.arriendo,
    retirosAnuales: PLANILLA.retirosAnuales,
  };
  const pasivos: Pasivo[] = [
    { tipo: "consumo", deudaTotal: 5_000_000, valorCuota: PLANILLA.cuotaVigente },
  ];

  it("encadena ingresos, pasivos y matriz en un solo resultado", () => {
    const s = simular({
      ingresos,
      pasivos,
      valorPropiedadUF: PLANILLA.valorPropiedadUF,
      tasaAnual: PLANILLA.tasaAnual,
      valorUF: PLANILLA.valorUF,
      anioNacimiento: 1976,
      hoy: new Date("2026-07-29T12:00:00Z"),
    });

    expect(s.ingresos.total).toBeCloseTo(2_466_666.67, 2);
    expect(s.cuotasMensuales).toBe(80_000);
    expect(s.rentaFinal).toBeCloseTo(2_386_666.67, 2);
    expect(s.calificaPorRenta).toBe(true);
    // La planilla ofrecía 30 años a un nacido en 1976 porque fue escrita en 2025
    // (edad 49). En 2026 esa persona tiene 50 y 50+30 supera los 79: le
    // corresponden 25. Ese envejecimiento silencioso es justo lo que la tabla
    // hardcodeada no podía manejar.
    expect(s.plazoMaximo).toBe(25);
    expect(s.mejorEscenario).not.toBeNull();
  });

  it("el mejor escenario es el dividendo más alto entre los que califican", () => {
    const s = simular({
      ingresos,
      pasivos,
      valorPropiedadUF: PLANILLA.valorPropiedadUF,
      tasaAnual: PLANILLA.tasaAnual,
      valorUF: PLANILLA.valorUF,
    });
    const califican = s.matriz.flat().filter((c) => c.califica);
    const maximo = Math.max(...califican.map((c) => c.dividendo));
    expect(s.mejorEscenario!.dividendo).toBe(maximo);
  });

  it("una persona demasiado mayor no obtiene ningún escenario ni mejor opción", () => {
    const s = simular({
      ingresos: {
        sueldos: [9_000_000],
        boletas: [],
        arriendoMensual: 0,
        retirosAnuales: 0,
      },
      pasivos: [],
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
      anioNacimiento: 1950, // ~76 años en 2026
      hoy: new Date("2026-07-29T12:00:00Z"),
    });
    expect(s.calificaPorRenta).toBe(true); // la renta sí alcanza…
    expect(s.plazoMaximo).toBeNull(); // …pero ningún plazo cabe por edad
    expect(s.mejorEscenario).toBeNull();
  });

  it("no califica bajo la renta mínima y no ofrece escenario", () => {
    const s = simular({
      ingresos: {
        sueldos: [900_000],
        boletas: [],
        arriendoMensual: 0,
        retirosAnuales: 0,
      },
      pasivos: [],
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    });
    expect(s.rentaFinal).toBe(900_000);
    expect(s.calificaPorRenta).toBe(false);
    expect(s.mejorEscenario).toBeNull();
  });

  it("el umbral de renta mínima es inclusivo", () => {
    const justo = simular({
      ingresos: {
        sueldos: [RENTA_MINIMA_CLP],
        boletas: [],
        arriendoMensual: 0,
        retirosAnuales: 0,
      },
      pasivos: [],
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    });
    expect(justo.calificaPorRenta).toBe(true);

    const unPesoMenos = simular({
      ingresos: {
        sueldos: [RENTA_MINIMA_CLP - 1],
        boletas: [],
        arriendoMensual: 0,
        retirosAnuales: 0,
      },
      pasivos: [],
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    });
    expect(unPesoMenos.calificaPorRenta).toBe(false);
  });

  it("sin año de nacimiento no reporta plazo máximo", () => {
    const s = simular({
      ingresos,
      pasivos,
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    });
    expect(s.plazoMaximo).toBeNull();
  });

  it("propaga las advertencias del reconocimiento de ingresos", () => {
    const s = simular({
      ingresos: { ...ingresos, boletas: [500_000] },
      pasivos,
      valorPropiedadUF: 2500,
      tasaAnual: 0.0332,
      valorUF: 41_000,
    });
    expect(s.ingresos.advertencias).toHaveLength(1);
  });
});
