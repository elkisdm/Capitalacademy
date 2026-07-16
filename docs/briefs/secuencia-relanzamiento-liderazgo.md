# Borrador — Secuencia de relanzamiento del Programa de Liderazgo

> Estado: **borrador para revisión — NO enviar** · Fecha: 2026-07-16 · Origen: acuerdo de la
> reunión con la profe (7-jul-2026), punto 8 ([[project-reunion-profe-2026-07-07]])
> Este documento es solo contenido. No se ha tocado Brevo, Resend ni ningún proveedor de envío.

## 1. Estrategia (5 líneas)

- **Objetivo**: reactivar la matrícula del Programa de Liderazgo y Gestión de Equipos
  Comerciales (cohorte G1 solo llegó a 6 de ~10-12 cupos y quedó pausada), llevando tráfico
  calificado al checkout `https://capitalacademy.cl/pago/liderazgo`.
- **Audiencia**: base de contactos de Capital Inteligente/Capital Academy que ya pasó por la
  Masterclass o el Workshop inmobiliario (~200 contactos), corredores de propiedades e
  inversionistas inmobiliarios en Chile — muchos ya conocen la marca pero no el programa de
  Liderazgo específicamente.
- **Cadencia (3 correos)**: Correo 1 — anuncio y propuesta de valor (día 0); Correo 2 —
  temario + docentes + prueba social (día 3-4); Correo 3 — objeciones y cierre honesto, sin
  fecha límite artificial (día 7-8).
- **Tono**: profesional, cercano, sin superlativos vacíos. Se apoya en datos reales del
  programa (precio, temario, docentes) y evita presión de urgencia que no existe.
- **Métrica de éxito**: clics al checkout por correo (CTR) y matrículas completadas
  atribuibles a la secuencia; referencia mínima razonable: 2-4 matrículas nuevas cerrando el
  embudo de ~200 contactos (no hay benchmark previo de esta secuencia con el que comparar).

