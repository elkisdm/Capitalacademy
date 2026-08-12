"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Check,
  Clock,
  FileDown,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FichaEstadoSituacion } from "./FichaEstadoSituacion";
import { ImportarFicha } from "./ImportarFicha";
import { ResultadoEvaluacion } from "./ResultadoEvaluacion";
import { formatCLP, formatUF } from "@/lib/utils/money";
import { fichaSchema, fichaVacia, type Ficha } from "@/lib/evaluacion/ficha";
import { evaluarFicha, type Evaluacion } from "@/lib/evaluacion/evaluar";
import {
  eliminarDelHistorial,
  guardarEnHistorial,
  listarHistorial,
  type EntradaHistorial,
} from "@/lib/evaluacion/historial";
import type { ImporteEESS } from "@/lib/evaluacion/importar-eess";
import type { ValorUF } from "@/lib/indicadores/uf";

type Props = { valorUF: ValorUF };

/**
 * Motor de Evaluación Financiera (ADR-0032).
 *
 * Todo el cálculo corre en el navegador y la ficha NO viaja a ningún servidor
 * (decisión 1 del ADR-0032). El historial es LOCAL: localStorage de este
 * computador, guardado explícito por el asesor (enmienda 2 del ADR-0032).
 *
 * Dos vistas: mientras se llena la ficha, formulario + columna de resultado.
 * Con el análisis listo, la ficha se COLAPSA a una barra y el resultado toma
 * toda la pantalla. "Editar ficha" vuelve a la primera vista.
 */
