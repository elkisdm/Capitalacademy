"use client";

import { useRef, useState } from "react";
import {
  MessageCircle,
  Bug,
  Sparkles,
  Paperclip,
  X,
  Send,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const PHONE_DISPLAY = "+56 9 9348 1594";
const WHATSAPP = "https://wa.me/56993481594";
const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type Kind = "problem" | "feature";

/** Bloque de soporte: formulario in-app (envía correo al equipo) + WhatsApp directo. */
export function SupportCard() {
  const [kind, setKind] = useState<Kind>("problem");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    const next: File[] = [...files];
    for (const f of incoming) {
      if (!f.type.startsWith("image/")) {
        setError("Solo se permiten imágenes como capturas.");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError("Cada captura debe pesar 5 MB o menos.");
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`Máximo ${MAX_FILES} capturas.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) {
      setError("Cuéntanos un poco más (mínimo 5 caracteres).");
      return;
    }
    setStatus("sending");
    setError(null);

    const body = new FormData();
    body.set("kind", kind);
    body.set("message", message.trim());
    if (typeof window !== "undefined") body.set("pageUrl", window.location.href);
    files.forEach((f) => body.append("files", f));

    try {
      const res = await fetch("/api/support", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "No pudimos enviar tu mensaje. Intenta de nuevo.");
        setStatus("error");
        return;
      }
      setStatus("sent");
      setMessage("");
      setFiles([]);
    } catch {
      setError("Hubo un problema de conexión. Intenta de nuevo.");
      setStatus("error");
    }
  }

  return (
    <div
      className="ca-card relative overflow-hidden p-6 md:p-7"
      style={{ background: "var(--color-ca-ink)", color: "#fff", borderColor: "transparent" }}
    >
      <div className="shape-circle absolute -right-10 -top-10 h-36 w-36 bg-ca-violet opacity-50" />
      <div className="relative">
        <h2 className="text-[20px] font-black tracking-tight">¿Necesitas ayuda?</h2>
        <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-white/70">
          Escríbenos aquí mismo. Tu mensaje (con capturas, si las adjuntas) me llega al correo y
          te respondo. ¿Prefieres hablar? Escríbeme por WhatsApp.
        </p>

        {status === "sent" ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white/[0.08] p-5">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-ca-lime" />
            <div>
              <p className="text-[14px] font-black">¡Mensaje enviado! 🎉</p>
              <p className="mt-1 text-[13px] text-white/70">
                Gracias por escribir. Te responderé al correo de tu cuenta lo antes posible.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-3 text-[12.5px] font-bold text-ca-lime underline-offset-2 hover:underline"
              >
                Enviar otro mensaje
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5">
            {/* Tipo */}
            <div className="inline-flex rounded-2xl bg-white/[0.07] p-1">
              <button
                type="button"
                onClick={() => setKind("problem")}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold transition-colors"
                style={{
                  background: kind === "problem" ? "var(--color-ca-violet)" : "transparent",
                  color: "#fff",
                }}
              >
                <Bug className="h-3.5 w-3.5" />
                Reportar un problema
              </button>
              <button
                type="button"
                onClick={() => setKind("feature")}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold transition-colors"
                style={{
                  background: kind === "feature" ? "var(--color-ca-violet)" : "transparent",
                  color: "#fff",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Solicitar una función
              </button>
            </div>

            {/* Mensaje */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={
                kind === "problem"
                  ? "Cuéntanos qué pasó y dónde. Mientras más detalle, más rápido lo resolvemos."
                  : "Describe la función o mejora que te gustaría ver y para qué te serviría."
              }
              className="mt-3 w-full resize-y rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-white placeholder:text-white/40 outline-none transition-colors focus:border-ca-lime"
            />

            {/* Capturas */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-white/[0.08] disabled:opacity-40"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Adjuntar captura
              </button>
              <span className="text-[11.5px] text-white/40">
                Imágenes, hasta {MAX_FILES} · 5 MB c/u
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full bg-white/[0.1] py-1 pl-3 pr-1.5 text-[11.5px] font-medium text-white"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/30"
                      aria-label="Quitar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {error && <p className="mt-3 text-[12.5px] font-medium text-red-300">{error}</p>}

            {/* Acciones */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center gap-2 rounded-2xl bg-ca-lime px-5 py-3 text-[13.5px] font-black text-ca-ink transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar
                  </>
                )}
              </button>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-[13px] font-bold text-white transition-colors hover:bg-white/[0.08]"
              >
                <MessageCircle className="h-4 w-4 text-ca-lime" />
                WhatsApp {PHONE_DISPLAY}
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
