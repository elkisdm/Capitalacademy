import { describe, it, expect } from "vitest";
import { buildSessionReminderEmail, type SessionReminderInput } from "@/lib/email/session-reminder";

function baseInput(overrides: Partial<SessionReminderInput> = {}): SessionReminderInput {
  return {
    email: "ana@example.com",
    fullName: "Ana Soto",
    sessionTitle: "Módulo 3: Cierre de venta",
    startsAtIso: "2026-07-24T15:00:00.000Z", // 11:00 hrs Chile
    endsAtIso: "2026-07-24T17:00:00.000Z", // 13:00 hrs Chile
    modality: "live_online",
    meetingUrl: "https://meet.example.com/room-1",
    teacherName: "Paola Vicuña",
    kind: "24h",
    ...overrides,
  };
}

describe("buildSessionReminderEmail", () => {
  it("camino feliz: arma subject, html y text a partir del input", () => {
    const result = buildSessionReminderEmail(baseInput());

    expect(result.subject).toBe("Recordatorio: Mañana tienes Módulo 3: Cierre de venta");
    expect(result.html).toContain("Módulo 3: Cierre de venta");
    expect(result.text).toContain("Módulo 3: Cierre de venta");
  });

  // --- subjectFor: kind determina "Hoy" vs "Mañana" -------------------------

  it("subject con kind '1h': usa 'Hoy'", () => {
    const result = buildSessionReminderEmail(baseInput({ kind: "1h" }));
    expect(result.subject).toBe("Recordatorio: Hoy tienes Módulo 3: Cierre de venta");
  });

  it("subject con kind '24h': usa 'Mañana'", () => {
    const result = buildSessionReminderEmail(baseInput({ kind: "24h" }));
    expect(result.subject).toBe("Recordatorio: Mañana tienes Módulo 3: Cierre de venta");
  });

  // --- antelacionLabel: mensaje según kind, presente en html y text --------

  it("kind '1h': el cuerpo avisa que la clase empieza en ~1 hora", () => {
    const result = buildSessionReminderEmail(baseInput({ kind: "1h" }));
    expect(result.html).toContain("Tu clase comienza en aproximadamente 1 hora.");
    expect(result.text).toContain("Tu clase comienza en aproximadamente 1 hora.");
  });

  it("kind '24h': el cuerpo avisa que la clase es mañana", () => {
    const result = buildSessionReminderEmail(baseInput({ kind: "24h" }));
    expect(result.html).toContain("Tu clase es mañana. Te dejamos los detalles para que la agendes.");
    expect(result.text).toContain("Tu clase es mañana. Te dejamos los detalles para que la agendes.");
  });

  // --- modalityLabel: switch completo (4 ramas) -----------------------------

  it("modalidad 'live_in_person': etiqueta 'Presencial'", () => {
    const result = buildSessionReminderEmail(baseInput({ modality: "live_in_person" }));
    expect(result.html).toContain("Presencial");
    expect(result.text).toContain("Modalidad: Presencial");
  });

  it("modalidad 'live_online': etiqueta 'Online (en vivo)'", () => {
    const result = buildSessionReminderEmail(baseInput({ modality: "live_online" }));
    expect(result.html).toContain("Online (en vivo)");
    expect(result.text).toContain("Modalidad: Online (en vivo)");
  });

  it("modalidad 'recorded': etiqueta 'Grabada'", () => {
    const result = buildSessionReminderEmail(baseInput({ modality: "recorded" }));
    expect(result.html).toContain("Grabada");
    expect(result.text).toContain("Modalidad: Grabada");
  });

  it("modalidad desconocida: usa el valor crudo como fallback (rama default)", () => {
    const result = buildSessionReminderEmail(baseInput({ modality: "hybrid" }));
    expect(result.html).toContain(">hybrid<");
    expect(result.text).toContain("Modalidad: hybrid");
  });

  // --- CTA / nota / enlace: depende de isOnline() + meetingUrl --------------

  it("online con meetingUrl: muestra el botón 'Unirme a la clase' con el link escapado", () => {
    const result = buildSessionReminderEmail(
      baseInput({ modality: "live_online", meetingUrl: "https://meet.example.com/sala?x=1&y=2" }),
    );

    expect(result.html).toContain("Unirme a la clase");
    expect(result.html).toContain('href="https://meet.example.com/sala?x=1&amp;y=2"');
    expect(result.html).toContain("El botón te lleva directo a la sala. Conéctate unos minutos antes.");
    expect(result.text).toContain("Enlace de conexión: https://meet.example.com/sala?x=1&y=2");
  });

  it("online sin meetingUrl: no hay botón y avisa que el link estará en la plataforma", () => {
    const result = buildSessionReminderEmail(
      baseInput({ modality: "live_online", meetingUrl: null }),
    );

    expect(result.html).not.toContain("Unirme a la clase");
    expect(result.html).toContain(
      "Esta clase es online. El enlace de conexión estará disponible en tu calendario dentro de la plataforma.",
    );
    expect(result.text).toContain(
      "El enlace de conexión estará disponible en tu calendario dentro de la plataforma.",
    );
    expect(result.text).not.toContain("Enlace de conexión:");
  });

  it("presencial con meetingUrl seteado igual: no muestra botón ni usa el link (isOnline manda, no meetingUrl)", () => {
    const result = buildSessionReminderEmail(
      baseInput({ modality: "live_in_person", meetingUrl: "https://meet.example.com/no-deberia-salir" }),
    );

    expect(result.html).not.toContain("Unirme a la clase");
    expect(result.html).not.toContain("meet.example.com/no-deberia-salir");
    expect(result.html).toContain(
      "Esta clase es presencial. Revisa la ubicación y los materiales en tu calendario dentro de la plataforma.",
    );
    expect(result.text).toContain(
      "Clase presencial. Revisa la ubicación y materiales en tu calendario dentro de la plataforma.",
    );
  });

  it("grabada (recorded) sin meetingUrl: rama 'no online' de la nota/CTA", () => {
    const result = buildSessionReminderEmail(baseInput({ modality: "recorded", meetingUrl: null }));

    expect(result.html).not.toContain("Unirme a la clase");
    expect(result.html).toContain("Esta clase es presencial.");
  });

  // --- teacherRow / línea "Docente": presente o ausente ----------------------

  it("con teacherName: agrega la fila 'Docente' en html y la línea 'Docente:' en text", () => {
    const result = buildSessionReminderEmail(baseInput({ teacherName: "Paola Vicuña" }));

    expect(result.html).toContain("Docente");
    expect(result.html).toContain("Paola Vicuña");
    expect(result.text).toContain("Docente: Paola Vicuña");
  });

  it("teacherName null: omite la fila 'Docente' en html y la línea en text", () => {
    const result = buildSessionReminderEmail(baseInput({ teacherName: null }));

    expect(result.html).not.toContain(">Docente<");
    expect(result.text).not.toContain("Docente:");
  });

  // --- firstName: primer token del fullName ----------------------------------

  it("fullName con varios nombres: saluda solo con el primer nombre", () => {
    const result = buildSessionReminderEmail(baseInput({ fullName: "Ana Sofía Soto Pérez" }));

    expect(result.html).toContain("Hola, Ana");
    expect(result.text).toContain("Hola, Ana.");
  });

  it("fullName vacío: saluda sin nombre (sin coma)", () => {
    const result = buildSessionReminderEmail(baseInput({ fullName: "" }));

    expect(result.html).toContain("Hola 👋");
    expect(result.html).not.toContain("Hola,");
    expect(result.text).toContain("Hola.");
    expect(result.text).not.toContain("Hola,");
  });

  it("fullName con espacio inicial: igual saluda con el primer nombre", () => {
    const result = buildSessionReminderEmail(baseInput({ fullName: " Ana Soto" }));

    expect(result.html).toContain("Hola, Ana");
    expect(result.text).toContain("Hola, Ana.");
  });

  // --- fecha y hora: formato es-CL en America/Santiago ------------------------

  it("formatea fecha y horario en es-CL / America/Santiago", () => {
    const result = buildSessionReminderEmail(
      baseInput({
        startsAtIso: "2026-07-24T15:00:00.000Z",
        endsAtIso: "2026-07-24T17:30:00.000Z",
      }),
    );

    expect(result.html).toContain("viernes, 24 de julio");
    expect(result.html).toContain("11:00 – 13:30 hrs (Chile)");
    expect(result.text).toContain("Fecha: viernes, 24 de julio");
    expect(result.text).toContain("Horario: 11:00 – 13:30 hrs (Chile)");
  });

  // --- esc(): escapa HTML solo en el cuerpo html, no en text -----------------

  it("escapa caracteres especiales del título y del nombre del docente en el html", () => {
    const result = buildSessionReminderEmail(
      baseInput({
        sessionTitle: `<script>alert("x")</script> & Tips`,
        teacherName: `O'Brien <b>Jefe</b>`,
      }),
    );

    expect(result.html).not.toContain('<script>alert("x")</script>');
    expect(result.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Tips");
    expect(result.html).toContain("O&#39;Brien &lt;b&gt;Jefe&lt;/b&gt;");
    // El texto plano no escapa: va tal cual.
    expect(result.text).toContain(`Clase: <script>alert("x")</script> & Tips`);
  });

  it("incluye el email destinatario solo como dato del input (no se usa dentro del contenido)", () => {
    // `email` es parte del input pero no se renderiza en el cuerpo del correo;
    // lo arma el llamador (send-batch) al construir el BatchMessage.
    const result = buildSessionReminderEmail(baseInput({ email: "otra@example.com" }));
    expect(result.html).not.toContain("otra@example.com");
    expect(result.text).not.toContain("otra@example.com");
  });
});
