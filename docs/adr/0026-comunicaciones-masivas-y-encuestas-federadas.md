# ADR-0026: Comunicaciones masivas propias y encuestas federadas

- **Status:** proposed
- **Date:** 2026-07-29
- **Deciders:** Elkis Daza (ingeniería), con decisión de arquitectura del usuario
- **Tags:** correos, encuestas, integraciones, multi-sistema, data-ownership

## Contexto

El área de gestión de la academia necesitaba dos capacidades que hoy solo existen como
scripts one-off corridos a mano desde el computador de una persona:

1. **Correos masivos a alumnos.** `scripts/send-novedades-alumnos.mjs` y sus dos hermanos
   (`send-encuesta-ia.mjs`, `send-encuesta-feedback-clase-ia.mjs`) segmentan a mano,
   envían de a un correo cada 280 ms contra `api.resend.com` y deduplican con un JSON
   local (`scripts/.sent-*.json`) que **no está versionado**: el estado de "a quién ya le
   llegó" vive en un solo disco duro y se pierde al cambiar de máquina. El HTML del correo
   se escribe a mano en `docs/reportes/*.html`. Nadie salvo quien corre el script sabe qué
   se envió.
2. **Encuestas a grupos de alumnos.** Compromiso con la clienta en la reunión del
   2026-07-22: encuesta indagatoria pre-clase por profesor y encuesta anónima post-clase.

El hallazgo que define este ADR es que **el motor de encuestas ya existe y es maduro**,
pero vive en otro sistema y otra base de datos:

- Vive en `capital-admin` (`packages/admin-modules/src/surveys/`) + `hclp-capitalinteligente`
  (dueño del DDL y del renderer público), sobre el Supabase **compartido**
  `upygbobjarduunbwzeva`. Capital Academy usa uno distinto (`igatsyghbadccbrjiurl`).
- Tablas `surveys`, `survey_submissions`, `survey_answers`, `survey_recipients`; 11 tipos
  de pregunta (incluye `scale`, `nps`, `section_break`), lógica condicional, acceso `gated`
  por token, y despacho de correo + WhatsApp con dedup de 30 días.
- El formulario público lo sirve hclp en `capitalinteligente.com/s/{slug}`.
- Ya expone dos contratos server-to-server: `GET /api/external/surveys/{id}/results`
  (Bearer `SURVEYS_API_TOKEN`) y `POST /api/surveys/{slug}/recipients` (`x-ingest-secret`).
- **La API del panel de capital-admin exige sesión OTP** de `panel_members`, que un
  servicio no puede tener. Por eso la encuesta del 2026-07-23 se creó escribiendo directo
  a Supabase con service_role (ver `docs/devlog/2026-07-23.md`).

## Decisión

### 1. Comunicaciones: 100 % local

`email_campaigns` + `email_campaign_recipients` (migración 0082), Resend propio, branding
propio, panel en `/admin/comunicaciones`. Sin dependencias cruzadas.

El despacho reusa el patrón obligatorio de **ADR-0020** sin excepción: reclamo atómico de
la fila → bitácora por destinatario → `sendEmailBatch` (lotes de 100, backoff) → estado
terminal **solo si cero fallos**. Con entrega parcial la campaña queda `failed`
(reintentable) y el reintento solo alcanza a quien falta.

El cuerpo se guarda en **Markdown**, no en HTML. Se renderiza al enviar
(`lib/email/markdown.ts`), de modo que un arreglo de plantilla arregla también los
borradores ya escritos. El renderer es un subset propio con estilos inline porque los
clientes de correo descartan CSS externo; `react-markdown` (que sí está instalado) produce
HTML con clases y no sirve para correo.

### 2. Encuestas: federadas — Capital Academy orquesta, hclp aloja

Capital Academy **crea** la encuesta, **segmenta** a los alumnos, **dispara** el envío y
**lee** los resultados. El formulario y las respuestas viven en el sistema de Capital
Inteligente. Localmente solo se guarda el ENVÍO: `survey_campaigns` +
`survey_campaign_recipients` (migración 0083), enlazadas al motor remoto por
`external_survey_id` / `external_survey_slug` **sin FK** (están en otra base).

