"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Loader2, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FichaEstadoSituacion } from "./FichaEstadoSituacion";
import { ImportarFicha } from "./ImportarFicha";
import { ResultadoEvaluacion } from "./ResultadoEvaluacion";
import { formatCLP } from "@/lib/utils/money";
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
 *
 * Dos vistas: mientras se llena la ficha, formulario + columna de resultado.
 * Con el análisis listo, la ficha se COLAPSA a una barra y el resultado toma
 * toda la pantalla — el resumen a la izquierda y los escenarios de dividendo a
 * la derecha, sin scroll. "Editar ficha" vuelve a la primera vista.
 */
export function EvaluacionFinanciera({ valorUF }: Props) {
  const [ficha, setFicha] = useState<Ficha>(fichaVacia);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [editando, setEditando] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [avisosImport, setAvisosImport] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultadoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const vistaResultado = evaluacion !== null && !editando;

  // El scroll corre DESPUÉS de que la vista de resultado monta: dispararlo en el
  // mismo tick del cambio de estado deja al navegador anclado a la posición del
  // formulario largo que acaba de desaparecer.
  useEffect(() => {
    if (!vistaResultado) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultadoRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [vistaResultado]);

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
      setEditando(false);
    }, 750);
  }

  function limpiar() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFicha(fichaVacia());
    setEvaluacion(null);
    setAnalizando(false);
    setEditando(true);
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
    setEditando(true);
    setFicha(importada);
    setEvaluacion(null);
    setErrores([]);
    setAvisosImport(avisos);
  }

  // --- Vista resultado: ficha colapsada, análisis a pantalla completa --------
  if (evaluacion && !editando) {
    return (
      <div ref={resultadoRef} className="scroll-mt-6 space-y-5">
        <div className="ca-card ca-fade-up flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-black tracking-tight text-ca-ink">
              {ficha.nombre.trim() || "Ficha sin nombre"}
            </p>
            <p className="text-[12px] text-ca-ink-soft">
              Renta final {formatCLP(evaluacion.rentaFinal)} · UF de hoy $
              {valorUF.valor.toLocaleString("es-CL")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil size={14} /> Editar ficha
            </Button>
            <Button variant="ghost" size="sm" onClick={limpiar}>
              <RotateCcw size={14} /> Limpiar
            </Button>
          </div>
        </div>

        <ResultadoEvaluacion evaluacion={evaluacion} amplio />

        <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ca-ink-soft">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Los datos del cliente no se guardan: quedan solo en esta pantalla y desaparecen al
          cerrarla.
        </p>
      </div>
    );
  }

  // --- Vista ficha: formulario + columna de resultado ------------------------
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
          <Button size="lg" onClick={analizar} disabled={!hayIngresos || analizando}>
            {analizando ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Analizando…
              </>
            ) : (
              <>
                <Calculator size={16} />{" "}
                {evaluacion ? "Volver a analizar" : "Analizar capacidad de compra"}
              </>
            )}
          </Button>
          <Button variant="ghost" size="lg" onClick={limpiar} disabled={analizando}>
            <RotateCcw size={15} /> Limpiar
          </Button>
          {evaluacion && !analizando && (
            <Button variant="outline" size="lg" onClick={() => setEditando(false)}>
              Ver el análisis
            </Button>
          )}
        </div>

        {!hayIngresos && (
          <p className="mt-2 text-[12px] text-ca-ink-soft">
            Agrega al menos una fuente de ingreso para poder analizar.
          </p>
        )}
      </div>

      <aside className="lg:sticky lg:top-6">
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
  );
}

/**
 * Skeleton fiel al layout del resultado (§4.1 de las convenciones): titular,
 * franja de perfil y filas de cifras, para que el contenido no salte al llegar.
 */
function SkeletonResultado() {
  return (
    <div role="status" aria-label="Analizando la ficha" className="space-y-4">
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-56" />
      <Skeleton className="h-12" />
    </div>
  );
}
