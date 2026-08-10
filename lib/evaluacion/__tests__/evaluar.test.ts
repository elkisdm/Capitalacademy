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

  // E3: el ahorro es un tope real, no un dato de contexto.
  it("con poco ahorro el tope lo pone el pie y la palanca lo dice", () => {
    const r = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 6_000_000 }, OPC);

    if (!r.califica) throw new Error("debía calificar");
    expect(r.capacidad.limitadoPor).toBe("ahorro_disponible");
    expect(r.palanca).toContain("pie");
  });

  // La contracara: cuando el pie no es el límite, la herramienta lo dice
  // explícitamente en vez de recomendar algo que no cambiaría nada.
  it("cuando el pie no limita, la palanca avisa que más pie no mueve la cifra", () => {
    const r = evaluarFicha({ ...SOLVENTE, ahorroDisponible: 400_000_000 }, OPC);

    if (!r.califica) throw new Error("debía calificar");
    expect(r.capacidad.limitadoPor).not.toBe("ahorro_disponible");
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
