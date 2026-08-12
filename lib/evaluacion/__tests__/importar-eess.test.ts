import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  anioDesdeCelda,
  ArchivoNoEsEESSError,
  HOJA_EESS,
  importarEESS,
  lectorDeHoja,
  mesesDesdeCelda,
  montoDesdeCelda,
  type LectorCeldas,
} from "../importar-eess";

const UF = 39_000;
const HOY = new Date(2026, 7, 12); // 12-08-2026

/** Lector sobre un mapa plano de celdas, con el marcador de plantilla puesto. */
function lector(celdas: Record<string, unknown>): LectorCeldas {
  const conMarcador: Record<string, unknown> = {
    C8: "ESTADO DE SITUACION CLIENTE",
    ...celdas,
  };
  return (coordenada) => conMarcador[coordenada];
}

describe("montoDesdeCelda", () => {
  it("acepta números, texto con miles chilenos y signo $", () => {
    expect(montoDesdeCelda(2_800_000)).toBe(2_800_000);
    expect(montoDesdeCelda("2.800.000")).toBe(2_800_000);
    expect(montoDesdeCelda("$ 1.500.000")).toBe(1_500_000);
  });

  it("devuelve 0 ante vacíos, texto no numérico y negativos", () => {
    expect(montoDesdeCelda(undefined)).toBe(0);
    expect(montoDesdeCelda("Propio")).toBe(0);
    expect(montoDesdeCelda(-5)).toBe(0);
  });

  it("entiende el formato estadounidense en vez de corromperlo", () => {
    expect(montoDesdeCelda("2,800,000.00")).toBe(2_800_000);
    expect(montoDesdeCelda("2,800")).toBe(2_800);
    expect(montoDesdeCelda("2500.5")).toBe(2_501);
  });

  it("redondea siempre: un decimal rompería la máscara de miles del formulario", () => {
    expect(montoDesdeCelda("350.000,5")).toBe(350_001);
    expect(montoDesdeCelda(350_000.5)).toBe(350_001);
    expect(Number.isInteger(montoDesdeCelda("2.800.000,75"))).toBe(true);
  });
});

describe("anioDesdeCelda", () => {
  it("lee Date, serial de Excel, texto dd/mm/aaaa y año suelto", () => {
    expect(anioDesdeCelda(new Date(1985, 4, 12))).toBe(1985);
    // 12-05-1985 como serial de Excel (días desde 1900).
    expect(anioDesdeCelda(31_179)).toBe(1985);
    expect(anioDesdeCelda("12/05/1985")).toBe(1985);
    expect(anioDesdeCelda(1985)).toBe(1985);
  });

  it("un serial de 1 de enero no retrocede al año anterior en zona horaria de Chile", () => {
    // 01/01/1990 = serial 32874. Con getters locales en UTC-4/-3 daba 1989.
    expect(anioDesdeCelda(32_874)).toBe(1990);
  });

  it("devuelve null ante lo ilegible", () => {
    expect(anioDesdeCelda("")).toBeNull();
    expect(anioDesdeCelda(undefined)).toBeNull();
    expect(anioDesdeCelda(123)).toBeNull();
  });
});

describe("mesesDesdeCelda", () => {
  it("calcula la antigüedad desde texto dd/mm/aaaa", () => {
    expect(mesesDesdeCelda("12/08/2020", HOY)).toBe(72);
  });

  it("rechaza fechas futuras y basura", () => {
    expect(mesesDesdeCelda("01/01/2030", HOY)).toBeNull();
    expect(mesesDesdeCelda("indefinido", HOY)).toBeNull();
  });

  it("un serial de primer día de mes no retrocede al mes anterior en Chile", () => {
    // 01/08/2020 = serial 44044: son 72 meses hasta ago-2026, no 73.
    expect(mesesDesdeCelda(44_044, HOY)).toBe(72);
  });
});

describe("lectorDeHoja", () => {
  it("descarta celdas con error de fórmula (#REF!/#VALUE! guardan un código numérico)", () => {
    const hoja = { F46: { t: "e", v: 23 }, G46: { t: "n", v: 250_000 } };
    const celda = lectorDeHoja(hoja);
    expect(celda("F46")).toBeUndefined();
    expect(celda("G46")).toBe(250_000);
    expect(celda("Z99")).toBeUndefined();
  });
});