export function EvaluacionFinanciera({ valorUF }: Props) {
  const [ficha, setFicha] = useState<Ficha>(fichaVacia);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  // Copia de la ficha con la que se corrió el análisis vigente: si difiere de
  // la que se está editando, el resultado se marca como desactualizado.
  const [fichaAnalizada, setFichaAnalizada] = useState<Ficha | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [editando, setEditando] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [avisosImport, setAvisosImport] = useState<string[]>([]);
  const [historial, setHistorial] = useState<EntradaHistorial[]>([]);
  const [guardadoId, setGuardadoId] = useState<string | null>(null);
  const [confirmandoLimpiar, setConfirmandoLimpiar] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultadoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHistorial(listarHistorial(window.localStorage));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

  const hayDatos = useMemo(
    () => hayIngresos || ficha.nombre.trim() !== "" || ficha.pasivos.length > 0,
    [hayIngresos, ficha],
  );

  // Resultado vigente vs. ficha en edición: si difieren, las cifras en pantalla
  // ya no corresponden a lo que se está viendo en el formulario.
  const resultadoDesactualizado = useMemo(() => {
    if (!evaluacion || !fichaAnalizada) return false;
    return JSON.stringify(ficha) !== JSON.stringify(fichaAnalizada);
  }, [evaluacion, fichaAnalizada, ficha]);

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
    setGuardadoId(null);

    // El cálculo es instantáneo; la pausa breve le da peso al resultado y deja
    // ver el skeleton en vez de un cambio brusco de pantalla.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setEvaluacion(evaluarFicha(parsed.data, { valorUF: valorUF.valor }));
      setFichaAnalizada(ficha);
      setAnalizando(false);
      setEditando(false);
    }, 750);
  }

  function limpiar() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFicha(fichaVacia());
    setEvaluacion(null);
    setFichaAnalizada(null);
    setAnalizando(false);
    setEditando(true);
    setErrores([]);
    setAvisosImport([]);
    setGuardadoId(null);
    setConfirmandoLimpiar(false);
  }

  // Limpiar borra un levantamiento completo hecho frente al cliente: con datos
  // cargados se confirma antes, porque no hay forma de deshacerlo.
  function pedirLimpiar() {
    if (hayDatos || evaluacion) setConfirmandoLimpiar(true);
    else limpiar();
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
    setFichaAnalizada(null);
    setErrores([]);
    setAvisosImport(avisos);
    setGuardadoId(null);
  }

  function guardar() {
    if (!evaluacion) return;
    const entrada = guardarEnHistorial(window.localStorage, {
      nombre: ficha.nombre,
      valorUF: valorUF.valor,
      ficha,
      evaluacion,
    });
    if (entrada) {
      setGuardadoId(entrada.id);
      setHistorial(listarHistorial(window.localStorage));
    }
  }

  function abrirEntrada(entrada: EntradaHistorial) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFicha(entrada.ficha);
    setEvaluacion(entrada.evaluacion);
    setFichaAnalizada(entrada.ficha);
    setAnalizando(false);
    setEditando(false);
    setErrores([]);
    setAvisosImport([]);
    setGuardadoId(entrada.id);
  }

  function eliminarEntrada(id: string) {
    eliminarDelHistorial(window.localStorage, id);
    setHistorial(listarHistorial(window.localStorage));
    if (guardadoId === id) setGuardadoId(null);
  }

  // Imprime SOLO el informe (reglas en globals.css bajo [data-print-informe]).
  // "Guardar como PDF" del diálogo de impresión es el export.
  function descargarPDF() {
    document.body.setAttribute("data-print-informe", "");
    const restaurar = () => {
      document.body.removeAttribute("data-print-informe");
      window.removeEventListener("afterprint", restaurar);
    };
    window.addEventListener("afterprint", restaurar);
    window.print();
  }

  const dialogoLimpiar = (
    <Dialog
      open={confirmandoLimpiar}
      onClose={() => setConfirmandoLimpiar(false)}
      aria-label="Confirmar limpieza de la ficha"
    >
      <div className="p-5">
        <p className="text-[15px] font-black tracking-tight text-ca-ink">
          ¿Limpiar la ficha completa?
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ca-ink-soft">
          Se pierde todo lo digitado{evaluacion ? " y el análisis en pantalla" : ""}. Los datos no
          se guardan en ninguna parte, así que no hay forma de recuperarlos
          {guardadoId ? " (la copia del historial se conserva)" : ""}.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmandoLimpiar(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={limpiar}>
            <RotateCcw size={14} /> Limpiar todo
          </Button>
        </div>
      </div>
    </Dialog>
  );

  // --- Vista resultado: ficha colapsada, análisis a pantalla completa --------
  if (evaluacion && !editando) {
    return (
      <div ref={resultadoRef} className="scroll-mt-6 space-y-5">
        <div className="ca-card ca-fade-up flex flex-wrap items-center justify-between gap-3 px-4 py-3 print:hidden sm:px-5">
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
            <Button variant="outline" size="sm" onClick={guardar} disabled={guardadoId !== null}>
              {guardadoId ? (
                <>
                  <Check size={14} /> Guardado
                </>
              ) : (
                <>
                  <Save size={14} /> Guardar
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={descargarPDF}>
              <FileDown size={14} /> Descargar PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={pedirLimpiar}>
              <RotateCcw size={14} /> Limpiar
            </Button>
          </div>
        </div>

        <ResultadoEvaluacion
          evaluacion={evaluacion}
          amplio
          nombreCliente={ficha.nombre.trim() || undefined}
          valorUFDia={valorUF.valor}
        />

        <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ca-ink-soft print:hidden">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Los datos del cliente no se envían a ningún servidor. "Guardar" deja una copia solo en
          este computador.
        </p>

        {dialogoLimpiar}
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
          <Button variant="ghost" size="lg" onClick={pedirLimpiar} disabled={analizando}>
            <RotateCcw size={15} /> Limpiar
          </Button>
          {evaluacion && !analizando && !resultadoDesactualizado && (
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
          <div className="space-y-3">
            {resultadoDesactualizado && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl bg-ca-amber/10 px-4 py-3"
              >
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ca-amber-text" />
                <p className="text-[12px] leading-relaxed text-ca-ink">
                  <strong>La ficha cambió desde este análisis.</strong>{" "}
                  Las cifras de abajo corresponden a los datos anteriores — presiona
                  &ldquo;Volver a analizar&rdquo;.
                </p>
              </div>
            )}
            <div className={resultadoDesactualizado ? "opacity-50" : undefined}>
              <ResultadoEvaluacion evaluacion={evaluacion} />
            </div>
          </div>
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

        {historial.length > 0 && (
          <HistorialLocal
            historial={historial}
            onAbrir={abrirEntrada}
            onEliminar={eliminarEntrada}
          />
        )}

        <p className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ca-ink-soft">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Los datos del cliente no se envían a ningún servidor. El historial guarda copias solo
          en este computador.
        </p>
      </aside>

      {dialogoLimpiar}
    </div>
  );
}

/**
 * Historial local (enmienda 2 del ADR-0032): análisis guardados a mano por el
 * asesor, solo en el localStorage de esta máquina.
 */
function HistorialLocal({
  historial,
  onAbrir,
  onEliminar,
}: {
  historial: EntradaHistorial[];
  onAbrir: (e: EntradaHistorial) => void;
  onEliminar: (id: string) => void;
}) {
  const fecha = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="ca-card mt-4 p-4">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
        <Clock size={13} /> Historial en este computador
      </h3>
      <ul className="mt-2 divide-y divide-ca-ink/[0.06]">
        {historial.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => onAbrir(e)}
              className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
            >
              <span className="block truncate text-[13px] font-bold text-ca-ink">{e.nombre}</span>
              <span className="block text-[12px] text-ca-ink-soft">
                {fecha.format(new Date(e.guardadoEn))}
                {e.evaluacion.califica &&
                  ` · ${formatUF(Math.floor(e.evaluacion.capacidad.valorMaximoPropiedadUF))}`}
              </span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEliminar(e.id)}
              aria-label={`Eliminar del historial a ${e.nombre}`}
              className="h-11 w-11 shrink-0 px-0 md:h-9 md:w-9"
            >
              <Trash2 size={14} />
            </Button>
          </li>
        ))}
      </ul>
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
