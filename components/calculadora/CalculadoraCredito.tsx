"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CampoMonto } from "@/components/calculadora/CampoMonto";
import { MatrizDividendos } from "@/components/calculadora/MatrizDividendos";
import { simular, type Pasivo } from "@/lib/credito/calculo";
import {
  DISCLAIMER,
  NOTA_SEGUROS,
  RENTA_MINIMA_CLP,
  TASA_ANUAL_DEFAULT,
} from "@/lib/credito/constants";
import type { ValorUF } from "@/lib/indicadores/uf";
import { cn } from "@/lib/utils/cn";
import { formatCLP, formatUF } from "@/lib/utils/money";

type Props = { valorUF: ValorUF };

type EstadoEnvio =
  | { tag: "idle" }
  | { tag: "ok" }
  | { tag: "error"; msg: string };

const TIPOS_PASIVO = [
  { key: "consumo", label: "Crédito de consumo" },
  { key: "hipotecario", label: "Crédito hipotecario" },
  { key: "rotativo", label: "Línea / rotativo" },
] as const;

const PROGRAMAS = [
  { value: "diplomado", label: "Diplomado en Ventas y Asesoría Inmobiliaria" },
  { value: "liderazgo", label: "Programa de Liderazgo y Gestión de Equipos" },
  { value: "ruta", label: "Programa Ruta Inmobiliaria" },
  { value: "indeciso", label: "Aún no lo tengo claro" },
] as const;

function getUtms() {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const grab = (k: string) => sp.get(k) ?? "";
  return {
    utm_source: grab("utm_source"),
    utm_medium: grab("utm_medium"),
    utm_campaign: grab("utm_campaign"),
    utm_content: grab("utm_content"),
    utm_term: grab("utm_term"),
  };
}