Tres superficies, tres secretos independientes (`lib/surveys/config.ts`), siguiendo el
patrón de la empresa de un secreto por superficie rotable por separado:

| Operación | Mecanismo | Variables |
|---|---|---|
| Crear | insert service_role en el Supabase compartido | `SURVEYS_SUPABASE_URL`, `SURVEYS_SUPABASE_SERVICE_ROLE_KEY`, `SURVEYS_PUBLIC_BASE_URL` |
| Enrolar | `POST /api/surveys/{slug}/recipients` de hclp | `SURVEYS_PUBLIC_BASE_URL`, `SURVEY_RECIPIENTS_INGEST_SECRET` |
| Leer | `GET /api/external/surveys/{id}/results` | `SURVEYS_API_BASE_URL`, `SURVEYS_API_TOKEN` |

Sin credenciales, la API responde **503 nombrando la variable faltante** y la UI queda en
solo lectura: es un problema de despliegue, no un fallo que reintentar.

### 3. Dos modos de encuesta, con caminos de despacho distintos

- **`anonymous`** → `access_mode: 'open'` + `audience: 'public'` + `collect*: false` en el
  motor remoto (las tres capas juntas, como se configuró a mano el 23-jul). **Capital
  Academy envía el correo** con su branding y un enlace **idéntico para todos**.
- **`identified`** → `access_mode: 'gated'`. Capital Academy **no envía nada**: delega en
  la ingesta de hclp, que emite un token por persona y despacha correo + WhatsApp. Un
  `skipped` de hclp (dedup de 30 días) se registra como entregado, no como fallo.

El modo es **inmutable** una vez enviada: cambiarlo rompería el anonimato ya prometido a
quien respondió. `assertAnonymousUrl` es la última línea de defensa — si el enlace de una
encuesta anónima llegara a llevar `t=`, `token=`, `email=`, `uid=`, `id=` o `rut=`, el
envío se detiene en vez de mandar cientos de enlaces personalizados bajo una promesa de
anonimato.

Los resultados **no se copian** a la base de Capital Academy: se leen al vuelo. En modo
anónimo, además, la API devuelve solo el conteo y nunca las respuestas fila por fila —
cruzar respuestas abiertas con la lista de invitados puede re-identificar a alguien.

## Opciones consideradas

### Opción A — Federado: Academy orquesta, hclp aloja (elegida)
- Pros: reusa un motor maduro (11 tipos de pregunta, anonimato, lógica condicional, WhatsApp);
  una sola fuente de verdad de las respuestas; el equipo ya sabe leer resultados en el panel
  de capital-admin.
- Contras: depende de credenciales cruzadas y de la disponibilidad de otro sistema; crear
  exige escribir en tablas cuyo DDL es de otro repo (acoplamiento a un esquema que puede
  cambiar sin avisarnos).

### Opción B — Motor propio en Capital Academy (descartada)
- Pros: cero dependencias cruzadas; control total del anonimato; se podría ligar la
  respuesta al `enrollment_id`.
- Contras: duplicaría un motor que la empresa ya construyó y mantiene, con dos lugares
  donde arreglar el mismo bug y dos paneles donde buscar respuestas. No hay ninguna
  necesidad de la academia que el motor remoto no cubra.

### Opción C — Solo distribución y lectura (descartada)
- Pros: alcance mínimo, sin migraciones de encuesta.
- Contras: crear la encuesta seguiría siendo un paso manual fuera de Capital Academy —
  exactamente la fricción que la clienta pidió eliminar.

### Sobre el cuerpo del correo: Markdown vs. HTML pegado (elegido Markdown)
Guardar HTML permitiría diseños arbitrarios, pero convierte cada comunicado en un artefacto
que solo alguien técnico puede editar, y congela la plantilla en el momento en que se
escribió. Markdown mantiene el correo editable por el equipo académico y deja el diseño en
un solo lugar versionado.

## Consecuencias

### Positivas
- El estado de "a quién ya le llegó" pasa de un JSON en un disco duro a una tabla con RLS
  que todo el staff puede consultar.
