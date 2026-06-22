import { Mail, MessageCircle, Bug, Sparkles } from "lucide-react";

const EMAIL = "edaza@capitalinteligente.cl";
const PHONE_DISPLAY = "+56 9 9348 1594";
const WHATSAPP = "https://wa.me/56993481594";

function mailto(subject: string) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Bloque de soporte persistente: contacto, reportar problema, pedir función. */
export function SupportCard() {
  return (
    <div
      className="ca-card relative overflow-hidden p-6 md:p-7"
      style={{ background: "var(--color-ca-ink)", color: "#fff", borderColor: "transparent" }}
    >
      <div className="shape-circle absolute -right-10 -top-10 h-36 w-36 bg-ca-violet opacity-50" />
      <div className="relative">
        <h2 className="text-[20px] font-black tracking-tight">¿Necesitas ayuda?</h2>
        <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-white/70">
          Si algo no está aquí, no funciona como esperabas, o quieres proponer una mejora,
          escríbeme directamente. Te respondo.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a
            href={mailto("Consulta de soporte — Capital Academy")}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.14]"
          >
            <Mail className="h-5 w-5 shrink-0 text-ca-lime" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Correo</div>
              <div className="truncate text-[13.5px] font-bold">{EMAIL}</div>
            </div>
          </a>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.14]"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-ca-lime" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">WhatsApp</div>
              <div className="truncate text-[13.5px] font-bold">{PHONE_DISPLAY}</div>
            </div>
          </a>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={mailto("Reportar un problema — Capital Academy")}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.08]"
          >
            <Bug className="h-3.5 w-3.5" />
            Reportar un problema
          </a>
          <a
            href={mailto("Solicitar una nueva función — Capital Academy")}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.08]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Solicitar una función
          </a>
        </div>
      </div>
    </div>
  );
}
