import { describe, it, expect } from "vitest";
import { evaluarFicha } from "@/lib/evaluacion/evaluar";
import { fichaVacia, type Ficha } from "@/lib/evaluacion/ficha";

const UF = 39_000;
const HOY = new Date("2026-08-10T12:00:00-04:00");
const OPC = { valorUF: UF, hoy: HOY };

/** El caso del escenario E1 de la spec. */
const SOLVENTE: Ficha = {
  ...fichaVacia(),
  nombre: "Ana Pérez",
  anioNacimiento: 1988, // 38 años
  fuenteRenta: "sueldo_indefinido",
  antiguedadMeses: 48,
  sueldos: [2_800_000, 2_800_000, 2_800_000],
  activosTotales: 50_000_000,
  ahorroDisponible: 35_100_000, // 900 UF
};

describe("evaluarFicha — el caso que da sentido a la herramienta (E1)", () => {
  const r = evaluarFicha(SOLVENTE, OPC);

  it("califica y entrega un tope en UF", () => {
    expect(r.califica).toBe(true);
    if (!r.califica) return;

    expect(r.capacidad.valorMaximoPropiedadUF).toBeGreaterThan(0);
    expect(r.perfil.color).toBe("verde");
    expect(r.edad).toBe(38);
  });

  it("las cifras que se muestran juntas cuadran entre sí", () => {
    if (!r.califica) throw new Error("debía calificar");

    const valorCLP = r.capacidad.valorMaximoPropiedadUF * UF;
    expect(r.capacidad.creditoMaximoCLP + r.capacidad.pieRequeridoCLP).toBeCloseTo(valorCLP, 2);
  });

  it("trae la palanca que de verdad mueve la cifra", () => {
    if (!r.califica) throw new Error("debía calificar");
    expect(r.palanca).toBeTruthy();
  });

  // Fusión con la calculadora pública: los escenarios de dividendo salen del
  // mismo análisis, sobre el valor máximo estimado.
  it("trae la matriz de escenarios (plazos × pies)", () => {
    if (!r.califica) throw new Error("debía calificar");

    expect(r.escenarios).toHaveLength(4);
    for (const fila of r.escenarios) expect(fila).toHaveLength(4);
  });

  it("la celda del perfil coincide con el dividendo estimado de la tarjeta", () => {
    if (!r.califica) throw new Error("debía calificar");

    const pieDelPerfil = 1 - r.capacidad.financiamiento;
    const celda = r.escenarios
      .flat()
      .find(
        (c) =>
          Math.abs(c.pie - pieDelPerfil) < 1e-9 &&
          c.plazoAnios === r.capacidad.plazoAnios,
      );

    expect(celda).toBeDefined();
    expect(celda!.dividendo).toBeCloseTo(r.capacidad.dividendoEstimadoCLP, 4);
    expect(celda!.califica).toBe(true);
  });

  // La coherencia que motivó el parámetro `carga`: SOLVENTE tiene renta sobre
  // $2,5M, así que las celdas deben calificar con la carga del 30%, no con el
  // 25% fijo de la calculadora pública.
  it("las celdas califican con la carga escalonada del motor", () => {
    if (!r.califica) throw new Error("debía calificar");

    const pieDelPerfil = 1 - r.capacidad.financiamiento;
    const celda = r.escenarios
      .flat()
      .find(
        (c) =>
          Math.abs(c.pie - pieDelPerfil) < 1e-9 &&
          c.plazoAnios === r.capacidad.plazoAnios,
      )!;

    // Con el 25% fijo esta celda NO calificaría cuando manda la capacidad de
    // pago; con la carga real de la renta, sí.
    expect(celda.rentaRequerida).toBeLessThanOrEqual(r.rentaFinal + 1);
  });
});

describe("evaluarFicha — no califica", () => {
  // E6: sin tope de propiedad, para no ilusionar con una cifra que no existe.
  it("con renta bajo el mínimo explica qué falta y no muestra ningún tope", () => {
    const r = evaluarFicha({ ...SOLVENTE, sueldos: [900_000] }, OPC);

    expect(r.califica).toBe(false);
    if (r.califica) return;

    expect(r.motivo).toBe("renta_insuficiente");
    expect(r.explicacion).toContain("$");
    expect(r).not.toHaveProperty("capacidad");
  });

  it("igual muestra de qué renta se parte, que es lo que el asesor necesita", () => {
    const r = evaluarFicha({ ...SOLVENTE, sueldos: [900_000] }, OPC);

    if (r.califica) return;
    expect(r.ingresoReconocido).toBe(900_000);
    expect(r.rentaFinal).toBe(900_000);
  });

  // E5 llevado al extremo: a cierta edad ningún plazo cabe antes del tope.
  it("una edad sin plazo posible se explica, no revienta", () => {
    const r = evaluarFicha({ ...SOLVENTE, anioNacimiento: 1960 }, OPC); // 66 años

    expect(r.califica).toBe(false);
    if (r.califica) return;
    expect(r.motivo).toBe("edad_sin_plazo");
    expect(r.explicacion).toContain("66");
  });
});

