/**
 * Submitea (o lista) la plantilla `liderazgo_reunion_directora` en WhatsApp Cloud API.
 *
 * Es la invitación automática a una reunión de 15 minutos con la directora
 * académica que recibe cada lead al inscribirse en /liderazgo (ADR-0040). Se
 * envía desde `lib/whatsapp/invitacion-reunion-liderazgo.ts`.
 *
 * Por qué plantilla y no texto libre: el lead nunca nos escribió, así que no hay
 * ventana de 24 horas y Meta rechaza cualquier mensaje que no sea una plantilla
 * aprobada.
 *
 * El botón apunta a /agendar/liderazgo (redirect propio) y no a la página de
 * citas de Google: cambiar el destino no obliga a pedir aprobación de nuevo.
 *
 * Uso:
 *   node --env-file=.env scripts/whatsapp-submit-template-liderazgo.mjs --list
 *   node --env-file=.env scripts/whatsapp-submit-template-liderazgo.mjs --dry-run
 *   node --env-file=.env scripts/whatsapp-submit-template-liderazgo.mjs --submit
 */

const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v21.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID = process.env.WHATSAPP_WABA_ID;

export const TEMPLATE_NAME = "liderazgo_reunion_directora";
const LANG = "es";
const AGENDA_URL = "https://capitalacademy.cl/agendar/liderazgo";

const BODY = `Hola {{1}} 👋 Te escribimos desde Capital Academy: recibimos tu inscripción al Programa de Liderazgo.

Queremos invitarte a una reunión breve de 15 minutos con Paola Vicuña, nuestra directora académica, para contarte de qué se trata el programa, qué vas a encontrar y resolver todas tus dudas.

Elige el horario que más te acomode en el botón de abajo.`;

function templateBody() {
  return {
    name: TEMPLATE_NAME,
    language: LANG,
    category: "UTILITY",
    components: [
      { type: "BODY", text: BODY, example: { body_text: [["Ana"]] } },
      {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: "Agendar mi reunión", url: AGENDA_URL }],
      },
    ],
  };
}

function requireEnv() {
  const missing = [];
  if (!TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!WABA_ID) missing.push("WHATSAPP_WABA_ID");
  if (missing.length) {
    console.error(`✗ Faltan variables: ${missing.join(", ")}. Corre con: node --env-file=.env ...`);
    process.exit(1);
  }
}

async function listTemplates() {
  requireEnv();
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/${WABA_ID}/message_templates?fields=name,status,language,category,rejected_reason&name=${TEMPLATE_NAME}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const json = await res.json();
  if (!res.ok) {
    console.error("✗ Error listando plantillas:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  if (!json.data?.length) {
    console.log(`La plantilla ${TEMPLATE_NAME} no existe todavía en el WABA ${WABA_ID}.`);
    return;
  }
  for (const t of json.data) {
    console.log(`  - ${t.name} [${t.language}] ${t.category} → ${t.status}${t.rejected_reason && t.rejected_reason !== "NONE" ? ` (${t.rejected_reason})` : ""}`);
  }
}

async function submit() {
  requireEnv();
  console.log("→ Creando plantilla UTILITY…");
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(templateBody()),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("✗ Meta rechazó la creación:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`✓ Plantilla creada: id ${json.id}, estado ${json.status}, categoría ${json.category}`);
  console.log("  Revisa el estado con --list; el envío solo funciona cuando figure APPROVED.");
}

const arg = process.argv[2];
if (arg === "--list") await listTemplates();
else if (arg === "--dry-run") console.log(JSON.stringify(templateBody(), null, 2));
else if (arg === "--submit") await submit();
else {
  console.log("Uso: --list | --dry-run | --submit");
  process.exit(1);
}
