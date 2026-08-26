// Aviso personalizado del Examen Final de Role Play (Diplomado G4).
//
// El examen se rinde en DOS sábados con la mitad del curso cada uno, y varias
// personas además hacen de CLIENTE para otro grupo en un horario distinto al
// suyo. El recordatorio automático de la plataforma solo sabe la fecha de la
// sesión, así que no puede decir "tú rindes a las 11:00 y además eres cliente a
// las 9:30" — que es justo donde está el riesgo de que alguien llegue a la hora
// equivocada a su examen final.
//
// Este correo lo dice por persona. La segmentación por fecha de los
// recordatorios automáticos va aparte, por `attendee_student_ids` (0106).
//
// Fuente: programación enviada por Paola el 2026-08-26.
//
// Modos:
//   node scripts/aviso-roleplay-final.mjs --dry-run   -> imprime qué recibiría cada uno
//   node scripts/aviso-roleplay-final.mjs preview     -> una muestra real a PREVIEW_TO
//   node scripts/aviso-roleplay-final.mjs send        -> envío real
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const PREVIEW_TO = "edaza@capitalinteligente.cl";
const SENT_LOG = join(__dirname, ".sent-roleplay-final.json");
const SEND_DELAY_MS = 280;

// Nombre tal como lo escribió Paola; el correo es la identidad en la plataforma.
const P = {
  dahia: ["Dahia Jerez", "djerez@capitalinteligente.cl"],
  nicole: ["Nicole Alzérreca", "nicolealzerreca18@gmail.com"],
  daphny: ["Daphny Sotelo", "daphnysotelo@gmail.com"],
  rodrigo: ["Rodrigo Molina", "rodrigomolina25@gmail.com"],
  alejandra: ["Alejandra Colmenares", "acolmenares@capitalinteligente.cl"],
  karen: ["Karen Quezada", "kquezada@capitalinteligente.cl"],
  denise: ["Denise Labbé", "denilabbe@gmail.com"],
  alvaro: ["Álvaro Vicuña", "alvarovicu@aol.com"],
  felipe: ["Felipe Gamboa", "fgamboa@capitalinteligente.cl"],
  patricia: ["Patricia Maldonado", "pmaldonado@capitalinteligente.cl"],
  lorena: ["Lorena Segura", "lsegura@exxacon.cl"],
  juanpablo: ["Juan Pablo Echegaray", "jpechegaray@gmail.com"],
  nancy: ["Nancy Jaques", "njaques@capitalinteligente.cl"],
  carlos: ["Carlos Bórquez", "cborquez@capitalinteligente.cl"],
  tamara: ["Tamara Rubilar", "trubilar01@gmail.com"],
  claudia: ["Claudia Cardona", "ccardona@capitalinteligente.cl"],
  aracelli: ["Aracelli Cordero", "acorderoc@capitalinteligente.cl"],
  yorbyn: ["Yorbyn Hernández", "yorbynhernandez@gmail.com"],
  alejandro: ["Alejandro Nuñez", "alejandro.nunezbrito@gmail.com"],
};

// El índice de cada bloque es su orden cronológico dentro de la jornada. Se usa
// para decidir si el turno de cliente cae antes o después del propio examen:
// comparar los horarios como texto da vuelta el resultado ("9:30" ordena
// DESPUÉS de "11:00"), y eso le diría a quien tiene que llegar temprano que se
// quede hasta el final.
const BLOQUES = [
  { fecha: "sábado 29 de agosto", grupo: "Grupo 3", horario: "9:30 a 11:00", rinden: ["dahia", "nicole", "daphny"], cliente: "rodrigo" },
  { fecha: "sábado 29 de agosto", grupo: "Grupo 2", horario: "11:00 a 12:30", rinden: ["rodrigo", "alejandra", "karen"], cliente: "nicole" },
  { fecha: "sábado 29 de agosto", grupo: "Grupo 5", horario: "12:30 a 14:00", rinden: ["denise", "alvaro", "felipe", "patricia"], cliente: "alejandra" },
  { fecha: "sábado 5 de septiembre", grupo: "Grupo 6", horario: "9:30 a 11:00", rinden: ["lorena", "juanpablo", "nancy"], cliente: "tamara" },
  { fecha: "sábado 5 de septiembre", grupo: "Grupo 1", horario: "11:00 a 12:30", rinden: ["carlos", "tamara", "claudia"], cliente: "juanpablo" },
  { fecha: "sábado 5 de septiembre", grupo: "Grupo 4", horario: "12:30 a 14:00", rinden: ["aracelli", "yorbyn", "alejandro"], cliente: "claudia" },
];

