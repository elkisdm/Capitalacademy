import { createClient } from "@/lib/supabase/server";
import { TZ_CHILE } from "@/lib/time";

/**
 * Historial de los correos de ACCESO de una persona (bitácora 0082).
 *
 * Existe para que soporte pueda responder "¿le llegó el enlace?" sin abrir la
 * base de datos. La respuesta del endpoint es genérica a propósito —no delata
 * qué correos tienen cuenta—, así que sin esta vista un envío fallido o un
 * correo mal tecleado eran indistinguibles de "no me llegó nada".
 *
 * Consulta con el cliente de sesión, no con service_role: la policy de
 * `access_email_log` ya restringe la lectura a staff (is_platform_staff), y la
 * página que lo monta valida ops/admin antes de renderizar.
 */

const STATUS_LABEL: Record<string, string> = {
  sent: "Enviado",
  failed: "Falló el envío",
  no_account: "Sin cuenta con ese correo",
};

const DELIVERY_LABEL: Record<string, string> = {
  delivered: "Entregado",
  bounced: "Rebotó",
  complained: "Marcado como spam",
};

/** Verde solo cuando el correo llegó de verdad; ámbar mientras no se sepa. */
function toneFor(status: string, delivery: string | null): string {
  if (status === "failed" || delivery === "bounced") return "#dc2626";
  if (delivery === "delivered") return "#16a34a";
  if (status === "no_account") return "#9b9db5";
  return "#d97706";
}

function formatChile(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: TZ_CHILE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function AccessHistory({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const supabase = await createClient();

  /*
    Se busca por user_id Y por correo: los intentos con el correo mal escrito no
    tienen user_id, y son justamente el caso que soporte necesita ver.

    El valor se interpola dentro de la expresión de filtro de PostgREST, donde
    una coma o un paréntesis cambiarían la consulta. Un correo legítimo no los
    tiene, así que se cae al filtro por user_id en vez de construir la expresión
    con un valor que no se puede citar.
  */
  const normalizedEmail = email.trim().toLowerCase();
  const emailIsFilterSafe = /^[^,()"\s]+$/.test(normalizedEmail);

  const query = supabase
    .from("access_email_log")
    .select("id, email, status, error, delivery_status, delivered_at, created_at");

  const { data: rows } = await (emailIsFilterSafe
    ? query.or(`user_id.eq.${userId},email.eq.${normalizedEmail}`)
    : query.eq("user_id", userId)
  )
    .order("created_at", { ascending: false })
    .limit(15);

  return (
    <section className="ca-card mt-6 p-6">
      <h2 className="text-[15px] font-black tracking-tight" style={{ color: "var(--color-ca-ink)" }}>
        Historial de acceso
      </h2>
      <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
        Enlaces de acceso pedidos por esta persona, del más reciente al más antiguo.
      </p>

      {!rows || rows.length === 0 ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--color-ca-ink-soft)" }}>
          Todavía no ha pedido ningún enlace de acceso.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => {
            const tone = toneFor(row.status, row.delivery_status);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3 last:border-b-0 last:pb-0"
                style={{ borderColor: "#f0f0f3" }}
              >
                <div>
                  <p className="text-[13px] font-bold" style={{ color: tone }}>
                    {STATUS_LABEL[row.status] ?? row.status}
                    {row.delivery_status
                      ? ` · ${DELIVERY_LABEL[row.delivery_status] ?? row.delivery_status}`
                      : ""}
                  </p>
                  {row.email.toLowerCase() !== email.toLowerCase() && (
                    <p className="text-[12px]" style={{ color: "var(--color-ca-ink-soft)" }}>
                      Lo pidió escribiendo <strong>{row.email}</strong>
                    </p>
                  )}
                  {row.error && (
                    <p className="text-[12px]" style={{ color: "#dc2626" }}>
                      {row.error}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--color-ca-ink-soft)" }}>
                    {formatChile(row.created_at)}
                  </p>
                  {row.delivered_at && (
                    <p className="text-[11px]" style={{ color: "var(--color-ca-ink-soft)" }}>
                      Entregado {formatChile(row.delivered_at)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
