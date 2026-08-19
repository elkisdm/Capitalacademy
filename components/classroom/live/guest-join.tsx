"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveClassRoom } from "./live-class-room";
import { SalaShell } from "./sala-shell";
import { faseDeVentana, type FaseVentana } from "@/lib/livekit/ventana-sala";

/**
 * Entrada de un INVITADO SIN CUENTA a una sala abierta (ADR-0035, 0099).
 *
 * Es la primera pantalla del producto que ve alguien que no es usuario. Escribe
 * su nombre, queda esperando y entra recién cuando el docente lo acepta: no hay
 * token —ni presencia en la sala— mientras tanto.
 *
 * La credencial vive en una cookie `httpOnly` que pone el servidor, así que acá
 * no se guarda ni se maneja ningún identificador: esta pantalla solo pregunta
 * "¿en qué estoy?" y pinta la respuesta.
 */

type Estado = "cargando" | "none" | "pending" | "approved" | "denied" | "error";

/** Cada cuánto se vuelve a preguntar mientras espera al docente. */
const RITMO_MS = 5000;

export function GuestJoin({
  code,
  titulo,
  docente = null,
  horario = null,
  programa = null,
  inicioIso,
  finIso,
  esEnVivo = true,
  marcaNombre = "Capital Academy",
  marcaAcento = "#5e17eb",
}: {
  code: string;
  titulo: string;
  /** Datos de presentación de la clase. Opcionales: la portada degrada sin ellos. */
  docente?: string | null;
  horario?: string | null;
  programa?: string | null;
  /**
   * Inicio y fin de la clase. Viajan como fecha, no como un booleano ya
   * resuelto: una pestaña abierta CRUZA la ventana (-30 min / +2 h), y un
   * booleano calculado en el servidor deja la pantalla cerrada diez minutos
   * después de que abrió, o con el botón vivo dos horas después de que cerró.
   */
  inicioIso: string;
  finIso: string;
  /** La modalidad es el primer rechazo del gate, antes que la ventana. */
  esEnVivo?: boolean;
  /** Marca del programa (misma fuente que login y onboarding). */
  marcaNombre?: string;
  marcaAcento?: string;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fase, setFase] = useState<FaseVentana>(() => faseDeVentana(inicioIso, finIso));

  // Se revisa cada 30 s para que la pantalla cruce la ventana sola: quien abre
  // el enlace 40 minutos antes ve el formulario aparecer sin recargar, y quien
  // deja la pestaña abierta deja de tener el botón vivo cuando la sala cierra.
  useEffect(() => {
    const id = setInterval(() => setFase(faseDeVentana(inicioIso, finIso)), 30_000);
    return () => clearInterval(id);
  }, [inicioIso, finIso]);

  const consultar = useCallback(async () => {
    try {
      const res = await fetch(`/api/sala/${code}/invitado`);
      if (!res.ok) {
        setEstado("error");
        return;
      }
      const { estado: e, nombre: n } = (await res.json()) as {
        estado: Estado;
        nombre: string | null;
      };
      setEstado(e);
      if (n) setNombre(n);
    } catch {
      setEstado("error");
    }
  }, [code]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  // Mientras espera, se pregunta cada 5 s. Se apaga en cuanto el docente decide:
  // seguir sondeando con la respuesta ya dada sería carga sin ninguna pregunta
  // pendiente.
  useEffect(() => {
    if (estado !== "pending") return;
    const id = setInterval(() => void consultar(), RITMO_MS);
    return () => clearInterval(id);
  }, [estado, consultar]);

  const pedir = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setEnviando(true);
      setAviso(null);
      try {
        const res = await fetch(`/api/sala/${code}/invitado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        });
        const data = (await res.json()) as { estado?: Estado; error?: string };
        if (!res.ok) {
          setAviso(data.error ?? "No pudimos registrar tu solicitud.");
          return;
        }
        setEstado(data.estado ?? "pending");
      } catch {
        setAviso("No pudimos registrar tu solicitud. Revisa tu conexión.");
      } finally {
        setEnviando(false);
      }
    },
    [code, nombre],
  );

  const abierta = esEnVivo && fase === "abierta";

  const { etiquetaFase, tituloFase, detalleFase } = !esEnVivo
    ? {
        etiquetaFase: "Esta clase no es en vivo",
        tituloFase: "Esta clase no tiene sala",
        detalleFase:
          "Es una clase grabada, así que no hay una reunión a la que entrar. Escríbele a quien te compartió el enlace.",
      }
    : fase === "cerrada"
      ? {
          etiquetaFase: "La clase ya terminó",
          tituloFase: "Esta clase ya terminó",
          detalleFase: horario
            ? `Fue el ${horario}. La sala se cierra dos horas después de que termina.`
            : "La sala se cierra dos horas después de que termina la clase.",
        }
      : {
          etiquetaFase: "La sala todavía no abre",
          tituloFase: "La sala todavía no está abierta",
          detalleFase: horario
            ? `Abre 30 minutos antes de que empiece: ${horario}. Vuelve a entrar con este mismo enlace.`
            : "Abre 30 minutos antes de que empiece la clase. Vuelve a entrar con este mismo enlace.",
        };
  const puedeEnviar = !enviando && nombre.trim().length >= 2 && abierta;

  if (estado === "approved") {
    return (
      <SalaShell title={titulo} code={code} volverA={null}>
        <LiveClassRoom sessionId={code} fill userName={nombre} />
      </SalaShell>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ca-ink text-white">
      {/* Círculos de marca recortados por el borde, como en el manual. */}
      <div
        aria-hidden
        style={{ background: marcaAcento }}
        className="pointer-events-none absolute -right-28 -top-36 h-[300px] w-[300px] rounded-full opacity-[0.18] md:-right-36 md:-top-44 md:h-[420px] md:w-[420px] md:opacity-[0.16]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-[280px] w-[280px] rounded-full bg-ca-lime opacity-[0.06] md:-bottom-52 md:-left-28 md:h-[380px] md:w-[380px] md:opacity-[0.07]"
      />

      <header className="relative flex shrink-0 items-center justify-between gap-3 px-5 py-4 md:border-b md:border-white/10 md:px-10">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden className="md:h-[26px] md:w-[26px]">
            <path d="M13 3L23 23H17.5L13 13.2L8.5 23H3L13 3Z" fill="#ffffff" />
            <rect x="8" y="16.5" width="10" height="2.4" rx="1.2" fill="#c5f122" />
          </svg>
          <span className="text-[12px] font-bold text-white/85 md:text-[13px]">{marcaNombre}</span>
        </div>
        <span className="font-mono text-[11px] text-white/40 md:rounded-full md:border md:border-white/10 md:bg-white/5 md:px-3.5 md:py-1.5 md:text-[12px] md:text-white/45">
          {code}
        </span>
      </header>

      <main
        id="main"
        className="relative flex flex-1 flex-col justify-end overflow-y-auto md:grid md:grid-cols-12 md:items-center md:gap-12 md:overflow-visible md:px-14"
      >
        {/* Identidad de la clase */}
        <div className="px-5 pt-3 md:col-span-7 md:px-0 md:pt-0">
          <div className="mb-3.5 flex items-center gap-2 md:mb-6">
            {abierta ? (
              <>
                <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-ca-lime md:h-2 md:w-2" />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-lime md:text-[11px]">
                  En vivo ahora
                </span>
              </>
            ) : (
              <>
                <span className="h-[7px] w-[7px] rounded-full bg-white/30 md:h-2 md:w-2" />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 md:text-[11px]">
                  {etiquetaFase}
                </span>
              </>
            )}
          </div>

          <h1 className="text-balance text-[27px] font-black leading-[1.12] tracking-[-0.03em] md:text-[52px] md:leading-[1.04] md:tracking-[-0.035em]">
            {titulo}
          </h1>

          <div className="mt-4 flex flex-col gap-3 md:mt-7 md:flex-row md:flex-wrap md:items-center md:gap-7">
            {docente && (
              <div className="flex items-center gap-2.5 md:gap-3">
                {/* El acento va en el aro, no de fondo: ningún acento del
                    registro alcanza 4.5:1 con texto encima — el rosa de
                    Capacitaciones topa en 4.28:1 con blanco Y con tinta. Así la
                    marca se ve y las iniciales se leen siempre. */}
                <span
                  style={{ borderColor: marcaAcento }}
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 bg-white/10 text-[12px] font-bold text-white md:h-[38px] md:w-[38px] md:text-[13px]"
                >
                  {iniciales(docente)}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold md:text-[14px]">{docente}</div>
                  <div className="text-[12px] text-white/50">
                    Docente{horario ? ` · ${horario}` : ""}
                  </div>
                </div>
              </div>
            )}

            {/* Sin docente, el horario se muestra igual: es el dato que confirma
                que llegaste a la clase correcta. */}
            {!docente && horario && (
              <div className="flex items-center gap-2 text-white/60">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5l3 2" />
                </svg>
                <span className="text-[14px]">{horario}</span>
              </div>
            )}

            {programa && (
              <div className="hidden items-center gap-2 text-white/60 md:flex">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 6.5h16v13H4z" />
                  <path d="M8 3.5v4M16 3.5v4M4 11h16" />
                </svg>
                <span className="text-[14px]">{programa}</span>
              </div>
            )}
          </div>

          <p className="mt-8 hidden max-w-[460px] text-pretty text-[14px] leading-relaxed text-white/50 md:block">
            Entras como invitado. No necesitas cuenta ni instalar nada: el docente te deja pasar
            desde la sala.
          </p>
        </div>

        {/* Tarjeta de acceso. En el teléfono va abajo, al alcance del pulgar. */}
        <div className="p-5 md:col-span-5 md:p-0">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-6 md:p-8">
            {estado === "cargando" && (
              <p className="py-6 text-center text-[14px] text-white/70">Abriendo la sala…</p>
            )}

            {estado === "error" && (
              <div className="py-2 text-center">
                <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-ca-amber/15">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f5a524" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                    <path d="M12 7.5v6M12 17h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <h2 className="mb-2 text-[20px] font-black tracking-[-0.025em]">
                  No pudimos abrir esta sala
                </h2>
                <p className="mb-5 text-[13px] leading-relaxed text-white/55">
                  Puede que el docente la haya cerrado a invitados, o que sea tu conexión.
                </p>
                {/* Sin este botón la pantalla es un callejón: el sondeo solo
                    corre mientras espera, así que un error no se recupera solo
                    aunque el docente vuelva a abrir la sala. */}
                <button
                  type="button"
                  onClick={() => {
                    setEstado("cargando");
                    void consultar();
                  }}
                  className="h-11 rounded-full border border-white/15 px-6 text-[12px] font-bold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {(estado === "none" || estado === "pending") && !abierta && (
              <div className="py-2 text-center">
                <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/[0.08]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5l3 2" />
                  </svg>
                </div>
                <h2 className="mb-2 text-[20px] font-black tracking-[-0.025em]">{tituloFase}</h2>
                <p className="text-[13px] leading-relaxed text-white/55">{detalleFase}</p>
              </div>
            )}

            {estado === "none" && abierta && (
              <form onSubmit={pedir}>
                <h2 className="mb-1.5 text-[21px] font-black tracking-[-0.025em] md:text-[24px]">
                  ¿Cómo te llamas?
                </h2>
                <p className="mb-5 text-[13px] leading-relaxed text-white/55 md:mb-6">
                  El docente verá tu nombre para dejarte entrar.
                </p>

                <label
                  htmlFor="nombre-invitado"
                  className="mb-2 hidden text-[11px] font-bold uppercase tracking-[0.12em] text-white/45 md:block"
                >
                  Tu nombre
                </label>
                <input
                  id="nombre-invitado"
                  type="text"
                  value={nombre}
                  onChange={(ev) => setNombre(ev.target.value)}
                  placeholder="Nombre y apellido"
                  maxLength={40}
                  required
                  autoFocus
                  /* 16px en el teléfono: por debajo de eso Safari hace zoom al enfocar. */
                  className="h-[54px] w-full rounded-[14px] border border-white/[0.12] bg-white/[0.07] px-[18px] text-[16px] text-white transition-colors placeholder:text-white/35 focus:border-ca-lime focus:outline-none focus:ring-4 focus:ring-ca-lime/15 md:h-[52px] md:text-[15px]"
                />

                <button
                  type="submit"
                  disabled={!puedeEnviar}
                  className={[
                    "mt-4 h-[54px] w-full rounded-full text-[13px] font-bold uppercase tracking-[0.08em] md:mt-5 md:h-[52px]",
                    puedeEnviar
                      ? "ca-btn-lime ca-btn-interactive"
                      : "cursor-not-allowed bg-white/10 text-white/40",
                  ].join(" ")}
                >
                  {enviando ? "Enviando…" : "Pedir entrar"}
                </button>

                {aviso && <p className="mt-3 text-[12px] text-white/70">{aviso}</p>}

                <div className="mt-4 flex items-center gap-2 text-white/40 md:mt-5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                    <path d="M5 11V8a7 7 0 0114 0v3" />
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                  </svg>
                  <span className="text-[11px] leading-snug md:text-[12px]">
                    Nadie entra a la sala sin que el docente lo apruebe.
                  </span>
                </div>
              </form>
            )}

            {estado === "pending" && abierta && (
              <div className="text-center">
                <div className="mx-auto mb-5 h-14 w-14 md:mb-6 md:h-[68px] md:w-[68px]">
                  <svg viewBox="0 0 56 56" className="h-full w-full animate-spin [animation-duration:1.6s]" aria-hidden>
                    <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      fill="none"
                      stroke="#c5f122"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray="38 114"
                    />
                  </svg>
                </div>
                <h2 className="mb-2 text-[20px] font-black tracking-[-0.025em] md:text-[22px]">
                  Estás en la sala de espera
                </h2>
                <p className="text-[13px] leading-relaxed text-white/55">
                  Le avisamos {docente ? `a ${primerNombre(docente)}` : "al docente"} que{" "}
                  <strong className="font-semibold text-white/90">{nombre}</strong> está esperando.
                  No cierres esta página.
                </p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ca-amber" />
                  <span className="text-[12px] text-white/60">Esperando aprobación</span>
                </div>
              </div>
            )}

            {estado === "denied" && (
              <div className="py-2 text-center">
                <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-ca-rose/15">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d14a6b" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </div>
                <h2 className="mb-2 text-[20px] font-black tracking-[-0.025em]">
                  No pudiste entrar
                </h2>
                <p className="text-[13px] leading-relaxed text-white/55">
                  El docente no aceptó tu solicitud para entrar a esta clase.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Iniciales para el avatar: dos como máximo, en mayúscula. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** El aviso de espera se lee mejor con el nombre de pila del docente. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}
