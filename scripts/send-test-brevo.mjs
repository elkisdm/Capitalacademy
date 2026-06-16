/**
 * Envío de PRUEBA del correo del Diplomado vía Brevo transaccional (/smtp/email).
 *
 * Esto NO es el envío masivo. El blast a los ~196 contactos debe hacerse como
 * CAMPAÑA en el dashboard de Brevo (procesa {{ contact.NOMBRE }} y el
 * unsubscribe legal). Este script solo verifica que:
 *   - la API key funciona,
 *   - el dominio capitalacademy.cl envía con DKIM/SPF correctos,
 *   - el HTML se renderiza bien en un inbox real.
 *
 * Uso:
 *   node --env-file=.env scripts/send-test-brevo.mjs [correo-destino] [nombre]
 * Default: edaza@capitalinteligente.cl / "Elkis"
 */
import { readFileSync } from "node:fs";

const API_KEY = process.env.BREVO_API_KEY;
if (!API_KEY) {
  console.error("✗ BREVO_API_KEY no está en el entorno. Corre con: node --env-file=.env scripts/send-test-brevo.mjs");
  process.exit(1);
}

const to = process.argv[2] ?? "edaza@capitalinteligente.cl";
const name = process.argv[3] ?? "Elkis";

const SENDER = { name: "Capital Academy", email: "academia@capitalacademy.cl" };
const REPLY_TO = { email: "academia@capitalinteligente.cl" };
const SUBJECT = `${name}, abrimos la 4ª generación del Diplomado Inmobiliario`;

// Carga el HTML real y resuelve los merge-tags de campaña para esta prueba.
let html = readFileSync(
  new URL("../docs/marketing/correo-diplomado-4ta-gen.html", import.meta.url),
  "utf8",
);
html = html
  .replaceAll("{{ contact.NOMBRE }}", name)
  .replaceAll("{{ unsubscribe }}", "[En la campaña real, aquí va el link de baja de Brevo]")
  .replaceAll("BROCHURE_URL", "https://capitalacademy.cl"); // placeholder hasta hospedar el PDF

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": API_KEY,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({
    sender: SENDER,
    to: [{ email: to, name }],
    replyTo: REPLY_TO,
    subject: `[PRUEBA] ${SUBJECT}`,
    htmlContent: html,
    tags: ["prueba-diplomado-4ta"],
  }),
});

const body = await res.text();
if (res.ok) {
  console.log(`✓ Enviado a ${to} desde ${SENDER.email}`);
  console.log("  Respuesta Brevo:", body);
} else {
  console.error(`✗ Brevo respondió ${res.status}`);
  console.error("  ", body);
  process.exit(1);
}
