"use client";

import { AlertCircle, ArrowRight, Check, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCLP, formatUF } from "@/lib/utils/money";
import { MatrizDividendos } from "@/components/calculadora/MatrizDividendos";
import { TASA_ANUAL_DEFAULT } from "@/lib/credito/constants";
import {
  DISCLAIMER_EVALUACION,
  NOTA_COSTOS_NO_INCLUIDOS,
  type ColorPerfil,
} from "@/lib/credito/capacidad-constants";
import type { Evaluacion, EvaluacionAprobada } from "@/lib/evaluacion/evaluar";

type Props = {
  evaluacion: Evaluacion;
  /**
   * Modo a pantalla completa (la ficha está colapsada): resumen a la izquierda
   * y escenarios de dividendo a la derecha, sin scroll para ver la matriz.
   * Sin `amplio`, es la columna angosta junto al formulario y omite la matriz.
   */
  amplio?: boolean;
  /** Para el encabezado del informe impreso. */
  nombreCliente?: string;
  valorUFDia?: number;
};

const TONO: Record<ColorPerfil, { punto: string; texto: string; fondo: string; label: string }> = {
  verde: {
    punto: "bg-ca-lime",
    texto: "text-ca-ink",
    fondo: "bg-ca-lime/15 border-ca-lime/40",
    label: "Perfil favorable",
  },
  amarillo: {
    punto: "bg-ca-amber",
    texto: "text-ca-ink",
    fondo: "bg-ca-amber/10 border-ca-amber/30",
    label: "Perfil intermedio",
  },
  rojo: {
    punto: "bg-ca-rose",
    texto: "text-ca-ink",
    fondo: "bg-ca-rose/10 border-ca-rose/30",
    label: "Perfil restringido",
  },
};

export function ResultadoEvaluacion({ evaluacion, amplio = false, nombreCliente, valorUFDia }: Props) {
  if (!evaluacion.califica) return <NoCalifica evaluacion={evaluacion} />;

  if (!amplio) {
    return (
      <div className="space-y-4">
        <Titular evaluacion={evaluacion} />
        <Perfil evaluacion={evaluacion} />
        <Cifras evaluacion={evaluacion} />
        <QueMover evaluacion={evaluacion} />
        <Listas evaluacion={evaluacion} />
        <Advertencias evaluacion={evaluacion} />
        <Avisos />
      </div>
    );
  }

  return (
    <div id="informe-evaluacion" className="space-y-6">
      {/* Solo existe al imprimir: identifica el informe que se le entrega al cliente. */}
      <div className="hidden print:block">
        <p className="text-[18px] font-black tracking-tight text-ca-ink">
          Evaluación financiera{nombreCliente ? ` — ${nombreCliente}` : ""}
        </p>
        <p className="text-[12px] text-ca-ink-soft">
          {new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date())}
          {valorUFDia ? ` · UF del día $${valorUFDia.toLocaleString("es-CL")}` : ""}
        </p>
      </div>

      {/* Dos columnas recién en xl: bajo ~1280px la tabla necesita el ancho
          completo — es el entregable de la asesoría y no puede vivir recortada
          tras un scroll horizontal. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:items-start">
        {/* Riel de resumen: lo que el asesor dice en voz alta, de arriba abajo. */}
        <div className="min-w-0 space-y-4">
          <Titular evaluacion={evaluacion} />
          <Perfil evaluacion={evaluacion} />
          <Cifras evaluacion={evaluacion} />
          <QueMover evaluacion={evaluacion} />
        </div>

        {/* La conversación: escenarios y qué mover. Visible sin scroll. El
            min-w-0 es lo que permite al track encogerse bajo el min-content de
            la tabla — sin él, la matriz estira el documento completo en móvil
            en vez de scrollear dentro de su contenedor. */}
        <div className="min-w-0 space-y-5">
          <section
            className="ca-card ca-fade-up p-5 sm:p-6"
            style={{ animationDelay: "160ms" }}
          >
            <header className="mb-4">
              <h3 className="text-[15px] font-black tracking-tight text-ca-ink">
                Escenarios de dividendo
              </h3>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ca-ink-soft">
                Sobre el valor máximo estimado de{" "}
                {formatUF(Math.floor(evaluacion.capacidad.valorMaximoPropiedadUF))}, con
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
              rentaDisponible={evaluacion.rentaFinal}
              resaltar={{
                pie: 1 - evaluacion.capacidad.financiamiento,
                plazoAnios: evaluacion.capacidad.plazoAnios,
              }}
            />
          </section>

          <Listas evaluacion={evaluacion} dosColumnas />
          <Advertencias evaluacion={evaluacion} />
        </div>
      </div>

      <Avisos />
    </div>
  );
}