// Una ficha por persona: dónde rinde y, si aplica, de qué grupo es cliente.
const fichas = new Map();
for (const [orden, b] of BLOQUES.entries()) {
  for (const clave of b.rinden) {
    const f = fichas.get(clave) ?? { clave, rinde: null, rindeOrden: null, cliente: null, clienteOrden: null };
    f.rinde = b;
    f.rindeOrden = orden;
    fichas.set(clave, f);
  }
}
for (const [orden, b] of BLOQUES.entries()) {
  const f = fichas.get(b.cliente);
  if (!f) throw new Error(`El cliente ${b.cliente} de ${b.grupo} no rinde en ningún grupo`);
  f.cliente = b;
  f.clienteOrden = orden;
}

// Guardia: la programación tiene que cubrir a todos y a nadie dos veces.
const total = new Set(BLOQUES.flatMap((b) => b.rinden));
if (total.size !== Object.keys(P).length) {
  throw new Error(`Programación incompleta: ${total.size} personas rinden de ${Object.keys(P).length}`);
}
for (const [clave, f] of fichas) {
  if (f.cliente && f.cliente.fecha !== f.rinde.fecha) {
    throw new Error(`${clave} rinde el ${f.rinde.fecha} pero es cliente el ${f.cliente.fecha}`);
  }
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function contenido(f) {
  const [nombre] = P[f.clave];
  const primer = nombre.split(" ")[0];
  const companeros = f.rinde.rinden.filter((c) => c !== f.clave).map((c) => P[c][0]);
  const esCliente = Boolean(f.cliente);
  const clienteAntes = esCliente && f.clienteOrden < f.rindeOrden;

  const filas = [
    ["Fecha", f.rinde.fecha],
    ["Tu horario", `${f.rinde.horario} h`],
    ["Tu grupo", f.rinde.grupo],
    ["Rindes con", companeros.join(", ")],
  ];

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
        <tr><td align="center" style="padding:32px 28px;background:#14163a;">
          <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;" />
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Examen Final &middot; Role Play</p>
        </td></tr>
        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:800;">Hola, ${esc(primer)}:</h1>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#3a3d5c;">Esta es <strong>tu</strong> programación del Examen Final de Role Play — Línea de Venta completa. Te la enviamos personalizada para que no tengas que buscarte en la lista.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 14px 0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">Rindes el ${esc(f.rinde.fecha)}, de ${esc(f.rinde.horario)} h</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
${filas.map(([k, v]) => `                <tr><td style="padding:7px 0;font-size:13px;color:#9b9db5;width:120px;vertical-align:top;">${esc(k)}</td><td style="padding:7px 0;font-size:14px;color:#14163a;font-weight:600;">${esc(v)}</td></tr>`).join("\n")}
              </table>
            </td></tr>
          </table>
        </td></tr>
${esCliente ? `        <tr><td style="padding:12px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8e6;border:1px solid #f0e0b8;border-radius:12px;">
            <tr><td style="padding:18px 22px;">
              <p style="margin:0 0 8px 0;font-size:15px;font-weight:800;color:#14163a;">Además, eres CLIENTE del ${esc(f.cliente.grupo)}</p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">Te toca asumir ese rol de <strong>${esc(f.cliente.horario)} h</strong>, así que ${clienteAntes ? "debes <strong>llegar antes</strong> de tu propio examen" : "debes <strong>quedarte después</strong> de rendir"}. Reserva la jornada completa.</p>
            </td></tr>
          </table>
        </td></tr>` : ""}
        <tr><td style="padding:16px 32px 24px 32px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;">Te pedimos máxima puntualidad para que cada evaluación se desarrolle con tranquilidad y sin atrasos. Si tienes cualquier duda con tu horario, escríbenos antes del día del examen.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl/classroom" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texto = [
    `Hola, ${primer}:`,
    "",
    "Esta es tu programación del Examen Final de Role Play — Línea de Venta completa.",
    "",
    `Rindes el ${f.rinde.fecha}, de ${f.rinde.horario} h.`,
    `Tu grupo: ${f.rinde.grupo}`,
    `Rindes con: ${companeros.join(", ")}`,
    ...(esCliente
      ? [
          "",
          `ADEMÁS eres CLIENTE del ${f.cliente.grupo}, de ${f.cliente.horario} h.`,
          clienteAntes ? "Debes llegar antes de tu propio examen." : "Debes quedarte después de rendir.",
          "Reserva la jornada completa.",
        ]
      : []),
    "",
    "Te pedimos máxima puntualidad. Si tienes dudas con tu horario, escríbenos antes del día del examen.",
    "",
    "Capital Academy · capitalacademy.cl/classroom",
  ].join("\n");

  const asunto = `Tu examen de Role Play: ${f.rinde.fecha}, ${f.rinde.horario} h${esCliente ? " (y eres cliente)" : ""}`;
  return { asunto, html, texto };
}