describe("importarEESS", () => {
  it("rechaza un archivo que no es la ficha (S2)", () => {
    const otro: LectorCeldas = () => undefined;
    expect(() => importarEESS(otro, { valorUF: UF })).toThrow(ArchivoNoEsEESSError);
  });

  it("puebla la ficha completa desde las celdas de la plantilla (S1)", () => {
    const { ficha, avisos } = importarEESS(
      lector({
        D12: "María Pérez Soto",
        D13: "12.345.678-5",
        D15: "12/05/1988",
        D25: "01/03/2019",
        D37: 2_800_000, // sueldo
        D39: 350_000, // arriendos
        G37: 8_000_000, // ahorros
        G38: 4_000_000, // depósito a plazo
        // Vehículo con crédito: valor comercial + cuota.
        F46: 9_000_000,
        G46: 250_000,
        // Crédito de consumo: saldo + cuota.
        E60: 3_000_000,
        F60: 180_000,
      }),
      { valorUF: UF, hoy: HOY },
    );

    expect(ficha.nombre).toBe("María Pérez Soto");
    expect(ficha.rut).toBe("12.345.678-5");
    expect(ficha.anioNacimiento).toBe(1988);
    expect(ficha.antiguedadMeses).toBe(89);
    expect(ficha.fuenteRenta).toBe("sueldo_indefinido");
    expect(ficha.sueldos).toEqual([2_800_000]);
    expect(ficha.boletas).toEqual([]);
    expect(ficha.arriendoMensual).toBe(350_000);
    expect(ficha.pasivos).toEqual([
      { tipo: "consumo", deudaTotal: 0, valorCuota: 250_000 },
      { tipo: "consumo", deudaTotal: 3_000_000, valorCuota: 180_000 },
    ]);
    // Ahorro = componentes sumados (nunca la celda TOTAL, que es fórmula).
    expect(ficha.ahorroDisponible).toBe(12_000_000);
    // Activos = vehículo + instrumentos de ahorro.
    expect(ficha.activosTotales).toBe(21_000_000);
    // Con sueldo, siempre se pide confirmar el tipo de contrato.
    expect(avisos.some((a) => a.includes("indefinido"))).toBe(true);
  });

  it("convierte propiedades de UF a pesos y crea el pasivo hipotecario (S3)", () => {
    const { ficha } = importarEESS(
      lector({
        D15: "1990",
        D37: 3_000_000,
        D52: 3_500, // valor comercial UF
        E52: 2_000, // saldo insoluto UF
        F52: 450_000, // cuota en pesos
      }),
      { valorUF: UF, hoy: HOY },
    );

    expect(ficha.pasivos).toEqual([
      { tipo: "hipotecario", deudaTotal: 2_000 * UF, valorCuota: 450_000 },
    ]);
    expect(ficha.activosTotales).toBe(3_500 * UF);
  });

  it("marca honorarios como fuente y pide más boletas (S4)", () => {
    const { ficha, avisos } = importarEESS(
      lector({ D15: "1992", D38: 1_800_000 }),
      { valorUF: UF, hoy: HOY },
    );

    expect(ficha.fuenteRenta).toBe("honorarios");
    expect(ficha.boletas).toEqual([1_800_000]);
    expect(avisos.some((a) => a.includes("boletas"))).toBe(true);
  });

  it("sueldo + honorarios es mixto, y el aviso describe mixto (no 'indefinido')", () => {
    const { ficha, avisos } = importarEESS(
      lector({ D15: "1992", D37: 2_000_000, D38: 900_000 }),
      { valorUF: UF, hoy: HOY },
    );
    expect(ficha.fuenteRenta).toBe("mixto");
    expect(avisos.some((a) => a.includes("mixto"))).toBe(true);
    expect(avisos.some((a) => a.includes("indefinido"))).toBe(false);
  });

  it("un RUT inválido no se importa (bloquearía todo el análisis) y se avisa", () => {
    const { ficha, avisos } = importarEESS(
      lector({ D13: "12.345.678-0", D15: "1990", D37: 2_000_000 }),
      { valorUF: UF, hoy: HOY },
    );
    expect(ficha.rut).toBe("");
    expect(avisos.some((a) => a.includes("RUT"))).toBe(true);
  });

  it("un RUT que Excel convirtió a número se importa formateado", () => {
    const { ficha } = importarEESS(
      lector({ D13: 123456785, D15: "1990", D37: 2_000_000 }),
      { valorUF: UF, hoy: HOY },
    );
    expect(ficha.rut).toBe("12.345.678-5");
  });

  it("si hay más de 20 deudas se conservan 20 y se avisa (nunca se botan en silencio)", () => {
    const celdas: Record<string, unknown> = { D15: "1990", D37: 2_500_000 };
    for (let f = 46; f <= 49; f++) celdas[`G${f}`] = 100_000; // 4 vehículos
    for (let f = 52; f <= 57; f++) celdas[`E${f}`] = 500; // 6 hipotecarios (UF)
    for (let f = 60; f <= 65; f++) celdas[`F${f}`] = 90_000; // 6 consumo
    for (let f = 68; f <= 71; f++) {
      celdas[`E${f}`] = 200_000; // 4 tarjetas
      celdas[`J${f}`] = 150_000; // 4 líneas
    }
    const { ficha, avisos } = importarEESS(lector(celdas), { valorUF: UF, hoy: HOY });
    expect(ficha.pasivos).toHaveLength(20);
    expect(avisos.some((a) => a.includes("24 deudas"))).toBe(true);
  });

  it("tarjetas y líneas con saldo entran como rotativos sin cuota, con aviso", () => {
    const { ficha, avisos } = importarEESS(
      lector({
        D15: "1990",
        D37: 2_500_000,
        E68: 1_200_000, // tarjeta: monto utilizado
        J69: 800_000, // línea: monto utilizado
      }),
      { valorUF: UF, hoy: HOY },
    );

    expect(ficha.pasivos).toEqual([
      { tipo: "rotativo", deudaTotal: 1_200_000, valorCuota: 0 },
      { tipo: "rotativo", deudaTotal: 800_000, valorCuota: 0 },
    ]);
    expect(avisos.some((a) => a.includes("cuota mensual"))).toBe(true);
  });

  it("ignora los bancos pre-tipeados sin monto (FALABELLA, SANTANDER)", () => {
    const { ficha } = importarEESS(
      lector({ D15: "1990", D37: 2_500_000, C68: "FALABELLA", C69: "SANTANDER " }),
      { valorUF: UF, hoy: HOY },
    );
    expect(ficha.pasivos).toEqual([]);
  });

  it("importa retiros tal cual y pide confirmar que sean anuales", () => {
    const { ficha, avisos } = importarEESS(
      lector({ D15: "1990", D40: 6_000_000 }),
      { valorUF: UF, hoy: HOY },
    );
    expect(ficha.retirosAnuales).toBe(6_000_000);
    expect(avisos.some((a) => a.includes("ANUAL"))).toBe(true);
  });

  it("fecha de nacimiento ilegible deja el año VACÍO (bloquea el análisis), no un default ficticio", () => {
    const { ficha, avisos } = importarEESS(lector({ D37: 2_000_000 }), {
      valorUF: UF,
      hoy: HOY,
    });
    // 0 = campo vacío en el formulario; la validación exige completarlo antes
    // de analizar, en vez de correr la evaluación con una edad inventada.
    expect(ficha.anioNacimiento).toBe(0);
    expect(ficha.antiguedadMeses).toBe(0);
    expect(avisos.some((a) => a.includes("nacimiento"))).toBe(true);
    expect(avisos.some((a) => a.includes("antigüedad"))).toBe(true);
  });

  it("extrae desde un workbook real de xlsx (integración con SheetJS)", () => {
    const hoja = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_aoa(hoja, [["ESTADO DE SITUACION CLIENTE"]], { origin: "C8" });
    XLSX.utils.sheet_add_aoa(hoja, [["Juan Díaz"]], { origin: "D12" });
    XLSX.utils.sheet_add_aoa(hoja, [["15/06/1985"]], { origin: "D15" });
    XLSX.utils.sheet_add_aoa(hoja, [[2_600_000]], { origin: "D37" });
    XLSX.utils.sheet_add_aoa(hoja, [[5_000_000]], { origin: "G37" });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, HOJA_EESS);

    // El mismo camino que recorre el componente: write → read → lector de celdas.
    const buffer = XLSX.write(libro, { type: "array", bookType: "xlsx" });
    const releido = XLSX.read(buffer, { type: "array", cellDates: true });
    const ws = releido.Sheets[HOJA_EESS];

    const { ficha } = importarEESS((c) => ws[c]?.v, { valorUF: UF, hoy: HOY });
    expect(ficha.nombre).toBe("Juan Díaz");
    expect(ficha.anioNacimiento).toBe(1985);
    expect(ficha.sueldos).toEqual([2_600_000]);
    expect(ficha.ahorroDisponible).toBe(5_000_000);
  });
});
