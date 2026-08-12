"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CampoMonto } from "@/components/calculadora/CampoMonto";
import { cleanRut, formatRut, isValidRut } from "@/lib/utils/rut";
import { cn } from "@/lib/utils/cn";
import type { Ficha } from "@/lib/evaluacion/ficha";

type Props = {
  ficha: Ficha;
  onChange: (ficha: Ficha) => void;
};

const FUENTES = [
  { value: "sueldo_indefinido", label: "Sueldo con contrato indefinido" },
  { value: "sueldo_plazo_fijo", label: "Sueldo con contrato a plazo fijo" },
  { value: "mixto", label: "Mixto (sueldo + honorarios)" },
  { value: "honorarios", label: "Solo boletas de honorarios" },
] as const;

const TIPOS_PASIVO = [
  { value: "consumo", label: "Crédito de consumo" },
  { value: "hipotecario", label: "Crédito hipotecario" },
  { value: "rotativo", label: "Línea o rotativo" },
] as const;

/**
 * Ficha de Estado de Situación — Paso 7 de la metodología comercial.
 *
 * Se completa junto al cliente en la reunión, así que el orden de las secciones
 * sigue el de la conversación real (quién es → de qué vive → qué debe → qué
 * tiene) y no el del modelo de datos.
 *
 * Nada de esto se guarda (decisión 1 del ADR-0032): son datos financieros de un
 * tercero que no es usuario de la plataforma.
 */
export function FichaEstadoSituacion({ ficha, onChange }: Props) {
  const set = <K extends keyof Ficha>(campo: K, valor: Ficha[K]) =>
    onChange({ ...ficha, [campo]: valor });

  return (
    <div className="space-y-8">
      <Seccion titulo="Antecedentes" paso="1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre del cliente">
            <Input
              value={ficha.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Nombre y apellido"
              autoComplete="off"
            />
          </Campo>

          <CampoRut
            value={ficha.rut}
            onChange={(v) => set("rut", v)}
          />

          <Campo label="Año de nacimiento" hint="Define el plazo máximo del crédito">
            <Input
              inputMode="numeric"
              value={ficha.anioNacimiento || ""}
              onChange={(e) => set("anioNacimiento", Number(e.target.value.replace(/\D/g, "")) || 0)}
              placeholder="1988"
              maxLength={4}
            />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Situación laboral" paso="2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Origen de la renta">
            <Select
              value={ficha.fuenteRenta}
              onChange={(e) => set("fuenteRenta", e.target.value as Ficha["fuenteRenta"])}
            >
              {FUENTES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo label="Antigüedad laboral (meses)" hint="En el empleo o actividad actual">
            <Input
              inputMode="numeric"
              value={ficha.antiguedadMeses || ""}
              onChange={(e) =>
                set("antiguedadMeses", Number(e.target.value.replace(/\D/g, "")) || 0)
              }
              placeholder="24"
              maxLength={3}
            />
          </Campo>
        </div>
      </Seccion>

      <Seccion
        titulo="Ingresos"
        paso="3"
        nota="El banco no reconoce todas las fuentes por igual: las boletas y los retiros se toman al 70%, y las boletas exigen al menos 3."
      >
        <ListaMontos
          label="Liquidaciones de sueldo"
          hint="Las últimas 3, líquidas"
          valores={ficha.sueldos}
          onChange={(v) => set("sueldos", v)}
          maximo={6}
          textoAgregar="Agregar liquidación"
        />

        <ListaMontos
          label="Boletas de honorarios"
          hint="Mínimo 3 para que el banco las reconozca"
          valores={ficha.boletas}
          onChange={(v) => set("boletas", v)}
          maximo={12}
          textoAgregar="Agregar boleta"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMonto
            label="Arriendos percibidos (mensual)"
            value={ficha.arriendoMensual}
            onChange={(v) => set("arriendoMensual", v)}
          />
          <CampoMonto
            label="Retiros código 104 (anual)"
            value={ficha.retirosAnuales}
            onChange={(v) => set("retirosAnuales", v)}
            hint="Del F22, oficializados en el SII"
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Deudas vigentes"
        paso="4"
        nota="La cuota mensual descuenta de la renta. El saldo de un crédito hipotecario además reduce el máximo que el banco presta."
      >
        <Pasivos pasivos={ficha.pasivos} onChange={(v) => set("pasivos", v)} />
      </Seccion>

      <Seccion titulo="Patrimonio y ahorro" paso="5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMonto
            label="Activos totales"
            value={ficha.activosTotales}
            onChange={(v) => set("activosTotales", v)}
            hint="Propiedades, vehículos e inversiones, a valor de mercado"
          />
          <CampoMonto
            label="Ahorro disponible para el pie"
            value={ficha.ahorroDisponible}
            onChange={(v) => set("ahorroDisponible", v)}
            hint="Lo que tiene hoy, no lo que proyecta juntar"
          />
        </div>
      </Seccion>
    </div>
  );
}

// --- Piezas -----------------------------------------------------------------

function Seccion({
  titulo,
  paso,
  nota,
  children,
}: {
  titulo: string;
  paso: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ca-violet/10 text-[12px] font-black text-ca-violet">
          {paso}
        </span>
        <h3 className="text-[15px] font-black tracking-tight text-ca-ink">{titulo}</h3>
      </div>
      {nota && <p className="text-[12px] leading-relaxed text-ca-ink-soft">{nota}</p>}
      {children}
    </section>
  );
}

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ca-ink-soft">{hint}</span>}
    </label>
  );
}

