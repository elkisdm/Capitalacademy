# ADR-0040: Invitación automática por WhatsApp a una reunión con la directora, al inscribirse en Liderazgo

- **Status:** proposed
- **Date:** 2026-08-28
- **Deciders:** Elkis (desarrollo)
- **Tags:** captación, whatsapp, meta-cloud-api, integraciones

## Contexto

La campaña de Instagram del Programa de Liderazgo deja leads en `leads` desde
`/liderazgo` (ADR-0038). Hoy el primer contacto lo hace el equipo a mano, horas o
días después. Lo pedido: que el lead reciba **de inmediato** un WhatsApp desde el
número de la Academia invitándolo a una reunión de 15 minutos con la directora
académica, con un enlace para elegir hora en su calendario.

Hechos verificados el 2026-08-28:

- La Academia tiene número propio en Meta Cloud API: `+56 9 4383 7186`,
  `phone_number_id` `1243481052177734`, dentro del WABA compartido
  `953396980820986`. El token del WABA que ya usaban los scripts de captación
  lo ve y puede enviar desde él.
- **Atlas no participa en el envío.** Atlas Connect es la app suscrita al
  webhook de *entrada* del WABA; los mensajes salientes van directo a Graph API,
  igual que `scripts/send-diplomado-whatsapp.mjs`.
- El lead nunca nos ha escrito: no existe ventana de 24 h, así que solo se
  puede enviar una **plantilla aprobada** por Meta.
- La reunión "agendable" que existe (ADR-0039) la crea el equipo desde el panel
  eligiendo la hora. No hay un flujo donde el lead elija hora por su cuenta.

## Decisión

1. **Envío directo a Cloud API** desde `lib/whatsapp/cloud-api.ts`, con el
   número de la Academia. No se enruta por Atlas: agregar un salto para una
   llamada HTTP que ya tenemos credenciales para hacer sería complejidad sin
   beneficio.
2. **Plantilla `liderazgo_reunion_directora`** (`{{1}}` = nombre de pila, un
   botón URL). La crea `scripts/whatsapp-submit-template-liderazgo.mjs`.
   Enviada como UTILITY y **APROBADA el mismo 2026-08-28** (id
   `2230492564544755`); Meta la reclasificó a MARKETING al crearla — cambia el
   costo por conversación, no el código. El envío real quedó verificado ese
   mismo día: la API devolvió `wamid` desde el número de la Academia.
3. **El botón apunta a `/agendar/liderazgo`**, un redirect propio hacia
   `LIDERAZGO_AGENDA_URL`. La URL de un botón queda congelada en la plantilla
   aprobada; con el redirect el destino se cambia con una variable, sin volver a
   pasar por Meta. Sin la variable cae en `/liderazgo`, nunca en un 404.
4. **El enlace de agendamiento es una página de citas de Google Calendar**
   (Appointment Schedule) de la directora: bloques de 15 min, Meet automático y
   respeta su agenda real. No se puede crear por API: la crea ella y se pega la
   URL en Netlify. Se descartó construir una página de reserva propia porque
   necesitaría disponibilidad (freebusy) en Atlas y una UI de calendario, para
   resolver lo mismo que Google ya resuelve.
5. **El envío se espera dentro de `POST /api/leads` pero nunca la hace fallar.**
   Se espera porque en Netlify Functions la ejecución puede terminar al
   responder; no falla porque el lead ya está guardado y un WhatsApp caído no
   es motivo para mostrarle un error. Solo dispara con
   `program_interest = liderazgo` y `source = landing-liderazgo`.
6. **Cada intento deja una fila en `lead_activity` (`kind = whatsapp`,
   `created_by = null`)**, enviado o fallido, con el motivo. Así el equipo ve en
   la bitácora de `/admin/leads` si tiene que escribir a mano.
7. **La actividad automática NO cuenta como "último contacto".**
   `ultimoContacto()` (pipeline del panel y columna del XLSX de comercial)
   ignora las filas con `created_by = null`: la pregunta que responde esa
   columna es "¿cuándo habló alguien del equipo con esta persona?", y si el bot
   contara, cada lead nuevo saldría "contactado" al segundo de inscribirse y
   nadie lo llamaría.

## Consecuencias

- Nueva dependencia de producción: Meta Cloud API con `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_CLOUD_API_VERSION` en Netlify (puestas
  el 2026-08-28). `LIDERAZGO_AGENDA_URL` queda pendiente de la directora.
- El token es del WABA compartido: puede enviar desde los tres números de la
  empresa. El `phone_number_id` en Netlify es lo único que fija el emisor.
- Sin reintentos: si Meta falla, el registro en la bitácora es la señal.

## Alternativas descartadas

- **Enrutar por Atlas**: un salto más para una llamada que ya podemos hacer.
- **Texto libre**: Meta lo rechaza fuera de la ventana de 24 h.
- **Página de reserva propia sobre `crearReunion` (ADR-0039)** sin
  disponibilidad: doble reserva garantizada. Con disponibilidad: freebusy en
  Atlas + UI, v2 solo si la página de Google se queda corta.
- **URL de Google directo en el botón**: cada cambio de enlace exige nueva
  aprobación de plantilla.
