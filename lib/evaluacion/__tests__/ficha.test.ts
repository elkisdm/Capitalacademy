import { describe, it, expect } from "vitest";
import {
  fichaSchema,
  fichaVacia,
  patrimonioNeto,
  saldoHipotecarioVigente,
  type Ficha,
} from "@/lib/evaluacion/ficha";

const VALIDA = {
  nombre: "Ana Pérez",
  anioNacimiento: 1988,
  fuenteRenta: "sueldo_indefinido" as const,
  antiguedadMeses: 36,
  sueldos: [1_500_000, 1_500_000, 1_500_000],
};

describe("fichaSchema", () => {
  it("acepta lo mínimo y rellena el resto con ceros", () => {
    const r = fichaSchema.safeParse(VALIDA);

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pasivos).toEqual([]);
      expect(r.data.ahorroDisponible).toBe(0);
      expect(r.data.rut).toBe("");
    }
  });

  it("exige nombre", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, nombre: "  " }).success).toBe(false);
  });

  it("el RUT es opcional pero si viene debe ser válido", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, rut: "" }).success).toBe(true);
    // 11.111.111-1 es un RUT VÁLIDO (su dígito verificador es 1); el inválido
    // es el mismo cuerpo con otro dígito.
    expect(fichaSchema.safeParse({ ...VALIDA, rut: "11.111.111-1" }).success).toBe(true);
    expect(fichaSchema.safeParse({ ...VALIDA, rut: "11.111.111-2" }).success).toBe(false);
    expect(fichaSchema.safeParse({ ...VALIDA, rut: "no-es-un-rut" }).success).toBe(false);
  });

  // Un año de dos dígitos o invertido produce una edad absurda, y con ella un
  // plazo absurdo que se traduce en un tope de propiedad inventado.
  it("rechaza años de nacimiento imposibles", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, anioNacimiento: 88 }).success).toBe(false);
    expect(fichaSchema.safeParse({ ...VALIDA, anioNacimiento: 1900 }).success).toBe(false);
  });

  it("exige mayoría de edad", () => {
    const esteAnio = new Date().getFullYear();
    expect(fichaSchema.safeParse({ ...VALIDA, anioNacimiento: esteAnio - 17 }).success).toBe(false);
    expect(fichaSchema.safeParse({ ...VALIDA, anioNacimiento: esteAnio - 18 }).success).toBe(true);
  });

  it("rechaza montos negativos", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, ahorroDisponible: -1 }).success).toBe(false);
    expect(fichaSchema.safeParse({ ...VALIDA, sueldos: [-500] }).success).toBe(false);
  });

  it("exige una fuente de renta conocida", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, fuenteRenta: "herencia" }).success).toBe(false);
  });

  it("rechaza una antigüedad fuera de rango", () => {
    expect(fichaSchema.safeParse({ ...VALIDA, antiguedadMeses: -1 }).success).toBe(false);
    expect(fichaSchema.safeParse({ ...VALIDA, antiguedadMeses: 900 }).success).toBe(false);
  });

  it("valida el tipo de cada pasivo", () => {
    const ok = fichaSchema.safeParse({
      ...VALIDA,
      pasivos: [{ tipo: "hipotecario", deudaTotal: 1_000, valorCuota: 10 }],
    });
    const malo = fichaSchema.safeParse({ ...VALIDA, pasivos: [{ tipo: "leasing" }] });

    expect(ok.success).toBe(true);
    expect(malo.success).toBe(false);
  });

  it("la ficha vacía es una base válida para el formulario", () => {
    const r = fichaSchema.safeParse({ ...fichaVacia(), nombre: "X" });
    expect(r.success).toBe(true);
  });
});

describe("saldoHipotecarioVigente", () => {
  const con = (pasivos: Ficha["pasivos"]): Ficha => ({ ...fichaVacia(), pasivos });

  it("suma solo los hipotecarios", () => {
    const f = con([
      { tipo: "hipotecario", deudaTotal: 40_000_000, valorCuota: 300_000 },
      { tipo: "consumo", deudaTotal: 5_000_000, valorCuota: 150_000 },
      { tipo: "rotativo", deudaTotal: 1_000_000, valorCuota: 50_000 },
    ]);

    expect(saldoHipotecarioVigente(f)).toBe(40_000_000);
  });

  it("sin hipotecarios es cero", () => {
    expect(saldoHipotecarioVigente(con([{ tipo: "consumo", deudaTotal: 9, valorCuota: 1 }]))).toBe(0);
  });
});

describe("patrimonioNeto", () => {
  it("resta TODAS las deudas de los activos", () => {
    const f: Ficha = {
      ...fichaVacia(),
      activosTotales: 100_000_000,
      pasivos: [
        { tipo: "hipotecario", deudaTotal: 40_000_000, valorCuota: 300_000 },
        { tipo: "consumo", deudaTotal: 5_000_000, valorCuota: 150_000 },
      ],
    };

    expect(patrimonioNeto(f)).toBe(55_000_000);
  });

  it("puede ser negativo, y eso es información, no un error", () => {
    const f: Ficha = {
      ...fichaVacia(),
      activosTotales: 1_000_000,
      pasivos: [{ tipo: "consumo", deudaTotal: 9_000_000, valorCuota: 200_000 }],
    };

    expect(patrimonioNeto(f)).toBe(-8_000_000);
  });
});