// --- Piezas del resultado aprobado ------------------------------------------

function Titular({ evaluacion }: { evaluacion: EvaluacionAprobada }) {
  const { capacidad } = evaluacion;
  return (
    <div aria-live="polite" className="ca-fade-up rounded-2xl bg-ca-ink px-6 py-5 text-center text-white">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/60">
        Podría evaluar propiedades hasta
      </p>
      {/* Redondeado a propósito: una propiedad se habla en UF enteras. */}
      <p className="mt-1.5 text-[38px] font-black leading-none tracking-tight sm:text-[44px]">
        {formatUF(Math.floor(capacidad.valorMaximoPropiedadUF))}
      </p>
      <p className="mt-1.5 text-[12px] text-white/70">
        {/* El valor en pesos es, por construcción, crédito + pie. */}
        equivalente a {formatCLP(capacidad.creditoMaximoCLP + capacidad.pieRequeridoCLP)}
      </p>
    </div>
  );
}

function Perfil({ evaluacion }: { evaluacion: EvaluacionAprobada }) {
  const tono = TONO[evaluacion.perfil.color];
  return (
    <div
      className={cn("ca-fade-up rounded-2xl border px-4 py-3", tono.fondo)}
      style={{ animationDelay: "60ms" }}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", tono.punto)} aria-hidden />
        <div>
          <p className={cn("text-[14px] font-black tracking-tight", tono.texto)}>{tono.label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ca-ink-soft">
            {evaluacion.perfil.resumen}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Las cifras como filas clave-valor, no tarjetas: los montos van alineados a la
 * derecha en tipografía tabular y NUNCA desbordan, y seis datos caben en el
 * espacio que antes ocupaban dos tarjetas.
 */
function Cifras({ evaluacion }: { evaluacion: EvaluacionAprobada }) {
  const { capacidad } = evaluacion;
  const pctPie = Math.round((1 - capacidad.financiamiento) * 100);

  return (
    <dl
      className="ca-card ca-fade-up divide-y divide-ca-ink/[0.06] px-4"
      style={{ animationDelay: "100ms" }}
    >
      <Fila label="Dividendo estimado" nota="sin seguros" valor={formatCLP(capacidad.dividendoEstimadoCLP)} />
      <Fila
        label="Pie requerido"
        nota={capacidad.brechaPieCLP > 0 ? `${pctPie}% del valor — no cubierto` : `${pctPie}% del valor · cubierto`}
        valor={formatCLP(capacidad.pieRequeridoCLP)}
      />
      <Fila
        label="Crédito estimado"
        nota={`financiamiento ${Math.round(capacidad.financiamiento * 100)}%`}
        valor={formatCLP(capacidad.creditoMaximoCLP)}
      />
      <Fila label="Plazo sugerido" nota={`edad: ${evaluacion.edad}`} valor={`${capacidad.plazoAnios} años`} />
      <Fila
        label="Renta reconocida"
        nota={
          evaluacion.cuotasMensuales > 0
            ? `menos ${formatCLP(evaluacion.cuotasMensuales)} en cuotas`
            : "sin deudas vigentes"
        }
        valor={formatCLP(evaluacion.ingresoReconocido)}
      />
      <Fila label="Renta final" nota="base del cálculo" valor={formatCLP(evaluacion.rentaFinal)} destacada />
    </dl>
  );
}

function Fila({
  label,
  nota,
  valor,
  destacada = false,
}: {
  label: string;
  nota?: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="min-w-0">
        <span className="block text-[13px] font-semibold text-ca-ink">{label}</span>
        {nota && <span className="block text-[12px] leading-tight text-ca-ink-soft">{nota}</span>}
      </dt>
      <dd
        className={cn(
          "shrink-0 whitespace-nowrap text-right font-black tabular-nums tracking-tight text-ca-ink",
          destacada ? "text-[16px]" : "text-[15px]",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Una sola narrativa en dos niveles: qué mueve el TITULAR (la palanca) y qué
 * hace falta para EJECUTAR a ese valor (el pie). Antes eran dos cajas de
 * colores distintos que se leían como contradicción — "faltan $30M de pie" al
 * lado de "más pie no cambia la cifra" — cuando son dos preguntas diferentes.
 */
function QueMover({ evaluacion }: { evaluacion: EvaluacionAprobada }) {
  const { brechaPieCLP } = evaluacion.capacidad;
  return (
    <div
      className="ca-fade-up space-y-2.5 rounded-xl border border-ca-violet/25 bg-ca-violet/5 px-4 py-3"
      style={{ animationDelay: "150ms" }}
    >
      <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ca-ink">
        <ArrowRight size={15} className="mt-0.5 shrink-0 text-ca-violet" />
        <span>
          <strong>Para subir la cifra:</strong> {evaluacion.palanca}
        </span>
      </p>
      {brechaPieCLP > 0 && (
        <p className="flex items-start gap-2.5 border-t border-ca-violet/15 pt-2.5 text-[13px] leading-relaxed text-ca-ink">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ca-amber-text" />
          <span>
            <strong>Para comprar a este valor:</strong> el pie exige{" "}
            <span className="tabular-nums">{formatCLP(evaluacion.capacidad.pieRequeridoCLP)}</span> y
            al ahorro declarado le faltan{" "}
            <strong className="tabular-nums">{formatCLP(brechaPieCLP)}</strong>. El titular supone
            que el pie se completa.
          </span>
        </p>
      )}
    </div>
  );
}

function Listas({
  evaluacion,
  dosColumnas = false,
}: {
  evaluacion: EvaluacionAprobada;
  dosColumnas?: boolean;
}) {
  const { fortalezas, mejoras } = evaluacion.perfil;
  if (fortalezas.length === 0 && mejoras.length === 0) return null;

  return (
    <div className={cn("gap-5", dosColumnas ? "grid sm:grid-cols-2" : "space-y-5")}>
      {fortalezas.length > 0 && (
        <Bloque titulo="Fortalezas detectadas">
          {fortalezas.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-relaxed text-ca-ink">
              <Check size={14} className="mt-0.5 shrink-0 text-ca-lime-text" />
              {f}
            </li>
          ))}
        </Bloque>
      )}

      {mejoras.length > 0 && (
        <Bloque titulo="Variables que mejorarían la evaluación">
          {mejoras.map((m) => (
            <li key={m} className="flex items-start gap-2 text-[13px] leading-relaxed text-ca-ink">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-ca-ink-soft" />
              {m}
            </li>
          ))}
        </Bloque>
      )}
    </div>
  );
}

function Advertencias({ evaluacion }: { evaluacion: Evaluacion }) {
  if (evaluacion.advertencias.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-xl bg-ca-amber/10 px-4 py-3">
      {evaluacion.advertencias.map((a) => (
        <p key={a} className="flex items-start gap-2 text-[12px] text-ca-ink">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ca-amber-text" />
          {a}
        </p>
      ))}
    </div>
  );
}

function NoCalifica({ evaluacion }: { evaluacion: Extract<Evaluacion, { califica: false }> }) {
  return (
    <div className="max-w-2xl space-y-4">
      {/* Sin ninguna cifra de propiedad: mostrar un tope junto a un "no
          califica" es exactamente la ilusión que hay que evitar. */}
      <div className="ca-fade-up rounded-2xl border border-ca-rose/30 bg-ca-rose/10 px-6 py-6">
        <div className="flex items-start gap-3">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-ca-rose-text" />
          <div>
            <p className="text-[16px] font-black tracking-tight text-ca-ink">
              Con estos antecedentes todavía no califica
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ca-ink-soft">
              {evaluacion.explicacion}
            </p>
          </div>
        </div>
      </div>

      <dl className="ca-card ca-fade-up divide-y divide-ca-ink/[0.06] px-4" style={{ animationDelay: "80ms" }}>
        <Fila label="Renta reconocida" valor={formatCLP(evaluacion.ingresoReconocido)} />
        <Fila label="Cuotas vigentes" valor={formatCLP(evaluacion.cuotasMensuales)} />
        <Fila label="Renta final" valor={formatCLP(evaluacion.rentaFinal)} destacada />
      </dl>

      <Advertencias evaluacion={evaluacion} />
      <Avisos />
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
        {titulo}
      </h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

/**
 * El disclaimer va pegado al resultado, no en letra chica al pie: un "perfil
 * favorable" se lee como una preaprobación bancaria si nadie aclara lo
 * contrario, y esa confusión la paga el cliente semanas después.
 */
function Avisos() {
  return (
    <div className="space-y-2 rounded-xl bg-ca-bg-soft px-4 py-3">
      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ca-ink-soft">
        <Info size={14} className="mt-0.5 shrink-0" />
        {DISCLAIMER_EVALUACION}
      </p>
      <p className="pl-6 text-[12px] leading-relaxed text-ca-ink-soft">
        {NOTA_COSTOS_NO_INCLUIDOS}
      </p>
    </div>
  );
}
