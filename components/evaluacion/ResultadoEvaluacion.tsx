"use client";

import { AlertCircle, ArrowRight, Check, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCLP, formatUF } from "@/lib/utils/money";
import {
  DISCLAIMER_EVALUACION,
  NOTA_COSTOS_NO_INCLUIDOS,
  type ColorPerfil,
} from "@/lib/credito/capacidad-constants";
import type { Evaluacion } from "@/lib/evaluacion/evaluar";

type Props = { evaluacion: Evaluacion };

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

export function ResultadoEvaluacion({ evaluacion }: Props) {
  if (!evaluacion.califica) return <NoCalifica evaluacion={evaluacion} />;

  const { capacidad, perfil, palanca } = evaluacion;
  const tono = TONO[perfil.color];

  return (
    <div className="space-y-5">
      {/* El dato que el asesor dice en voz alta. Todo lo demás lo respalda. */}
      <div className="rounded-2xl bg-ca-ink px-6 py-7 text-center text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/60">
          Podría evaluar propiedades hasta
        </p>
        {/* Redondeado a propósito: una propiedad se habla en UF enteras, y
            "1.468,93 UF" en un titular de 52px es precisión falsa — la cifra ya
            es una estimación, no un presupuesto al peso. */}
        <p className="mt-2 text-[40px] font-black leading-none tracking-tight sm:text-[52px]">
          {formatUF(Math.floor(capacidad.valorMaximoPropiedadUF))}
        </p>
        <p className="mt-2 text-[13px] text-white/70">
          {/* El valor en pesos es, por construcción, crédito + pie. */}
          equivalente a {formatCLP(capacidad.creditoMaximoCLP + capacidad.pieRequeridoCLP)}
        </p>
      </div>

      <div className={cn("rounded-2xl border px-5 py-4", tono.fondo)}>
        <div className="flex items-start gap-3">
          <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", tono.punto)} aria-hidden />
          <div>
            <p className={cn("text-[15px] font-black tracking-tight", tono.texto)}>{tono.label}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ca-ink-soft">{perfil.resumen}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Cifra label="Dividendo estimado" valor={formatCLP(capacidad.dividendoEstimadoCLP)} nota="sin seguros" />
        <Cifra label="Pie requerido" valor={formatCLP(capacidad.pieRequeridoCLP)} nota={`${Math.round((1 - capacidad.financiamiento) * 100)}% del valor`} />
        <Cifra label="Crédito estimado" valor={formatCLP(capacidad.creditoMaximoCLP)} nota={`financiamiento ${Math.round(capacidad.financiamiento * 100)}%`} />
        <Cifra label="Plazo sugerido" valor={`${capacidad.plazoAnios} años`} nota={`edad: ${evaluacion.edad}`} />
        <Cifra label="Renta reconocida" valor={formatCLP(evaluacion.ingresoReconocido)} nota={evaluacion.cuotasMensuales > 0 ? `menos ${formatCLP(evaluacion.cuotasMensuales)} en cuotas` : "sin deudas vigentes"} />
        <Cifra label="Renta final" valor={formatCLP(evaluacion.rentaFinal)} nota="base del cálculo" />
      </div>

      {/* La palanca real: cuál de los tres topes está mandando. Es lo que evita
          que el asesor recomiende algo que no cambiaría la cifra. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-ca-violet/25 bg-ca-violet/5 px-4 py-3">
        <ArrowRight size={16} className="mt-0.5 shrink-0 text-ca-violet" />
        <p className="text-[13px] leading-relaxed text-ca-ink">{palanca}</p>
      </div>

      {perfil.fortalezas.length > 0 && (
        <Bloque titulo="Fortalezas detectadas">
          {perfil.fortalezas.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] text-ca-ink">
              <Check size={15} className="mt-0.5 shrink-0 text-ca-lime-text" />
              {f}
            </li>
          ))}
        </Bloque>
      )}

      {perfil.mejoras.length > 0 && (
        <Bloque titulo="Variables que mejorarían la evaluación">
          {perfil.mejoras.map((m) => (
            <li key={m} className="flex items-start gap-2 text-[13px] text-ca-ink">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-ca-ink-soft" />
              {m}
            </li>
          ))}
        </Bloque>
      )}

      {evaluacion.advertencias.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-ca-amber/10 px-4 py-3">
          {evaluacion.advertencias.map((a) => (
            <p key={a} className="flex items-start gap-2 text-[12px] text-ca-ink">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ca-amber-text" />
              {a}
            </p>
          ))}
        </div>
      )}

      <Avisos />
    </div>
  );
}

function NoCalifica({ evaluacion }: { evaluacion: Extract<Evaluacion, { califica: false }> }) {
  return (
    <div className="space-y-5">
      {/* Sin ninguna cifra de propiedad: mostrar un tope junto a un "no
          califica" es exactamente la ilusión que hay que evitar. */}
      <div className="rounded-2xl border border-ca-rose/30 bg-ca-rose/10 px-6 py-6">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra label="Renta reconocida" valor={formatCLP(evaluacion.ingresoReconocido)} />
        <Cifra label="Cuotas vigentes" valor={formatCLP(evaluacion.cuotasMensuales)} />
        <Cifra label="Renta final" valor={formatCLP(evaluacion.rentaFinal)} />
      </div>

      {evaluacion.advertencias.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-ca-amber/10 px-4 py-3">
          {evaluacion.advertencias.map((a) => (
            <p key={a} className="flex items-start gap-2 text-[12px] text-ca-ink">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ca-amber-text" />
              {a}
            </p>
          ))}
        </div>
      )}

      <Avisos />
    </div>
  );
}

function Cifra({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-ca-ink/[0.08] bg-ca-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-black tracking-tight text-ca-ink">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-ca-ink-soft">{nota}</p>}
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