/** RUT con máscara en vivo y validación de dígito verificador (§2.1 de las convenciones). */
function CampoRut({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const invalido = value.trim() !== "" && !isValidRut(value);

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
        RUT <span className="font-normal normal-case tracking-normal">(opcional)</span>
      </span>
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const limpio = cleanRut(e.target.value);
          if (limpio.length <= 9) onChange(formatRut(e.target.value));
        }}
        placeholder="12.345.678-9"
        inputMode="text"
        autoComplete="off"
        aria-invalid={invalido}
        className={cn(invalido && "border-ca-rose")}
      />
      {invalido && (
        <span className="mt-1 block text-[11px] text-ca-rose-text">
          RUT inválido. Verifica el dígito verificador.
        </span>
      )}
    </label>
  );
}

/**
 * Lista de montos que crece a demanda.
 *
 * Se piden uno por uno y no como promedio porque el motor promedia solo lo
 * ingresado: la planilla original dividía siempre entre 6 y a quien traía 3
 * boletas le reducía el ingreso reconocido a la mitad.
 */
function ListaMontos({
  label,
  hint,
  valores,
  onChange,
  maximo,
  textoAgregar,
}: {
  label: string;
  hint?: string;
  valores: number[];
  onChange: (v: number[]) => void;
  maximo: number;
  textoAgregar: string;
}) {
  const set = (i: number, v: number) => onChange(valores.map((x, j) => (j === i ? v : x)));
  const quitar = (i: number) => onChange(valores.filter((_, j) => j !== i));

  // Filas verticales, no columnas: tres campos en línea hacían colisionar las
  // etiquetas y truncaban los montos — el asesor no podía verificar lo que
  // digitó. Una etiqueta de grupo y numeración por fila.
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ca-ink-soft">
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[12px] text-ca-ink-soft">{hint}</p>}
      </div>

      {valores.length > 0 && (
        <div className="max-w-md space-y-2">
          {valores.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-ca-ink-soft"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <CampoMonto
                  label={`${label} ${i + 1}`}
                  labelOculta
                  value={v}
                  onChange={(nv) => set(i, nv)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => quitar(i)}
                aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`}
                className="h-11 w-11 shrink-0 px-0 md:h-9 md:w-9"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {valores.length < maximo && (
        <Button variant="outline" size="sm" onClick={() => onChange([...valores, 0])}>
          <Plus size={14} /> {textoAgregar}
        </Button>
      )}
    </div>
  );
}

function Pasivos({
  pasivos,
  onChange,
}: {
  pasivos: Ficha["pasivos"];
  onChange: (p: Ficha["pasivos"]) => void;
}) {
  const set = (i: number, patch: Partial<Ficha["pasivos"][number]>) =>
    onChange(pasivos.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-3">
      {pasivos.map((p, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-ca-ink/[0.08] p-3">
          {/* El tipo a lo ancho y los montos abajo: tres columnas apretaban el
              select hasta truncarlo y descuadraban las etiquetas. */}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Campo label={`Deuda ${i + 1} — tipo`}>
                <Select
                  value={p.tipo}
                  onChange={(e) => set(i, { tipo: e.target.value as typeof p.tipo })}
                >
                  {TIPOS_PASIVO.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(pasivos.filter((_, j) => j !== i))}
              aria-label={`Quitar deuda ${i + 1}`}
              className="h-11 w-11 shrink-0 px-0 md:h-9 md:w-9"
            >
              <Trash2 size={15} />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CampoMonto
              label="Saldo total"
              value={p.deudaTotal}
              onChange={(v) => set(i, { deudaTotal: v })}
            />
            <CampoMonto
              label="Cuota mensual"
              value={p.valorCuota}
              onChange={(v) => set(i, { valorCuota: v })}
            />
          </div>
        </div>
      ))}

      {pasivos.length === 0 && (
        <p className="text-[12px] text-ca-ink-soft">
          Sin deudas registradas. Agrega las que el cliente tenga vigentes.
        </p>
      )}

      {pasivos.length < 20 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...pasivos, { tipo: "consumo", deudaTotal: 0, valorCuota: 0 }])
          }
        >
          <Plus size={14} /> Agregar deuda
        </Button>
      )}
    </div>
  );
}