- Los envíos masivos entran al patrón de ADR-0020: dejan de perderse correos por entrega
  parcial y un reintento es quirúrgico.
- Un comunicado del Programa de Liderazgo llega en ámbar y uno del Ciclo CI en rosa: el
  acento sale de `lib/programs/registry.ts` en vez de estar fijo en violeta como en las
  cuatro plantillas de correo existentes.
- El conteo de audiencia previo al envío ("le vas a escribir a 239 personas") es una
  barrera real antes de una acción irreversible.

### Negativas
- Capital Academy queda acoplado al esquema de `surveys` de otro repo. Si hclp cambia
  columnas o el shape de `questions`, la creación se rompe y nos enteramos en producción.
- Se agrega un quinto `shell()` de correo al repo (`lib/email/layout.ts`) sin migrar los
  cuatro que ya estaban duplicados — deuda consciente, ver abajo.
- Nueva superficie de datos: dos tablas por módulo, cuatro en total.

### Riesgos
- **Las credenciales cruzadas no se pudieron probar contra el sistema real** desde este
  entorno: no están en el `.env` local. El camino de creación, enrolamiento y lectura está
  cubierto por tests con dobles, pero el contrato real de hclp/capital-admin no se ejerció.
  El primer uso debe ser un ensayo con una cohorte chica.
- El insert directo a `surveys` no pasa por ninguna validación de aplicación del lado
  remoto: si el shape de `questions` no calza, el formulario público puede quedar en blanco
  sin error visible desde aquí.
- **No hay unsubscribe.** Son correos operacionales a alumnos con matrícula, no marketing,
  y el repo no tiene ningún mecanismo de baja hoy. Si el módulo se usa para algo que se
  parezca a marketing, esto pasa a ser un problema legal, no una deuda técnica.

## Deuda explícita asumida

- Los cuatro `shell()` duplicados (`capacitacion-emails`, `deliverable-open`,
  `deliverable-received`, `recording-available`) **no se migran** a `lib/email/layout.ts`
  en este cambio: son correos transaccionales en producción y migrarlos es un refactor no
  pedido, con riesgo desproporcionado frente al beneficio.
- **Sin envío programado.** El compromiso con la clienta incluye una encuesta post-clase
  automatizada (21:05–21:10 hora Chile + recordatorio al día siguiente a las 10:00). Este
  ADR deja el modelo y el despacho listos, pero el cron que los dispara es un frente
  aparte. `email_campaigns` no tiene `scheduled_at` a propósito: no se finge soporte.
- **WhatsApp solo llega por hclp** (encuestas identificadas). Capital Academy no habla con
  la Cloud API.

## Amendment (2026-07-29, mismo día): el correo de prueba y el dominio sin MX

Al primer uso real en producción, el correo de prueba de un comunicado no llegaba. **No era un
defecto de código**: `capitalacademy.cl` **no tiene registros MX** (`dig +short MX capitalacademy.cl`
→ vacío). El dominio está *verified en Resend para enviar*, pero no puede *recibir*. Como al panel se
entra con `admin@capitalacademy.cl`, la prueba —que iba únicamente a la dirección de la cuenta
conectada— caía en un buzón inexistente: Resend devolvía `id` sin error, la UI decía "prueba
enviada" y no llegaba nada. El mismo correo a Gmail salió `delivered`, lo que descartó el pipeline.

Decisiones derivadas:

1. **La prueba va a la casilla del equipo académico + copia a quien redacta.** La casilla sale de
   `CAMPAIGN_TEST_EMAIL` (por defecto `academia@capitalinteligente.cl`). Se puede reemplazar por
   body (`{to}`), pero **restringido a correos de cuentas `ops`/`admin` ya existentes**: sin esa
   lista blanca el endpoint sería un relay para enviar correo con la marca de Capital Academy a
   cualquier dirección del mundo.
2. **Los destinos de dominios sin MX se OMITEN del envío**, no se envían con una advertencia.
   Mandarle a un buzón inexistente no informa a nadie y suma entregas fallidas a la reputación de
   una cuenta de Resend compartida por toda la empresa. La respuesta los devuelve en `skipped`. Si
   todos los destinos son inalcanzables, responde 422 en vez de llamar a Resend con lista vacía.