export function CalculadoraCredito({ valorUF }: Props) {
  const [valorPropiedadUF, setValorPropiedadUF] = useState(2500);
  const [anioNacimiento, setAnioNacimiento] = useState("");

  const [sueldos, setSueldos] = useState<number[]>([0, 0, 0]);
  const [boletas, setBoletas] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [arriendoMensual, setArriendoMensual] = useState(0);
  const [retirosAnuales, setRetirosAnuales] = useState(0);

  const [pasivos, setPasivos] = useState<Pasivo[]>(
    TIPOS_PASIVO.map((t) => ({
      tipo: t.key,
      deudaTotal: 0,
      valorCuota: 0,
    })),
  );

  const [desbloqueado, setDesbloqueado] = useState(false);

  const anio = Number(anioNacimiento);
  const anioValido =
    anioNacimiento.length === 4 &&
    Number.isFinite(anio) &&
    anio >= 1930 &&
    anio <= new Date().getFullYear() - 18;

  const resultado = useMemo(
    () =>
      simular({
        ingresos: { sueldos, boletas, arriendoMensual, retirosAnuales },
        pasivos,
        valorPropiedadUF,
        tasaAnual: TASA_ANUAL_DEFAULT,
        valorUF: valorUF.valor,
        anioNacimiento: anioValido ? anio : undefined,
      }),
    [
      sueldos,
      boletas,
      arriendoMensual,
      retirosAnuales,
      pasivos,
      valorPropiedadUF,
      valorUF.valor,
      anioValido,
      anio,
    ],
  );

  const hayDatos = resultado.ingresos.total > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
      <div className="space-y-6">
        <Ingresos
          sueldos={sueldos}
          setSueldos={setSueldos}
          boletas={boletas}
          setBoletas={setBoletas}
          arriendoMensual={arriendoMensual}
          setArriendoMensual={setArriendoMensual}
          retirosAnuales={retirosAnuales}
          setRetirosAnuales={setRetirosAnuales}
          advertencias={resultado.ingresos.advertencias}
        />

        <Pasivos pasivos={pasivos} setPasivos={setPasivos} />

        <Propiedad
          valorPropiedadUF={valorPropiedadUF}
          setValorPropiedadUF={setValorPropiedadUF}
          anioNacimiento={anioNacimiento}
          setAnioNacimiento={setAnioNacimiento}
          anioValido={anioValido}
          valorUF={valorUF}
        />
      </div>

      <div className="space-y-6 lg:sticky lg:top-24">
        <Resumen
          hayDatos={hayDatos}
          ingresoTotal={resultado.ingresos.total}
          cuotas={resultado.cuotasMensuales}
          rentaFinal={resultado.rentaFinal}
          califica={resultado.calificaPorRenta}
        />

        {hayDatos && resultado.calificaPorRenta && valorPropiedadUF > 0 && (
          <section className="rounded-3xl border border-ca-outline bg-ca-surface p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-8">
            <h2 className="text-xl font-black tracking-[-0.02em] text-ca-ink">
              Tu dividendo estimado
            </h2>
            <p className="mt-2 text-sm text-ca-ink-soft">
              Sobre una propiedad de {formatUF(valorPropiedadUF)}, con una tasa
              referencial de{" "}
              {(TASA_ANUAL_DEFAULT * 100).toLocaleString("es-CL", {
                minimumFractionDigits: 2,
              })}
              % anual.
            </p>

            {desbloqueado ? (
              <div className="mt-6">
                <MatrizDividendos
                  matriz={resultado.matriz}
                  plazoMaximo={resultado.plazoMaximo}
                />
                {resultado.mejorEscenario && (
                  <p className="mt-6 rounded-2xl bg-ca-violet-mist px-4 py-3 text-sm text-ca-ink">
                    Con tu renta actual, el escenario más alto al que puedes
                    optar es{" "}
                    <strong className="font-bold">
                      {formatCLP(resultado.mejorEscenario.dividendo)}
                    </strong>{" "}
                    al mes, con {Math.round(resultado.mejorEscenario.pie * 100)}%
                    de pie a {resultado.mejorEscenario.plazoAnios} años.
                  </p>
                )}
              </div>
            ) : (
              <FormularioDesbloqueo
                onOk={() => setDesbloqueado(true)}
                resumen={{
                  valorPropiedadUF,
                  rentaFinal: resultado.rentaFinal,
                  ingresoTotal: resultado.ingresos.total,
                  cuotas: resultado.cuotasMensuales,
                  mejorDividendo: resultado.mejorEscenario?.dividendo ?? null,
                }}
              />
            )}

            <p className="mt-6 text-xs leading-relaxed text-ca-ink-soft">
              {NOTA_SEGUROS}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ca-ink-soft">
              {DISCLAIMER}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Ingresos */

function Ingresos({
  sueldos,
  setSueldos,
  boletas,
  setBoletas,
  arriendoMensual,
  setArriendoMensual,
  retirosAnuales,
  setRetirosAnuales,
  advertencias,
}: {
  sueldos: number[];
  setSueldos: (v: number[]) => void;
  boletas: number[];
  setBoletas: (v: number[]) => void;
  arriendoMensual: number;
  setArriendoMensual: (v: number) => void;
  retirosAnuales: number;
  setRetirosAnuales: (v: number) => void;
  advertencias: string[];
}) {
  const reemplazar = (arr: number[], i: number, v: number) =>
    arr.map((x, idx) => (idx === i ? v : x));

  return (
    <Tarjeta titulo="Tus ingresos" paso={1}>
      <fieldset>
        <legend className="mb-3 text-sm font-bold text-ca-ink">
          Liquidaciones de sueldo
          <span className="ml-2 font-normal text-ca-ink-soft">
            últimos 3 meses, líquido
          </span>
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sueldos.map((valor, i) => (
            <CampoMonto
              key={i}
              label={`Mes ${i + 1}`}
              value={valor}
              onChange={(v) => setSueldos(reemplazar(sueldos, i, v))}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="mb-3 text-sm font-bold text-ca-ink">
          Boletas de honorarios
          <span className="ml-2 font-normal text-ca-ink-soft">
            últimas 6; el banco reconoce el 70%
          </span>
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {boletas.map((valor, i) => (
            <CampoMonto
              key={i}
              label={`Boleta ${i + 1}`}
              value={valor}
              onChange={(v) => setBoletas(reemplazar(boletas, i, v))}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoMonto
          label="Arriendos que recibes"
          value={arriendoMensual}
          onChange={setArriendoMensual}
          hint="Mensual: oficinas, departamentos."
        />
        <CampoMonto
          label="Retiros cód. 104 F22"
          value={retirosAnuales}
          onChange={setRetirosAnuales}
          hint="Monto anual declarado en el SII."
        />
      </div>

      {advertencias.map((a) => (
        <p
          key={a}
          role="status"
          className="mt-5 rounded-xl border border-ca-amber/30 bg-ca-amber/5 px-4 py-3 text-sm text-ca-amber-text"
        >
          {a}
        </p>
      ))}
    </Tarjeta>
  );
}

/* ---------------------------------------------------------------- Pasivos */

function Pasivos({
  pasivos,
  setPasivos,
}: {
  pasivos: Pasivo[];
  setPasivos: (v: Pasivo[]) => void;
}) {
  const actualizar = (i: number, patch: Partial<Pasivo>) =>
    setPasivos(pasivos.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <Tarjeta titulo="Tus deudas actuales" paso={2}>
      <p className="mb-5 text-sm text-ca-ink-soft">
        De tu renta solo se descuenta la <strong>cuota mensual</strong>. La deuda
        total nos sirve de contexto, pero no cambia el cálculo.
      </p>
      <div className="space-y-6">
        {pasivos.map((p, i) => (
          <fieldset key={p.tipo}>
            <legend className="mb-3 text-sm font-bold text-ca-ink">
              {TIPOS_PASIVO[i]!.label}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CampoMonto
                label="Deuda total"
                value={p.deudaTotal}
                onChange={(v) => actualizar(i, { deudaTotal: v })}
              />
              <CampoMonto
                label="Cuota mensual"
                value={p.valorCuota}
                onChange={(v) => actualizar(i, { valorCuota: v })}
              />
            </div>
          </fieldset>
        ))}
      </div>
    </Tarjeta>
  );
}

/* -------------------------------------------------------------- Propiedad */

function Propiedad({
  valorPropiedadUF,
  setValorPropiedadUF,
  anioNacimiento,
  setAnioNacimiento,
  anioValido,
  valorUF,
}: {
  valorPropiedadUF: number;
  setValorPropiedadUF: (v: number) => void;
  anioNacimiento: string;
  setAnioNacimiento: (v: string) => void;
  anioValido: boolean;
  valorUF: ValorUF;
}) {
  const anioId = useId();
  const errorId = `${anioId}-error`;
  const conError = anioNacimiento.length > 0 && !anioValido;

  return (
    <Tarjeta titulo="La propiedad" paso={3}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoMonto
          label="Valor de la propiedad"
          value={valorPropiedadUF}
          onChange={setValorPropiedadUF}
          sufijo="UF"
          hint={`≈ ${formatCLP(valorPropiedadUF * valorUF.valor)}`}
        />
        <div>
          <label
            htmlFor={anioId}
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft"
          >
            Año de nacimiento
          </label>
          <Input
            id={anioId}
            value={anioNacimiento}
            onChange={(e) =>
              setAnioNacimiento(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder="1985"
            error={conError}
            aria-invalid={conError}
            aria-describedby={conError ? errorId : undefined}
          />
          {conError ? (
            <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
              Ingresa un año entre 1930 y {new Date().getFullYear() - 18}.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ca-ink-soft">
              Determina el plazo máximo que te puede ofrecer el banco.
            </p>
          )}
        </div>
      </div>

      <p className="mt-5 text-xs text-ca-ink-soft">
        {valorUF.esFallback ? (
          <>
            No pudimos consultar la UF de hoy, así que usamos un valor
            referencial de {formatCLP(valorUF.valor)}.
          </>
        ) : (
          <>
            UF de hoy: <strong className="font-semibold">{formatCLP(valorUF.valor)}</strong>
            {valorUF.fecha ? ` (${valorUF.fecha})` : null}.
          </>
        )}
      </p>
    </Tarjeta>
  );
}

/* ---------------------------------------------------------------- Resumen */

function Resumen({
  hayDatos,
  ingresoTotal,
  cuotas,
  rentaFinal,
  califica,
}: {
  hayDatos: boolean;
  ingresoTotal: number;
  cuotas: number;
  rentaFinal: number;
  califica: boolean;
}) {
  return (
    // Sin aria-live en el panel completo: se recalcula en cada tecla y un lector
    // de pantalla leería todo el bloque en cada pulsación. El veredicto de
    // califica/no-califica se anuncia por su propio role="status" más abajo.
    <section className="rounded-3xl border border-ca-outline bg-ca-surface p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-8">
      <h2 className="text-xl font-black tracking-[-0.02em] text-ca-ink">
        Tu renta para el banco
      </h2>

      {!hayDatos ? (
        <p className="mt-4 text-sm text-ca-ink-soft">
          Completa tus ingresos y verás acá cuánto reconoce el banco, cuánto te
          descuentan tus deudas y con qué renta quedas.
        </p>
      ) : (
        <>
          <dl className="mt-5 space-y-3 text-sm">
            <Linea label="Ingreso reconocido" valor={formatCLP(ingresoTotal)} />
            <Linea
              label="Menos cuotas vigentes"
              valor={cuotas > 0 ? `− ${formatCLP(cuotas)}` : formatCLP(0)}
            />
            <div className="border-t border-ca-outline pt-3">
              <Linea label="Renta final" valor={formatCLP(rentaFinal)} destacado />
            </div>
          </dl>

          <p
            role="status"
            className={cn(
              "mt-5 rounded-2xl px-4 py-3 text-sm font-semibold",
              califica
                ? "bg-ca-lime-mist text-ca-lime-text"
                : "bg-ca-amber/5 text-ca-amber-text",
            )}
          >
            {califica
              ? "Tu renta supera el mínimo exigido. Revisa tus escenarios de dividendo."
              : `Con esta renta aún no calificas: el mínimo referencial es ${formatCLP(RENTA_MINIMA_CLP)}.`}
          </p>
        </>
      )}
    </section>
  );
}

function Linea({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("min-w-0 text-ca-ink-soft", destacado && "font-bold text-ca-ink")}>
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums font-semibold text-ca-ink",
          destacado && "text-xl font-black",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

/* ----------------------------------------------------- Gate de resultados */

function FormularioDesbloqueo({
  onOk,
  resumen,
}: {
  onOk: () => void;
  resumen: {
    valorPropiedadUF: number;
    rentaFinal: number;
    ingresoTotal: number;
    cuotas: number;
    mejorDividendo: number | null;
  };
}) {
  const [estado, setEstado] = useState<EstadoEnvio>({ tag: "idle" });
  const [pending, startTransition] = useTransition();
  const nombreId = useId();
  const correoId = useId();
  const telefonoId = useId();
  const programaId = useId();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const message = [
      "Simulación de crédito hipotecario:",
      `· Propiedad: ${formatUF(resumen.valorPropiedadUF)}`,
      `· Ingreso reconocido: ${formatCLP(resumen.ingresoTotal)}`,
      `· Cuotas vigentes: ${formatCLP(resumen.cuotas)}`,
      `· Renta final: ${formatCLP(resumen.rentaFinal)}`,
      resumen.mejorDividendo !== null
        ? `· Dividendo máximo al que opta: ${formatCLP(resumen.mejorDividendo)}`
        : "· No califica en ningún escenario",
    ].join("\n");

    const payload = {
      full_name: String(fd.get("full_name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      program_interest: String(fd.get("program_interest") ?? "diplomado"),
      message,
      website: String(fd.get("website") ?? ""),
      source: "calculadora-credito",
      ...getUtms(),
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setEstado({
            tag: "error",
            msg: data?.error ?? "No pudimos registrar tus datos.",
          });
          return;
        }
        setEstado({ tag: "ok" });
        onOk();
      } catch (err) {
        console.error("[calculadora] error al registrar el lead", err);
        setEstado({
          tag: "error",
          msg: "Error de conexión. Inténtalo nuevamente.",
        });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-2xl bg-ca-bg-soft p-5 sm:p-6">
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden
      />

      <p className="text-sm font-bold text-ca-ink">
        Déjanos tus datos y te mostramos tus escenarios
      </p>
      <p className="mt-1.5 text-xs text-ca-ink-soft">
        Verás el dividendo estimado para cada combinación de pie y plazo.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={nombreId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
            Nombre y apellido
          </label>
          <Input id={nombreId} name="full_name" required autoComplete="name" />
        </div>
        <div>
          <label htmlFor={correoId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
            Correo electrónico
          </label>
          <Input
            id={correoId}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>
        <div>
          <label htmlFor={telefonoId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
            Teléfono / WhatsApp
          </label>
          <Input
            id={telefonoId}
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+56 9 ..."
          />
        </div>
        <div>
          <label htmlFor={programaId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
            Programa de interés
          </label>
          <Select id={programaId} name="program_interest" defaultValue="diplomado" required>
            {PROGRAMAS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {estado.tag === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {estado.msg}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full uppercase tracking-[0.15em]">
        {pending ? "Enviando…" : "Ver mis escenarios"}
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- Tarjeta */

function Tarjeta({
  titulo,
  paso,
  children,
}: {
  titulo: string;
  paso: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-ca-outline bg-ca-surface p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ca-violet text-sm font-black text-white"
        >
          {paso}
        </span>
        <h2 className="text-xl font-black tracking-[-0.02em] text-ca-ink">
          {titulo}
        </h2>
      </div>
      {children}
    </section>
  );
}
