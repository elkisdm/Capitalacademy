/**
 * Submitea (o lista) la plantilla MARKETING del Diplomado 4ª gen a WhatsApp Cloud API.
 *
 * La plantilla `diplomado_4ta_gen_captacion`:
 *   - Header DOCUMENT = brochure (PDF público en Supabase Storage)
 *   - Body con {{1}} = nombre
 *   - 2 botones URL: "Postular al diplomado" (formulario) y "Hablar con un asesor" (wa.me de Paola)
 *
 * GOTCHA de Meta: al CREAR la plantilla, el header DOCUMENT necesita un *media handle*
 * obtenido vía Resumable Upload API (subiendo el PDF al App), NO una URL pública.
 * La URL pública sí se usa al ENVIAR (eso lo hace send-diplomado-whatsapp.mjs).
 *
 * Uso:
 *   node --env-file=.env scripts/whatsapp-submit-template.mjs --list      # ver estado de plantillas
 *   node --env-file=.env scripts/whatsapp-submit-template.mjs --dry-run   # imprime el JSON sin enviar
 *   node --env-file=.env scripts/whatsapp-submit-template.mjs --submit    # sube brochure + crea plantilla
 */

const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v21.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA_ID = process.env.WHATSAPP_WABA_ID;
const APP_ID = process.env.WHATSAPP_APP_ID;

const TEMPLATE_NAME = "diplomado_4ta_gen_captacion";
const LANG = "es";
const BROCHURE_URL =
  "https://igatsyghbadccbrjiurl.supabase.co/storage/v1/object/public/marketing/brochure-diplomado-4ta-gen.pdf";
const BROCHURE_FILENAME = "Brochure Diplomado 4ta Generacion.pdf";
const FORM_URL = "https://forms.gle/ys1NshZaAjEm8aBY9";
const ASESOR_PHONE = "+56986733726"; // Paola — botón de llamada (Meta no permite wa.me en botones)

const BODY = `Hola {{1}}, ¿cómo estás? Te escribo desde Capital Academy 👋

Hace unas semanas estuviste en nuestra Masterclass Inmobiliaria y dejaste tus datos para recibir información de nuestros próximos programas.

Ya abrimos la 4ª generación del Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria: un programa para asesores que quieren dejar de vender solo propiedades y empezar a asesorar inversiones con criterio financiero y una metodología comercial más profesional.

📅 Parte el sábado 20 de junio · 12 semanas · modalidad híbrida (online + presencial)
🎯 Cupos limitados

Te dejo el brochure adjunto con todo el detalle. Si quieres postular o que un asesor te cuente si calza contigo, usa los botones de aquí abajo.`;

function templateBody(headerHandle) {
  return {
    name: TEMPLATE_NAME,
    language: LANG,
    category: "MARKETING",
    components: [
      {
        type: "HEADER",
        format: "DOCUMENT",
        example: { header_handle: [headerHandle] },
      },
      { type: "BODY", text: BODY, example: { body_text: [["José"]] } },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Postular al diplomado", url: FORM_URL },
          { type: "PHONE_NUMBER", text: "Hablar con un asesor", phone_number: ASESOR_PHONE },
        ],
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
    `https://graph.facebook.com/${VERSION}/${WABA_ID}/message_templates?fields=name,status,language,category&limit=100`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const json = await res.json();
  if (!res.ok) {
    console.error("✗ Error listando plantillas:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`Plantillas en WABA ${WABA_ID}:`);
  for (const t of json.data ?? []) {
    console.log(`  - ${t.name} [${t.language}] ${t.category} → ${t.status}`);
  }
}

/** Resumable Upload: sube el PDF al App y devuelve el handle para el header. */
async function uploadBrochureHandle() {
  if (!APP_ID) {
    console.error("✗ Falta WHATSAPP_APP_ID (necesario para el upload del brochure).");
    process.exit(1);
  }
  console.log("→ Descargando brochure desde Storage…");
  const pdfRes = await fetch(BROCHURE_URL);
  if (!pdfRes.ok) throw new Error(`No se pudo bajar el brochure: HTTP ${pdfRes.status}`);
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`  ${buf.length} bytes`);

  console.log("→ Creando sesión de upload en Meta…");
  const startUrl =
    `https://graph.facebook.com/${VERSION}/${APP_ID}/uploads` +
    `?file_name=${encodeURIComponent(BROCHURE_FILENAME)}` +
    `&file_length=${buf.length}&file_type=application/pdf&access_token=${TOKEN}`;
  const startRes = await fetch(startUrl, { method: "POST" });
  const start = await startRes.json();
  if (!start.id) throw new Error("Sesión de upload falló: " + JSON.stringify(start));

  console.log("→ Subiendo bytes…");
  const upRes = await fetch(`https://graph.facebook.com/${VERSION}/${start.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: buf,
  });
  const up = await upRes.json();
  if (!up.h) throw new Error("Upload de bytes falló: " + JSON.stringify(up));
  console.log(`  handle obtenido: ${String(up.h).slice(0, 24)}…`);
  return up.h;
}

async function submit() {
  requireEnv();
  const handle = await uploadBrochureHandle();
  console.log("→ Creando plantilla MARKETING…");
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/${WABA_ID}/message_templates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(templateBody(handle)),
    }
  );
  const json = await res.json();
  if (!res.ok || json.error) {
    console.error("✗ Error creando plantilla:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log("✓ Plantilla enviada a revisión:", JSON.stringify(json, null, 2));
  console.log("\nRevisa el estado con: node --env-file=.env scripts/whatsapp-submit-template.mjs --list");
  console.log("Cuando diga APPROVED, corre el envío.");
}

const arg = process.argv[2] ?? "--dry-run";
if (arg === "--list") {
  await listTemplates();
} else if (arg === "--submit") {
  await submit();
} else {
  // --dry-run
  console.log("DRY-RUN — definición de la plantilla (header_handle se genera al submitear):\n");
  console.log(JSON.stringify(templateBody("<handle-del-brochure>"), null, 2));
  console.log(`\nBrochure: ${BROCHURE_URL}`);
  console.log("Para submitear de verdad: --submit | Para ver estado: --list");
}
