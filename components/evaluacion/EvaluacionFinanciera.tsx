"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MatrizDividendos } from "@/components/calculadora/MatrizDividendos";
import { FichaEstadoSituacion } from "./FichaEstadoSituacion";
import { ImportarFicha } from "./ImportarFicha";
import { ResultadoEvaluacion } from "./ResultadoEvaluacion";
import { formatUF } from "@/lib/utils/money";
import { TASA_ANUAL_DEFAULT } from "@/lib/credito/constants";
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
  const [analizando, setAnalizando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [avisosImport, setAvisosImport] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultadoRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

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
    setEvaluacion(null);
    setAnalizando(true);

    // El cálculo es instantáneo; la pausa breve le da peso al resultado y deja
    // ver el skeleton en vez de un cambio brusco de pantalla.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setEvaluacion(evaluarFicha(parsed.data, { valorUF: valorUF.valor }));
      setAnalizando(false);
      // En móvil el resultado queda bajo el formulario: llevar la vista hasta él.
      if (window.innerWidth < 1024) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        resultadoRef.current?.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      }
    }, 750);
  }

  function limpiar() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFicha(fichaVacia());
    setEvaluacion(null);
    setAnalizando(false);
    setErrores([]);
    setAvisosImport([]);
  }

  // La ficha importada REEMPLAZA lo que hubiera: es el inicio del llenado, no
  // un merge. Cualquier análisis previo deja de corresponder a los datos —
  // incluido uno EN VUELO: sin cancelar el timer, el resultado del cliente
  // anterior aterrizaría sobre la ficha recién importada.
  function aplicarImport({ ficha: importada, avisos }: ImporteEESS) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAnalizando(false);
    setFicha(importada);
    setEvaluacion(null);
    setErrores([]);
    setAvisosImport(avisos);
  }

  return (
    <div className="space-y-8">
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
          <Button size="lg" onClick={analizar} disabled={!hayIngresos || analizando}>
            {analizando ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Analizando…
              </>
            ) : (
              <>
                <Calculator size={16} /> Analizar capacidad de compra
              </>
            )}
          </Button>
          <Button variant="ghost" size="lg" onClick={limpiar} disabled={analizando}>
            <RotateCcw size={15} /> Limpiar
          </Button>
        </div>

        {!hayIngresos && (
          <p className="mt-2 text-[12px] text-ca-ink-soft">
            Agrega al menos una fuente de ingreso para poder analizar.
          </p>
        )}
      </div>

      <aside ref={resultadoRef} className="scroll-mt-6 lg:sticky lg:top-6">
        {analizando ? (
          <SkeletonResultado />
        ) : evaluacion ? (
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

    {/* La parte de la calculadora pública, fusionada acá: los escenarios de
        dividendo sobre el valor máximo que arrojó la evaluación. A lo ancho,
        porque la matriz 4×4 no cabe en la columna del resultado. */}
    {evaluacion?.califica && (
      <section className="ca-card ca-fade-up p-5 sm:p-7" style={{ animationDelay: "180ms" }}>
        <header className="mb-5">
          <h2 className="text-[17px] font-black tracking-tight text-ca-ink">
            Escenarios de dividendo
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">
            Sobre el valor máximo estimado de{" "}
            {formatUF(Math.floor(evaluacion.capacidad.valorMaximoPropiedadUF))}, con una
            tasa referencial de{" "}
            {(TASA_ANUAL_DEFAULT * 100).toLocaleString("es-CL", {
              maximumFractionDigits: 2,
            })}
            % anual y la renta final del cliente.
          </p>
        </header>
        <MatrizDividendos
          matriz={evaluacion.escenarios}
          plazoMaximo={evaluacion.capacidad.plazoAnios}
          resaltar={{
            pie: 1 - evaluacion.capacidad.financiamiento,
            plazoAnios: evaluacion.capacidad.plazoAnios,
          }}
        />
      </section>
    )}
    </div>
  );
}

/**
 * Skeleton fiel al layout del resultado (§4.1 de las convenciones): titular,
 * franja de perfil y grilla de cifras, para que el contenido no salte al llegar.
 */
function SkeletonResultado() {
  return (
    <div role="status" aria-label="Analizando la ficha" className="space-y-5">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[86px]" />
        ))}
      </div>
      <Skeleton className="h-14" />
    </div>
  );
}