const modo = process.argv[2] ?? "--dry-run";
const orden = [...fichas.values()].sort((a, b) =>
  `${a.rinde.fecha}${a.rinde.horario}`.localeCompare(`${b.rinde.fecha}${b.rinde.horario}`),
);

console.log(`Personas programadas: ${orden.length}\n`);
for (const f of orden) {
  const [nombre, email] = P[f.clave];
  const { asunto } = contenido(f);
  console.log(`${nombre} <${email}>`);
  console.log(`  ${asunto}`);
  if (f.cliente) {
    const cuando = f.clienteOrden < f.rindeOrden ? "ANTES" : "DESPUÉS";
    console.log(`  → cliente del ${f.cliente.grupo}, de ${f.cliente.horario} h (${cuando} de su examen)`);
  }
}

if (modo === "--dry-run") {
  console.log("\nCorrida en seco. No se envió nada.");
  process.exit(0);
}

async function enviar(to, { asunto, html, texto }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to, subject: asunto, html, text: texto }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

if (modo === "preview") {
  // Se manda la ficha de alguien que ADEMÁS es cliente, que es el caso difícil.
  const muestra = orden.find((f) => f.cliente);
  const id = await enviar(PREVIEW_TO, contenido(muestra));
  console.log(`\nMuestra (${P[muestra.clave][0]}) enviada a ${PREVIEW_TO} (${id}).`);
  process.exit(0);
}

if (modo !== "send") {
  console.error(`\nModo desconocido: ${modo}`);
  process.exit(1);
}

const yaEnviado = existsSync(SENT_LOG) ? JSON.parse(readFileSync(SENT_LOG, "utf8")) : {};
let ok = 0;
let fallos = 0;
for (const f of orden) {
  const [nombre, email] = P[f.clave];
  if (yaEnviado[email]) {
    console.log(`saltado (ya recibió) ${email}`);
    continue;
  }
  try {
    const id = await enviar(email, contenido(f));
    yaEnviado[email] = { id, at: new Date().toISOString() };
    writeFileSync(SENT_LOG, JSON.stringify(yaEnviado, null, 2));
    ok++;
    console.log(`enviado ${nombre} <${email}>`);
  } catch (err) {
    fallos++;
    console.error(`FALLÓ ${email}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
}
console.log(`\nListo: ${ok} enviados, ${fallos} fallidos.`);