describe("evaluarFicha — la cadena completa respeta cada regla", () => {
  it("las cuotas vigentes bajan la renta final y con ella el tope", () => {
    const sin = evaluarFicha(SOLVENTE, OPC);
    const con = evaluarFicha(
      {
        ...SOLVENTE,
        pasivos: [{ tipo: "consumo", deudaTotal: 5_000_000, valorCuota: 400_000 }],
      },
      OPC,
    );

    if (!sin.califica || !con.califica) throw new Error("ambos debían calificar");
    expect(con.rentaFinal).toBe(sin.rentaFinal - 400_000);
    expect(con.capacidad.valorMaximoPropiedadUF).toBeLessThan(
      sin.capacidad.valorMaximoPropiedadUF,
    );
  });

  // E4: el hipotecario vigente descuenta del tope de 60× renta.
  it("un hipotecario vigente baja el tope aunque su cuota sea la misma", () => {
    const consumo = evaluarFicha(
      { ...SOLVENTE, pasivos: [{ tipo: "consumo", deudaTotal: 60_000_000, valorCuota: 300_000 }] },
      OPC,
    );
    const hipotecario = evaluarFicha(
      { ...SOLVENTE, pasivos: [{ tipo: "hipotecario", deudaTotal: 60_000_000, valorCuota: 300_000 }] },
      OPC,
    );

    if (!consumo.califica || !hipotecario.califica) throw new Error("ambos debían calificar");
    expect(hipotecario.capacidad.valorMaximoPropiedadUF).toBeLessThan(
      consumo.capacidad.valorMaximoPropiedadUF,
    );
  });

  // E3 (enmienda 2026-08-12): el ahorro no limita el titular; el pie se informa
  // como brecha para que el asesor lo diga en la misma frase.
  it("con poco ahorro el titular no cambia y la brecha dice cuánto falta", () => {
    const con = evaluarFicha(SOLVENTE, OPC);
    const poco = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 6_000_000 }, OPC);

    if (!con.califica || !poco.califica) throw new Error("ambos debían calificar");
    expect(poco.capacidad.valorMaximoPropiedadUF).toBeCloseTo(
      con.capacidad.valorMaximoPropiedadUF,
      6,
    );
    expect(poco.capacidad.brechaPieCLP).toBeCloseTo(
      poco.capacidad.pieRequeridoCLP - 6_000_000,
      2,
    );
  });

  // El caso que motivó la enmienda: ahorro $0 con renta que califica.
  it("sin ahorro igual hay titular, y la brecha es el pie completo", () => {
    const r = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 0 }, OPC);

    if (!r.califica) throw new Error("debía calificar");
    expect(r.capacidad.valorMaximoPropiedadUF).toBeGreaterThan(0);
    expect(r.capacidad.brechaPieCLP).toBeCloseTo(r.capacidad.pieRequeridoCLP, 2);
  });

  // La palanca solo habla de lo que mueve el titular, y el pie ya no lo mueve.
  it("la palanca avisa que más pie no mueve la cifra", () => {
    const r = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 400_000_000 }, OPC);

    if (!r.califica) throw new Error("debía calificar");
    expect(r.capacidad.brechaPieCLP).toBe(0);
    expect(r.palanca).toContain("Más pie no la cambia");
  });

  it("las boletas insuficientes se advierten en vez de contarse", () => {
    const r = evaluarFicha({ ...SOLVENTE, boletas: [500_000, 500_000] }, OPC);

    if (!r.califica) throw new Error("debía calificar");
    expect(r.advertencias.length).toBeGreaterThan(0);
    // Solo los sueldos: las 2 boletas no alcanzan el mínimo de 3.
    expect(r.ingresoReconocido).toBe(2_800_000);
  });

  it("un perfil más débil financia menos y exige más pie", () => {
    const solido = evaluarFicha(SOLVENTE, OPC);
    const debil = evaluarFicha(
      { ...SOLVENTE, fuenteRenta: "honorarios", antiguedadMeses: 6, activosTotales: 0 },
      OPC,
    );

    if (!solido.califica || !debil.califica) throw new Error("ambos debían calificar");
    expect(debil.perfil.color).not.toBe("verde");
    expect(debil.capacidad.financiamiento).toBeLessThan(solido.capacidad.financiamiento);
  });

  // E5: la edad manda sobre el plazo, y el plazo sobre el tope.
  it("un cliente mayor recibe un plazo menor y un tope menor", () => {
    const joven = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 400_000_000 }, OPC);
    const mayor = evaluarFicha(
      { ...SOLVENTE, anioNacimiento: 1966, ahorroDisponible: 400_000_000 },
      OPC,
    );

    if (!joven.califica || !mayor.califica) throw new Error("ambos debían calificar");
    expect(mayor.capacidad.plazoAnios).toBeLessThan(joven.capacidad.plazoAnios);
    expect(mayor.capacidad.valorMaximoPropiedadUF).toBeLessThan(
      joven.capacidad.valorMaximoPropiedadUF,
    );
  });

  it("el dividendo estimado nunca supera la carga permitida de la renta", () => {
    const r = evaluarFicha(SOLVENTE, OPC);

    if (!r.califica) throw new Error("debía calificar");
    // Renta 2.8M ≥ 2.5M → carga 30%.
    expect(r.capacidad.dividendoEstimadoCLP).toBeLessThanOrEqual(r.rentaFinal * 0.3 + 1);
  });
});
