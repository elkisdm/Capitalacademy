"use client";

import { cn } from "@/lib/utils/cn";
import type { Celda } from "@/lib/credito/calculo";
import { formatCLP } from "@/lib/utils/money";

type Props = {
  matriz: Celda[][];
  plazoMaximo: number | null;
  /**
   * Celda a destacar (pie + plazo). La usa la Evaluación Financiera para
   * conectar la matriz con el escenario del análisis; la calculadora pública
   * no la pasa y se ve igual que siempre.
   */
  resaltar?: { pie: number; plazoAnios: number };
  /**
   * Renta con la que se calificó. Cuando está, las celdas que no alcanzan
   * dicen cuánto FALTA de renta ("Te faltan $X de renta") en vez de la cifra
   * absoluta, que se leía como dinero a aportar. La pública no la pasa.
   */
  rentaDisponible?: number;
};

const porcentaje = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Matriz de escenarios: filas por plazo, columnas por pie.
 *
 * Corrige el punto ciego de la planilla original, donde convivían la tabla de
 * dividendos y la de renta requerida y era el usuario quien comparaba a ojo.
 * Acá cada celda ya viene resuelta como califica / no califica.
 */
export function MatrizDividendos({ matriz, plazoMaximo, resaltar, rentaDisponible }: Props) {
  const pies = matriz[0]?.map((c) => c.pie) ?? [];
  // El legend de edad se muestra si ALGUNA celda está bloqueada por edad, no
  // según `plazoMaximo`: cuando la edad excede todos los plazos, `plazoMaximo`
  // es null pero igual hay celdas ámbar que explicar.
  const hayBloqueoPorEdad = matriz
    .flat()
    .some((c) => c.motivo === "plazo_excede_edad");

  return (
    <div>
      {/* La tabla scrollea dentro de su contenedor: en móvil el body nunca
          scrollea en horizontal (convención §6 del overlay). Es enfocable y con
          rol de región para que el teclado también pueda desplazarla (WCAG 2.1.1). */}
      <div
        className="-mx-1 overflow-x-auto px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
        tabIndex={0}
        role="region"
        aria-label="Tabla de dividendos por pie y plazo (se desplaza horizontalmente)"
      >
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-left">
          <caption className="sr-only">
            Dividendo mensual estimado según pie y plazo, con el detalle de si
            tu renta alcanza en cada escenario.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-24 px-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
                Plazo
              </th>
              {pies.map((pie) => (
                <th
                  key={pie}
                  scope="col"
                  className="px-2 pb-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft"
                >
                  Pie {porcentaje(pie)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.map((fila) => (
              <tr key={fila[0]!.plazoAnios}>
                <th
                  scope="row"
                  className="rounded-xl bg-ca-bg-soft px-3 py-3 text-sm font-bold text-ca-ink"
                >
                  {fila[0]!.plazoAnios} años
                </th>
                {fila.map((celda) => (
                  <td key={`${celda.plazoAnios}-${celda.pie}`} className="p-0">
                    <CeldaEscenario
                      celda={celda}
                      rentaDisponible={rentaDisponible}
                      resaltada={
                        resaltar !== undefined &&
                        Math.abs(celda.pie - resaltar.pie) < 1e-9 &&
                        celda.plazoAnios === resaltar.plazoAnios
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ca-ink-soft">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full bg-ca-lime" />
          Tu renta alcanza
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full bg-ca-outline-strong" />
          Tu renta no alcanza
        </li>
        {hayBloqueoPorEdad && (
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 rounded-full bg-ca-amber" />
            {plazoMaximo !== null
              ? `Supera el plazo máximo para tu edad (${plazoMaximo} años)`
              : "Tu edad supera el plazo máximo del banco"}
          </li>
        )}
        {resaltar && (
          <li className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border-2 border-ca-violet bg-ca-surface"
            />
            Escenario del análisis
          </li>
        )}
      </ul>
    </div>
  );
}

function CeldaEscenario({
  celda,
  resaltada = false,
  rentaDisponible,
}: {
  celda: Celda;
  resaltada?: boolean;
  rentaDisponible?: number;
}) {
  const bloqueadaPorEdad = celda.motivo === "plazo_excede_edad";

  // Con la renta a mano, la celda dice cuánto FALTA — "Necesitas $4.011.946" se
  // leía como dinero a aportar, cuando es la renta que exige ese escenario.
  const estado = bloqueadaPorEdad
    ? "No disponible por edad"
    : celda.califica
      ? "Tu renta alcanza"
      : rentaDisponible !== undefined
        ? `Faltan ${formatCLP(celda.rentaRequerida - rentaDisponible)} de renta`
        : `Necesitas ${formatCLP(celda.rentaRequerida)}`;

  return (
    <div
      className={cn(
        "h-full rounded-xl border px-3 py-3 text-center transition-colors",
        celda.califica &&
          "border-ca-lime-deep/40 bg-ca-lime-mist text-ca-ink",
        !celda.califica &&
          !bloqueadaPorEdad &&
          "border-ca-outline bg-ca-surface text-ca-ink-soft",
        bloqueadaPorEdad && "border-ca-amber/30 bg-ca-amber/5 text-ca-ink-soft",
        resaltada && "ring-2 ring-ca-violet/50",
      )}
    >
      <p
        className={cn(
          "text-base font-black tabular-nums sm:text-lg",
          bloqueadaPorEdad && "line-through opacity-60",
        )}
      >
        {formatCLP(celda.dividendo)}
      </p>
      <p
        className={cn(
          "mt-1 text-[11px] leading-tight",
          celda.califica ? "font-semibold text-ca-lime-text" : "text-ca-ink-soft",
          bloqueadaPorEdad && "text-ca-amber-text",
        )}
      >
        {estado}
      </p>
    </div>
  );
}