3. La lista vive en `NON_RECEIVING_DOMAINS` dentro del endpoint. Es deliberadamente una constante y
   no una consulta DNS en caliente: resolver MX por envío agrega latencia y un modo de falla nuevo
   a un camino que hoy es determinista.

**Nota de documentación:** `.env.example` está en `.gitignore` (`.env*`), así que NO se versiona.
Las variables de este ADR se documentan aquí, que es la fuente durable. Las que hay que definir en
Netlify son: `SURVEYS_SUPABASE_URL`, `SURVEYS_SUPABASE_SERVICE_ROLE_KEY`, `SURVEYS_PUBLIC_BASE_URL`,
`SURVEYS_API_BASE_URL`, `SURVEYS_API_TOKEN`, `SURVEY_RECIPIENTS_INGEST_SECRET` y
`CAMPAIGN_TEST_EMAIL`.

Estado al 2026-07-29: **las 7 configuradas y verificadas contra los sistemas reales.**

### `SURVEY_RECIPIENTS_INGEST_SECRET`: no existía en ninguna parte

Al buscarla se descubrió que **el enrolamiento por token nunca había funcionado en producción, para
nadie**. El endpoint de hclp falla cerrado (`if (!expected) → 503 ingest_not_configured`) y la
variable no estaba definida: ni en los `.env` de los cuatro repos (solo como placeholder en
`.env.example`), ni entre las 26 variables del sitio Netlify de hclp. Comprobado en vivo: el
endpoint respondía `503` igual con secreto que sin él.

Eso afecta también a **capital-admin**, que invoca ese mismo endpoint desde su panel
(`apps/admin/src/lib/surveys/ingest-client.ts`) y venía recibiendo 503 en silencio. No era una
credencial que a Capital Academy le faltara: la integración estaba apagada de origen.

Resolución: se generó un secreto nuevo (32 bytes aleatorios, base64url) y se instaló **en los dos
lados**, que es el único modo en que un secreto compartido sirve:

- Capital Academy — Netlify site `6a7c6f71-f9b5-48a3-b190-b26915dba3b6`.
- hclp — Netlify site `43094d8a-0bba-4892-a2b1-03ea03233fd8` (cuenta `giovannimarisio`), más un
  redeploy de producción para que tomara efecto. Se verificó antes que `origin/main` de hclp
  estuviera exactamente en el commit ya desplegado (`9c8ccf0`, 0 commits pendientes), de modo que el
  rebuild republicara el mismo código y no arrastrara trabajo sin liberar.

Verificación end-to-end tras el cambio, sin crear destinatarios ni enviar correos (`clients: []`,
`notify: false`): sin secreto → `401`; secreto incorrecto → `401`; **secreto real → `400
validation_failed`**, es decir, autenticó y llegó a validar el cuerpo.

**Consecuencia de seguridad a tener presente:** ese endpoint pasó de rechazar todo a aceptar PII de
clientes (correo, nombre, teléfono, RUT) y disparar correo y WhatsApp. Su única defensa es el
secreto compartido; si se filtra, hay que rotarlo **en los dos sitios a la vez** o el enrolamiento
se rompe.

## Referencias

- `docs/adr/0020-fan-out-de-correos-por-lote-e-idempotencia-por-destinatario.md` — patrón
  de despacho que este ADR reusa sin excepción.
- `docs/specs/comunicaciones-y-encuestas.md` — brief y criterios de aceptación.
- `docs/devlog/2026-07-23.md` — precedente: creación manual de la encuesta anónima por
  service_role, y descarte de la API del panel por exigir sesión OTP.
- `docs/reportes/encuesta-feedback-clase-ia-2026-07-22.md` — diseño de la encuesta real
  (9 preguntas) que fija los tipos de pregunta que el módulo debe soportar.
- `db/migrations/0082_email_campaigns.sql`, `db/migrations/0083_survey_campaigns.sql`
- `lib/campaigns/send.ts`, `lib/surveys/send.ts`, `lib/surveys/remote.ts`
