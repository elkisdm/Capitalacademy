"use client";

import { useMemo, useState } from "react";
import { Calculator, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FichaEstadoSituacion } from "./FichaEstadoSituacion";
import { ImportarFicha } from "./ImportarFicha";
import { ResultadoEvaluacion } from "./ResultadoEvaluacion";
import { fichaSchema, fichaVacia, type Ficha } from "@/lib/evaluacion/ficha";
import { evaluarFicha, type Evaluacion } from "@/lib/evaluacion/evaluar";
import type { ImporteEESS } from "@/lib/evaluacion/importar-eess";
import type { ValorUF } from "@/lib/indicadores/uf";

type Props = { valorUF: ValorUF };

/**
 * Motor de Evaluación Financiera (ADR-0032).
 *
 * Todo el cálculo corre en el navegador: las fórmulas no son secretas y el
 * resultado tiene que ser instantáneo, porque esto se usa con el cliente en
 * frente. El único dato del servidor es el valor de la UF.
 *
 * La ficha NO se envía a ningún lado ni se guarda (decisión 1 del ADR-0032).
 */
export function EvaluacionFinanciera({ valorUF }: Props) {
  const [ficha, setFicha] = useState<Ficha>(fichaVacia);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [avisosImport, setAvisosImport] = useState<string[]>([]);

  // El botón se habilita solo cuando hay lo mínimo para calcular algo honesto:
  // sin ingresos no hay renta, y sin renta cualquier cifra sería inventada.
  const hayIngresos = useMemo(() => {
    const suma = [...ficha.sueldos, ...ficha.boletas].reduce((a, b) => a + b, 0);
    return suma + ficha.arriendoMensual + ficha.retirosAnuales > 0;
  }, [ficha]);

  function analizar() {
    const parsed = fichaSchema.safeParse(ficha);
    if (!parsed.success) {
      setErrores(parsed.error.issues.map((i) => i.message));
      setEvaluacion(null);
      return;
    }
    setErrores([]);
    setEvaluacion(evaluarFicha(parsed.data, { valorUF: valorUF.valor }));
  }

  function limpiar() {
    setFicha(fichaVacia());
    setEvaluacion(null);
    setErrores([]);
    setAvisosImport([]);
  }

  // La ficha importada REEMPLAZA lo que hubiera: es el inicio del llenado, no
  // un merge. Cualquier análisis previo deja de corresponder a los datos.
  function aplicarImport({ ficha: importada, avisos }: ImporteEESS) {
    setFicha(importada);
    setEvaluacion(null);
    setErrores([]);
    setAvisosImport(avisos);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      <div className="ca-card p-5 sm:p-7">
        <header className="mb-6">
          <h2 className="text-[17px] font-black tracking-tight text-ca-ink">
            Ficha de Estado de Situación
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
            Completa la ficha junto al cliente. Al terminar, la plataforma estima hasta qué
            valor de propiedad puede evaluar hoy.
          </p>
        </header>

        <div className="mb-6">
          <ImportarFicha valorUF={valorUF.valor} onImport={aplicarImport} />
          {avisosImport.length > 0 && (
            <ul
              role="status"
              className="mt-3 space-y-1 rounded-xl bg-ca-amber/10 px-4 py-3"
            >
              <li className="text-[12px] font-bold text-ca-amber-text">
                Ficha importada — revisa estos puntos antes de analizar:
              </li>
              {avisosImport.map((a) => (
                <li key={a} className="text-[12px] text-ca-amber-text">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>

        <FichaEstadoSituacion ficha={ficha} onChange={setFicha} />

        {errores.length > 0 && (
          <ul className="mt-6 space-y-1 rounded-xl bg-ca-rose/10 px-4 py-3">
            {errores.map((e) => (
              <li key={e} className="text-[12px] text-ca-rose-text">
                {e}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7 flex flex-wrap gap-2">
          <Button size="lg" onClick={analizar} disabled={!hayIngresos}>
            <Calculator size={16} /> Analizar capacidad de compra
          </Button>
          <Button variant="ghost" size="lg" onClick={limpiar}>
            <RotateCcw size={15} /> Limpiar
          </Button>
        </div>

        {!hayIngresos && (
          <p className="mt-2 text-[12px] text-ca-ink-soft">
            Agrega al menos una fuente de ingreso para poder analizar.
          </p>
        )}
      </div>

      <aside className="lg:sticky lg:top-6">
        {evaluacion ? (
          <ResultadoEvaluacion evaluacion={evaluacion} />
        ) : (
          <div className="ca-card p-6 text-center">
            <Calculator size={26} className="mx-auto mb-3 text-ca-ink-soft" />
            <p className="text-[14px] font-bold text-ca-ink">Aún no hay análisis</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
              Completa la ficha y presiona “Analizar capacidad de compra”.
            </p>
            <p className="mt-4 text-[11px] text-ca-ink-soft">
              UF de hoy: ${valorUF.valor.toLocaleString("es-CL")}
            </p>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ca-ink-soft">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Los datos del cliente no se guardan: quedan solo en esta pantalla y desaparecen al
          cerrarla.
        </p>
      </aside>
    </div>
  );
}
