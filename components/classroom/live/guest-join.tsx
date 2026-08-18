"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveClassRoom } from "./live-class-room";

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

export function GuestJoin({ code, titulo }: { code: string; titulo: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  if (estado === "approved") {
    return <LiveClassRoom sessionId={code} fill userName={nombre} />;
  }

  return (
    <div className="flex h-full items-center justify-center rounded-[18px] bg-white/5 p-6">
      <div className="w-full max-w-sm text-center">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
          {titulo}
        </p>

        {estado === "cargando" && <p className="text-[14px] text-white/70">Un momento…</p>}

        {estado === "error" && (
          <p className="text-[14px] text-white/70">
            No pudimos cargar esta sala. Vuelve a intentarlo en un minuto.
          </p>
        )}

        {estado === "none" && (
          <form onSubmit={pedir}>
            <h1 className="mb-1 text-[18px] font-black tracking-tight text-white">
              ¿Cómo te llamas?
            </h1>
            <p className="mb-4 text-[13px] text-white/60">
              El docente verá tu nombre para dejarte entrar.
            </p>
            <input
              type="text"
              value={nombre}
              onChange={(ev) => setNombre(ev.target.value)}
              placeholder="Tu nombre"
              maxLength={40}
              required
              autoFocus
              className="mb-3 w-full rounded-xl bg-white/10 px-4 py-3 text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-ca-lime"
            />
            <button
              type="submit"
              disabled={enviando || nombre.trim().length < 2}
              className="ca-btn-lime ca-btn-interactive w-full px-4 py-3 text-[13px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Pedir entrar"}
            </button>
            {aviso && <p className="mt-3 text-[12px] text-white/70">{aviso}</p>}
          </form>
        )}

        {estado === "pending" && (
          <>
            <h1 className="mb-1 text-[18px] font-black tracking-tight text-white">
              Esperando que te dejen entrar
            </h1>
            <p className="text-[13px] text-white/60">
              Le avisamos al docente que {nombre} está esperando. No cierres esta página.
            </p>
          </>
        )}

        {estado === "denied" && (
          <>
            <h1 className="mb-1 text-[18px] font-black tracking-tight text-white">
              No pudiste entrar
            </h1>
            <p className="text-[13px] text-white/60">
              El docente no aceptó tu solicitud para entrar a esta clase.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