**Nota operativa importante — requiere decisión antes de enviar:** la cohorte G1 ya inició
(primera jornada 10-jul, la segunda es este viernes 17-jul). Este borrador está escrito en
modo genérico ("cohorte" sin comprometer fecha de inicio, tal como ya hace la página de
checkout: *"cada cohorte tiene fecha confirmada que te enviamos por email apenas finalizas tu
inscripción"*), porque no me consta si la intención es (a) completar los cupos que quedan en
G1 —el interesado entraría con la primera jornada ya grabada— o (b) preventa/lista de espera
para una G2 sin fecha aún. Ver placeholder `[[COMPLETAR: cohorte y fechas]]` en el Correo 1.

---

## 2. Los 3 correos

Plantilla HTML reutilizando el estilo de casa ya usado en `lib/email/diplomado-invitation.ts`
(header `#14163a`, eyebrow lima `#c5f122`, CTA violeta `#5e17eb`, cuerpo `#3a3d5c`), compatible
con el editor de campañas de Brevo. Merge tag de nombre: `{{ contact.NOMBRE }}` (atributo
`NOMBRE` en Brevo, confirmado en uso).

### Correo 1 — Anuncio y propuesta de valor

**Asunto**: `{{ contact.NOMBRE }}, ¿tu equipo comercial rinde a la altura de tus metas?`
**Asunto alternativo (A/B)**: `Liderar un equipo comercial no debería ser a puro instinto`

**Preheader**: `Un programa presencial de 4 jornadas para jefaturas y líderes de equipos comerciales inmobiliarios.`

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Programa de Liderazgo</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:23px;line-height:1.3;color:#14163a;font-weight:800;">Hola {{ contact.NOMBRE }}, ¿tu equipo comercial rinde a la altura de tus metas?</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Crecer un equipo comercial inmobiliario no se resuelve solo con más presión ni más metas: se resuelve con sistema. Por eso creamos el <strong>Programa de Liderazgo y Gestión de Equipos Comerciales</strong> de Capital Academy: 4 jornadas presenciales para jefaturas y líderes que necesitan atraer talento, ordenar la gestión de su equipo y sostener resultados en el tiempo.</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Está pensado para jefaturas comerciales, líderes de equipo y profesionales que están construyendo o fortaleciendo un equipo de venta inmobiliaria.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Qué te llevas</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#127942;</td><td style="padding:5px 0;">Diploma certificado de Capital Academy.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128101;</td><td style="padding:5px 0;">Acceso a la comunidad Capital Inteligente.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#127909;</td><td style="padding:5px 0;">Sesiones en vivo, grabadas para revisar a tu ritmo.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128203;</td><td style="padding:5px 0;">Frameworks aplicables a tu equipo desde la primera semana.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 32px 4px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ff;border-radius:12px;border:1px solid #e7defc;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.55;color:#3a3d5c;"><strong>[[COMPLETAR: cohorte y fechas]]</strong> — ej. "Aún puedes sumarte a la I Generación 2026: las jornadas 3 y 4 son el 24 y 31 de julio, y la 1 la ves grabada apenas te inscribes" o, si aplica, la fecha de la próxima cohorte.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="https://capitalacademy.cl/pago/liderazgo" target="_blank" style="display:inline-block;padding:15px 44px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Quiero conocer el programa</a>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">Cualquier duda, respóndenos este correo.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>
```

---

### Correo 2 — Temario, docentes y prueba social

**Asunto**: `Así se ve, jornada por jornada, el Programa de Liderazgo`
**Asunto alternativo (A/B)**: `Lo que vas a aplicar a tu equipo desde la primera semana`

**Preheader**: `Reclutamiento, gestión por metas, autoliderazgo y un proyecto aplicado a tu propio equipo.`

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Programa de Liderazgo</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:23px;line-height:1.3;color:#14163a;font-weight:800;">{{ contact.NOMBRE }}, esto es lo que vas a trabajar jornada por jornada</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">El Programa de Liderazgo y Gestión de Equipos Comerciales combina teoría aplicada con un proyecto real: al final vas a salir con un sistema propio de gestión para tu equipo, no solo con apuntes.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Currículum</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55;color:#3a3d5c;">
          <tr><td style="padding:6px 12px 6px 0;color:#5e17eb;font-weight:800;vertical-align:top;width:20px;">1</td><td style="padding:6px 0;"><strong>Autoliderazgo y rol del líder comercial</strong> — identidad de líder, gestión emocional, foco y disciplina.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#5e17eb;font-weight:800;vertical-align:top;">2</td><td style="padding:6px 0;"><strong>Reclutamiento y selección de talento</strong> — perfil de cargo, entrevista estructurada, onboarding.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#5e17eb;font-weight:800;vertical-align:top;">3</td><td style="padding:6px 0;"><strong>Motivación y desarrollo de equipos</strong> — coaching 1:1, feedback efectivo, planes de desarrollo.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#5e17eb;font-weight:800;vertical-align:top;">4</td><td style="padding:6px 0;"><strong>Gestión por metas y métricas</strong> — KPI comerciales, pipeline review, cultura de números.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#5e17eb;font-weight:800;vertical-align:top;">5</td><td style="padding:6px 0;"><strong>Proyecto integrador</strong> — plan de gestión a 90 días, presentación y devolución de los docentes.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 4px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ff;border-radius:12px;border:1px solid #e7defc;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Quiénes hacen las clases</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">Un equipo docente con trayectoria real en gestión comercial inmobiliaria, incluido Diego de La Prida, Business Owner &amp; GM Real Estate en TOCTOC, especializado en liderazgo comercial y estrategia de crecimiento.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <blockquote style="margin:0;padding:16px 20px;border-left:4px solid #5e17eb;background:#f9f9fb;border-radius:0 12px 12px 0;">
          <p style="margin:0;font-size:15px;line-height:1.5;color:#14163a;font-weight:600;">&ldquo;Las grandes metas exigen más que visión: exigen equipo, estructura y liderazgo.&rdquo;</p>
        </blockquote>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="https://capitalacademy.cl/pago/liderazgo" target="_blank" style="display:inline-block;padding:15px 44px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Ver el programa completo</a>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">Cualquier duda, respóndenos este correo.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>
```

---

### Correo 3 — Objeciones y cierre (sin urgencia falsa)

No hay una fecha límite real que comunicar (no hay confirmación de que el precio de
lanzamiento venza en una fecha concreta), así que este correo cierra con **claridad de precio +
resolución de dudas**, no con un contador artificial. Si el equipo define una fecha real de
cierre de matrícula, se agrega ahí (ver placeholder).

**Asunto**: `Precio, cuotas y las dudas más comunes del Programa de Liderazgo`
**Asunto alternativo (A/B)**: `¿Te quedó alguna duda sobre el Programa de Liderazgo?`

**Preheader**: `Precio de lanzamiento, formas de pago y respuestas directas antes de que decidas.`

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Programa de Liderazgo</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:23px;line-height:1.3;color:#14163a;font-weight:800;">{{ contact.NOMBRE }}, ¿te quedó alguna duda?</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Te escribimos por última vez de esta ronda para dejarte la información completa de precio y forma de pago, y responder lo que más nos preguntan al inscribirse.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ff;border-radius:12px;border:1px solid #e7defc;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Precio de lanzamiento &middot; código LIDERAZGO20</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.7;color:#3a3d5c;">
              <tr><td style="padding:3px 0;">Contado (1 a 3 cuotas): <s style="color:#9b9db5;">$450.000</s> <strong>$360.000</strong></td></tr>
              <tr><td style="padding:3px 0;">4 a 6 cuotas: <s style="color:#9b9db5;">$480.060</s> <strong>$384.000</strong></td></tr>
              <tr><td style="padding:3px 0;">7 a 12 cuotas: <s style="color:#9b9db5;">$495.810</s> <strong>$396.000</strong></td></tr>
            </table>
            <p style="margin:10px 0 0 0;font-size:12px;line-height:1.5;color:#6b6e8a;">El código se aplica automáticamente en el checkout. [[COMPLETAR: si el precio de lanzamiento tiene fecha de término real, indicarla aquí; si no la hay, dejar este párrafo tal cual.]]</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 4px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Lo que más preguntan</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:8px 0;"><strong>¿Las clases quedan grabadas?</strong><br/>Sí. Todas las sesiones en vivo se graban y quedan disponibles durante toda la cohorte para revisarlas a tu ritmo.</td></tr>
          <tr><td style="padding:8px 0;"><strong>¿Cuándo empiezan las clases?</strong><br/>Apenas te inscribes te confirmamos por correo la fecha de tu cohorte.</td></tr>
          <tr><td style="padding:8px 0;"><strong>¿Recibo un certificado?</strong><br/>Sí, el diploma certificado de Capital Academy al cumplir los requisitos de aprobación.</td></tr>
          <tr><td style="padding:8px 0;"><strong>¿Hay devolución si me arrepiento?</strong><br/>Sí, tienes 10 días para solicitarla según la política SERNAC, sin haber iniciado el contenido del programa.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="https://capitalacademy.cl/pago/liderazgo" target="_blank" style="display:inline-block;padding:15px 44px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Inscribirme al Programa de Liderazgo</a>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">Si prefieres conversarlo antes, responde este correo y te contactamos directamente.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>
```

---

## 3. Checklist operativo para el envío

- [ ] **Canal**: campaña en el dashboard de Brevo (cuenta Capital Inteligente), no transaccional
      — así procesa `{{ contact.NOMBRE }}` y agrega el pie de unsubscribe legal automáticamente.
- [ ] **Remitente**: `Capital Academy <academia@capitalacademy.cl>`, reply-to
      `academia@capitalinteligente.cl` (dominio `capitalacademy.cl` ya validado DKIM/SPF).
- [ ] **Segmento**: la lista de contactos de la Masterclass/Workshop en Brevo (~200 contactos,
      la misma base del blast previo a 196).
- [ ] **Exclusiones**: alumnos ya matriculados en el Programa de Liderazgo (cohorte G1) —
      exportar el listado actual desde el admin de Capital Academy antes de segmentar, para no
      invitar a quien ya está adentro. [[COMPLETAR: confirmar si hay que excluir también a
      alumnos activos del Diplomado/Workshop u otro programa por criterio comercial.]]
- [ ] **Horario sugerido**: martes o miércoles, 10:00-11:00 a.m. (mejor apertura habitual para
      público profesional; no hay dato histórico propio de esta lista con el que afinar más).
- [ ] **Cadencia**: Correo 1 día 0 → Correo 2 día 3-4 → Correo 3 día 7-8. No enviar Correo 2/3
      a quien ya haya hecho clic al CTA de un correo anterior y completado la matrícula.
- [ ] **Antes de programar**: completar los placeholders `[[COMPLETAR: …]]` de cohorte/fechas
      (Correo 1) y de vigencia del precio de lanzamiento (Correo 3).
- [ ] **Complemento acordado en la reunión del 7-jul**: WhatsApp masivo en paralelo — no
      incluido en este borrador (es un canal y formato distinto); coordinar aparte.
- [ ] **Revisión de la profe**: por acuerdo de la reunión, el contenido lo diseña la profe con
      marketing antes de implementar el envío — este borrador es insumo para esa revisión, no
      el texto final aprobado.
