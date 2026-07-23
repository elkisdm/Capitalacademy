---
clase: "IA aplicada al rol del asesor — De conversar a dirigir"
programa: "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria (4ª generación)"
docente: "Elkis Daza"
fecha: 2026-07-22
modalidad: "En vivo por Zoom"
duracion: "2:21:49"
asistentes: "~19 alumnos (21 en sala, incluye equipo)"
lesson_id: "91f085f1-8970-4d7d-b8db-e685b62e2d3b"
estado: "COMPLETA"
transcripcion: "./2026-07-22-ia-asesor-inmobiliario-transcripcion.md"
---

# Documentación de clase — IA aplicada al rol del asesor

> Clase completa de 2h21m49s. Las marcas de tiempo corresponden al video de la
> repetición en la plataforma.

---

## 1. Ficha

| Campo | Valor |
| --- | --- |
| Título declarado | "De conversar a dirigir" — IA aplicada al rol de asesor inmobiliario |
| Duración | 2h 21m 49s |
| Inicio del contenido | 6:24 (los primeros ~6 min son sala de espera) |
| Formato | Presentación web interactiva + demos en vivo sobre Claude, ChatGPT y Gemini |
| Nivel de la audiencia | Mixto — calibrado con encuesta previa |
| Prerrequisitos | Ninguno |
| Cierre | 2:21:05 |

## 2. Objetivos declarados

Enunciados en 6:24–7:30:

1. Entender qué es la IA y la **IA generativa** popularizada en 2022 con ChatGPT.
2. Entender **lo esencial que cambió este año**.
3. **Distinguir sus distintas formas** — la IA no es solo un chat.
4. **Explorar formas prácticas de aplicarla al rol de asesor inmobiliario.**

**Cobertura:** los cuatro objetivos se cumplen. El objetivo 4, que en la primera mitad
era minoritario, se convierte en el eje central de la segunda.

## 3. Estructura y tiempos

### Primera parte — Fundamentos (0:00 – 1:10:00)

| Tramo | Bloque |
| --- | --- |
| 0:00 – 6:24 | Sala de espera y conversación informal (comentan notas del roleplay) |
| 6:24 – 12:00 | Bienvenida, objetivos, presentación personal del docente |
| 12:00 – 17:30 | Línea histórica de la IA (Turing → agentes 2026) |
| 17:30 – 22:00 | Capacidades actuales, tareas de larga duración, bucle de auto-mejora |
| 22:00 – 27:30 | Industria, adopción, escalera de madurez, impacto en el empleo |
| 27:30 – 33:40 | Qué es un LLM + las **4 ideas** (modelo, contexto, tokens, herramientas) |
| 33:43 – 42:13 | Pregunta sobre tokens + explicación + demo fallida de consumo |
| 42:13 – 47:00 | Mapa de actores + sondeo de uso de la audiencia |
| 47:00 – 1:10:00 | Tour de paneles: Gemini → ChatGPT → conectores → **tareas programadas** |

### Segunda parte — Aplicación y agentes (1:10:00 – 2:21:49)

| Tramo | Bloque |
| --- | --- |
| 1:10:00 – 1:13:20 | Recomendación de instalar la app de escritorio; presentación de Codex |
| 1:13:20 – 1:16:00 | **Chat vs Work / Cowork** — el modo agente |
| 1:16:00 – 1:21:30 | **Q&A de privacidad de datos del cliente** (intervención extensa) |
| 1:21:30 – 1:24:30 | **Carpeta por cliente** como unidad de contexto |
| 1:24:30 – 1:31:45 | Generación de datos ficticios de cliente para practicar |
| 1:26:00 – 1:31:00 | Diálogo con alumna: "ya tengo mis carpetas, ¿de qué me sirve?" |
| 1:31:45 – 1:35:00 | **Propuesta de inversión** generada desde la carpeta del cliente |
| 1:35:00 – 1:37:15 | **Organizar el escritorio** con control del computador |
| 1:37:15 – 1:43:30 | **Ingeniería inversa de diseño**: Dribbble → PowerPoint |
| 1:43:30 – 1:56:00 | **Claude Skills**: grabar una habilidad (demo WhatsApp + CRM) |
| 1:56:00 – 2:00:00 | Pausa para marcar asistencia por QR + cómo funciona la plataforma |
| 2:00:00 – 2:06:30 | **Extensión de Chrome** + ejecución de la skill sobre leads reales |
| 2:06:30 – 2:10:00 | Q&A: segundo mensaje de seguimiento, mejora automática de skills |
| 2:10:00 – 2:13:30 | Cierre, agradecimientos, compromisos |
| 2:13:30 – 2:21:05 | **Bonus: roleplay de cliente con voz** en ChatGPT |

**Distribución:** ~40% teoría y contexto, ~50% demos aplicadas, ~10% pérdida por fallas
técnicas y transiciones. **0% de práctica ejecutada por el alumno durante la sesión.**

---

## 4. Contenido conceptual (primera parte)

### 4.1 Línea histórica presentada

| Hito | Contenido según la clase |
| --- | --- |
| Alan Turing | Primeras ideas sobre máquinas que piensan; referencia a *El código Enigma* |
| 1956, Dartmouth | El campo recibe el nombre "Inteligencia Artificial" |
| 1959 | Aparece el término *Machine Learning* |
| 1997 | **Deep Blue** (IBM) derrota a Garry Kasparov |
| 2009 | **ImageNet** acelera el aprendizaje visual |
| — | Redes profundas / *deep learning* |
| 2017 | **"Attention is all you need"** (Google) — base de los LLM |
| 2022 | Salida pública de la IA generativa con ChatGPT |
| 2024 | Primeros **modelos razonadores** |
| 2025–2026 | **IA agéntica**: delegar tareas complejas y autónomas |

> ⚠️ Contiene imprecisiones factuales. Ver el informe de análisis, §"Errores factuales".

### 4.2 Qué es un LLM

Un **modelo predictivo** que estima la próxima palabra. Ciclo descrito:

1. Convierte el texto en **tokens** (palabra, parte de palabra, número, signo). Ejemplo: "inmobiliario" = 3 tokens.
2. Compara cada parte con el **contexto**.
3. **Calcula probabilidades** y selecciona la siguiente unidad.
4. Añade el contexto y **vuelve a empezar**.

> *"Las IA como tal no tienen razonamiento, no tienen conciencia; es un modelo matemático prediciendo qué palabra viene después."*

### 4.3 Las 4 ideas — andamiaje central

| Idea | Definición dada |
| --- | --- |
| **Modelo** | El motor entrenado. Optimizan calidad, velocidad, costo o especialización |
| **Contexto** | Toda la información disponible al dar la indicación |
| **Tokens** | Unidades que la IA genera y consume. Nueva "moneda de valor" |
| **Herramientas** | Lo que la lleva de chat a ejecutor: navegador, correo, archivos, CRM |

> El **contexto** se retoma en la segunda parte como el concepto operativo más
> importante: *"el contexto es toda la información relacionada a la tarea que quiero
> hacer"* (1:34:56).

### 4.4 Tokens, cómputo y economía

- Los tokens miden **el consumo**, no un cupo de mensajes.
- Cadena: procesar texto → **gasta cómputo** → servidores → **electricidad**.
- Planes pagos muestran **barra de uso** (la del docente al 73%, reinicio el sábado a las 3 AM).
- **La IA está hoy subsidiada**: las empresas pierden dinero con las suscripciones de ~USD 20/mes.
- Alternativa futura: **modelos locales / abiertos**, sin conexión, limitados por la potencia del equipo.

### 4.5 Escalera de madurez de uso

1. **Preguntar** — consultas sueltas.
2. **Usar con cuenta** — correos, textos, borradores.
3. **Integrar al trabajo diario** — datos de clientes, procesos.
4. **Construir con IA** — webs, aplicaciones, agentes. *"La joya de la corona."*

### 4.6 Impacto en el empleo

- 1 de cada 4 empleos con **algún grado de exposición**; exposición ≠ desaparición.
- **Mayor exposición:** digitación, contabilidad, tareas administrativas, secretaría, preparación de documentos, análisis financiero, programación.
- **Menor exposición:** trabajo físico, construcción, cuidado personal.
- **Fórmula:** *expertise de dominio + IA*.
- **Analogía:** la electricidad multiplicó los músculos; **la IA multiplica la mente**.

### 4.7 Límites de la IA

Muy buena en matemáticas, código y uso del computador; **frágil en señales humanas** —
no reconoce la ironía ni el miedo de un cliente.

Reforzado en el cierre (2:10:16):

> *"Nunca podemos delegar el criterio de un asesor inmobiliario."*

---

## 5. Mapa de herramientas

| Herramienta | Qué se dijo |
| --- | --- |
| **Claude** (Anthropic) | Recomendado para tareas. Mejor para programar y tareas largas. Consume cuota más rápido. **No genera imágenes**. Único con **Skills** |
| **ChatGPT** (OpenAI) | Cuota más duradera. **Mejor modelo de imágenes** del mercado |
| **Gemini** (Google) | Integrado al ecosistema Google. Único que **genera video**. Imágenes con *NanoBanana*, también música |
| **Modelos abiertos** | Llama (Meta), Mistral, Alibaba. Descargables; velocidad según el equipo |
| **Higgsfield** | Dedicada a **generación de contenido visual** y consistencia de escenas |
| **ElevenLabs** | Referente en **voz conversacional**: clonar voz, agentes, llamadas automáticas |
| **Copilot** (Microsoft) | Se apoya en modelos de OpenAI (Microsoft fue gran inversor) |
| **Codex** | Mencionado como app instalada del docente |

### 5.1 Elegir el modelo correcto

- **Modelos de inferencia**: responden de inmediato.
- **Modelos razonadores**: piensan antes de responder.

> **Regla:** para tareas complejas, usar siempre el modelo más inteligente.

### 5.2 Funciones comunes de los paneles

- **Adjuntar archivos**, **generar imágenes/video/música**.
- **Canvas** — lienzo colaborativo: la IA produce y el usuario edita en simultáneo.
- **Deep Research** — múltiples agentes recorren la web y sintetizan un informe (10–30 min). Ejemplo: *plusvalía por comuna de la RM, 1996–2026*.
- **Línea de pensamiento visible** al tocar el indicador "pensando".
- **Memoria** — guarda fragmentos de lo conversado y mejora respuestas con el tiempo (1:18:43).

### 5.3 Conectores

| Herramienta | Nombre del menú |
| --- | --- |
| ChatGPT | Complementos |
| Claude | Conectores |
| Gemini | Plugins |

**Una cuenta nueva no tiene ninguna conexión activa.** Cada conector muestra sus permisos.

- **Gmail** — leer, buscar, organizar, archivar, modificar, a veces enviar.
- **Google Drive** — leer y buscar documentos, cargar, leer presentaciones y hojas de cálculo.
- **Calendario** — dos clics.

### 5.4 Tareas programadas

En ChatGPT aparece como **"Programado"**. Ejecuta instrucciones de forma recurrente.

**Demo — "Radar Inmobiliario Chile"** (1:06:22–1:08:44):

> *Todos los días a las 8:00: busca noticias de la industria inmobiliaria en Chile, hazme
> un resumen y genérame 10 ideas de contenido para mi perfil de asesor inmobiliario.*

El modelo **agregó por su cuenta**: resumen ejecutivo con fuentes, impacto segmentado
por compradores/inversionistas/propietarios/arrendatarios/desarrolladores, riesgos y
oportunidades, 10 ideas con *hook*/enfoque/formato/desarrollo/CTA, prioridad a las
últimas 24 horas y no repetir ideas.

Ideas sugeridas por la propia herramienta: preparar una reunión, clasificar la bandeja
de entrada, resumen diario del calendario, monitorear un tema.

---

## 6. Modo agente — el núcleo de la segunda parte

### 6.1 Chat vs Work / Cowork

| Modo | Para qué |
| --- | --- |
| **Chat** | Preguntas rápidas, conversar, buscar información, resumir, generar ideas |
| **Work** (ChatGPT) / **Cowork** (Claude) | Tareas largas de varios pasos con resultados terminados: informes, documentos, presentaciones, hojas de cálculo, investigación, análisis. Trabaja con archivos y aplicaciones autorizadas |

Diferencia práctica subrayada: en el navegador hay que **adjuntar** un archivo; Work
**navega el computador**, busca y organiza por su cuenta.

> Claude lanzó Cowork primero; ChatGPT sacó Work "hace una semana o algo así".

**Recomendación explícita:** instalar la **aplicación de escritorio** (y móvil), no
quedarse en la versión web.

### 6.2 Carpeta por cliente — el flujo de trabajo central

La recomendación operativa más importante de la clase:

```
Documentos/
└── Clientes Capital Inteligente/
    ├── Pepito Pérez/
    │   ├── liquidaciones
    │   ├── certificado de cotizaciones
    │   ├── informe CMF / Infotech
    │   ├── cotizaciones
    │   └── transcripción de la reunión
    └── Valentina Rojas/
```

Al abrir un chat en Work/Cowork se **elige la carpeta como proyecto**, y todo lo que se
genere queda anclado a ese contexto.

**Por qué importa** (1:28:39): la IA analiza cédula, deudas y perfil financiero, y
personaliza la propuesta para ese cliente concreto. *"Ese es el valor."*

Diálogo relevante con una alumna que ya tenía sus carpetas armadas a mano y preguntaba
de qué le servía entonces la IA. Respuesta: el valor no está en crear las carpetas sino
en **trabajar sobre ellas** — generar propuestas, comparativas y presentaciones con el
contexto ya cargado.

**Extensión sugerida:** grabar las reuniones con clientes y sumar la transcripción a la
carpeta. *"Si no lo están haciendo, les recomiendo que empiecen a grabar todo y a
documentar todo"* (1:29:26).

### 6.3 Casos de uso demostrados sobre la carpeta

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Generar **datos ficticios de cliente** para practicar (ficha, estado de situación comercial, informe de deudas) | ✅ |
| 2 | **Llenar la ficha de estado de situación** extrayendo datos de los documentos del cliente | ✅ Descrito y ejecutado |
| 3 | **Propuesta de inversión inmobiliaria** desde la carpeta → Word editable + PDF | ✅ Con análisis: *"comprar las dos unidades elevaría la carga financiera un 46,4% y dejaría solo 2 millones de liquidez, no es prudente"* |
| 4 | **Presentación PowerPoint** inspirada en un diseño de referencia | ✅ "Plan de inversión residencial" |

> **Punto pedagógico clave** (1:36:30): los datos eran falsos y la propuesta no era
> realista — *"ahí es donde entra nuestro criterio como asesores"*. Se le puede **enseñar
> una vez** a la IA qué debe llevar una propuesta y con qué lógica se calculan los
> montos, y lo aplicará en adelante.

### 6.4 Ingeniería inversa de diseño

Método enseñado (1:37:15–1:41:06):

1. Buscar una referencia visual que guste — sugiere **Dribbble**.
2. Tomar **captura de pantalla**.
3. Pedirle a la IA que se inspire en ese diseño para generar el entregable.

> *"Para la IA no tenemos que saber de diseño, solo tenemos que tener buen gusto."*

Se generaliza: la ingeniería inversa aplica a **contenido** — descomponer un video de
Instagram en una estructura replicable y adaptarla a la idea propia.

Fundamento: **la IA es multimodal** — entiende y genera texto, imagen y audio, y
convierte entre modalidades (transcribir es analizar audio para extraer texto).

### 6.5 Control del computador

Demos con Claude Cowork (1:35:42–1:43:33):

- *"Ayúdame a organizar mi escritorio"* → movió capturas, creó carpetas de audios y documentos, **sin eliminar nada**.
- Segunda iteración: mover todas las carpetas a Documentos y dejar el escritorio vacío.

**Traslado al trabajo real:** un cliente que manda 400 documentos sueltos por WhatsApp →
descargarlos y pedirle a la IA que los clasifique y los archive en la carpeta del
cliente.

### 6.6 Claude Skills

> *"Un skill es una habilidad: un documento donde está documentado cómo se hace una tarea."*

Presentado como función **exclusiva de Claude** y posible razón para elegir esa
herramienta. Estándar creado por Anthropic.

**Cómo se graba** (`+` → "Grabar una habilidad" / *Record a skill*):

1. Se activa la grabación — advertencia: no escribir contraseñas ni secretos.
2. Claude graba **pantalla, voz, clics y teclado**; aparece un marco naranja.
3. El usuario ejecuta la tarea manualmente una vez.
4. Al terminar (*Done*), Claude procesa los pasos y genera la skill reutilizable.

**Demo en vivo:** tomar un lead del CRM (Selfers) → copiar el teléfono → WhatsApp Web →
crear contacto → escribir y enviar mensaje de seguimiento. Claude registró **285 pasos**.

**Mejora continua** (2:07:56): al ejecutar la tarea, la IA puede proponer optimizaciones
y —previa aprobación— **mejorar su propia skill**, ejecutándola más rápido la próxima vez.

### 6.7 Extensión de Chrome

Ruta: ícono de descarga en Claude (abajo a la izquierda) → catálogo de extensiones
(Excel, PowerPoint, Chrome) → Chrome Web Store → instalar.

Permite invocar a Claude sobre la pestaña activa. Se usó para ejecutar la skill de
contacto sobre la lista real de leads (95 registros).

> **Matiz honesto del docente:** para una sola tarea es más lento que hacerlo a mano. El
> valor aparece con volumen — 100 o 200 contactos, analizando chats, enviando segundos
> mensajes y registrando el seguimiento.

**Otro caso real:** la pareja del docente necesitaba emitir facturas en el SII a partir
de cotizaciones. Claude entró al portal, identificó los campos, los rellenó y emitió la
factura.

### 6.8 Roleplay de cliente con voz

Cierre bonus (2:13:30–2:21:05), motivado por la evaluación de roleplay próxima.

**Método:**
1. Pedirle a la IA que genere un prompt de roleplay: *"soy asesor inmobiliario y necesito que actúes como un cliente interesado en comprar departamentos, con todos los rasgos humanos y de comportamiento de un cliente típico"*.
2. Pegar el prompt en la app móvil de ChatGPT.
3. Activar el **modo voz** (disponible también en la versión gratuita).
4. Conversar como si fuera un cliente real.

**Muestra del cliente simulado:**

> *"Tengo 37 años, trabajo en tecnología, lidero un equipo de producto. Me va bien pero
> vivo un poco corriendo… estoy en una mezcla de ambición y cierta cautela."*
>
> *"Es como una sensación de 'ya debería haberlo hecho'. Veo amigos que compraron hace
> años y me pega un poco. Pero también me frena el compromiso largo, el crédito, sentir
> que me ato."*

> *"El chat actúa como si fuera un cliente con sesgos, con miedos, con inseguridades, con
> ganas, con sueños."*

Existe además un prompt propio del docente, más contextualizado a la línea de venta del
programa, disponible en Slack y prometido para Recursos de la academia.

---

## 7. Privacidad de datos del cliente (1:16:00 – 1:21:30)

Pregunta de una alumna sobre subir RUT, nombre completo, domicilio y monto de arriendo
para generar un contrato.

**Respuesta dada:**

| Afirmación | Contenido |
| --- | --- |
| Filtración pública | *"Lo que nunca va a pasar es que la IA va a filtrar tu información de forma pública"* |
| Entrenamiento | Sí puede ocurrir que los datos se usen para **entrenar modelos** |
| Control | Todas las herramientas permiten desactivarlo. En ChatGPT: **Controles de datos → Mejorar el modelo para todos**. Incluye grabaciones de audio y video |
| Riesgo residual | Al ser una web, existe riesgo de vulnerabilidad, aunque bajo por la inversión en ciberseguridad |
| Mitigación total | **Modelos locales** — los datos nunca salen del computador |
| Memoria | Guarda fragmentos de lo conversado; razón adicional para usar cuentas personales |

> ⚠️ Esta respuesta contiene afirmaciones más categóricas de lo que corresponde y omite
> el marco legal chileno. Ver el análisis, §"Riesgo de cumplimiento".

---

## 8. Demos realizadas — balance

| # | Demo | Tramo | Resultado |
| --- | --- | --- | --- |
| 1 | Panel de uso de Claude (73%) | 0:36 | ✅ |
| 2 | Consumo de tokens en tiempo real | 0:36–0:40 | ❌ **Fallida** — ~4 min sin encontrarlo |
| 3 | Panel de Gemini | 0:47 | ✅ |
| 4 | Panel de ChatGPT | 0:52 | ✅ |
| 5 | Edición de imagen (living + mueble de TV) | 0:55 | ✅ |
| 6 | Tarea programada "Radar Inmobiliario Chile" | 1:06 | ✅ |
| 7 | Chat vs Work — preguntado a la propia IA | 1:14 | ✅ |
| 8 | Generar datos ficticios de cliente | 1:24 | ✅ |
| 9 | Propuesta de inversión → Word + PDF | 1:33–1:36 | ✅ |
| 10 | Organizar escritorio (2 iteraciones) | 1:35–1:42 | ✅ |
| 11 | Dribbble → presentación PowerPoint | 1:40–1:46 | ✅ |
| 12 | Grabar una skill (WhatsApp + CRM) | 1:48–1:53 | ⚠️ **Parcial** — se trabó al guardar el contacto |
| 13 | Ejecutar la skill vía extensión de Chrome | 2:01–2:09 | ⚠️ **Parcial** — abrió un navegador equivocado; terminó funcionando |
| 14 | Roleplay de cliente con voz | 2:17–2:20 | ⚠️ **Parcial** — audio del computador difícil de oír |

**Balance:** 9 exitosas, 4 parciales, 1 fallida. Las demos con mayor valor didáctico son
las de la segunda parte (9, 10, 11, 12).

---

## 9. Aplicaciones al rol inmobiliario

Inventario completo de la clase:

| # | Aplicación | Estado |
| --- | --- | --- |
| 1 | Radar diario de noticias + 10 ideas de contenido | ✅ Demostrado |
| 2 | Carpeta por cliente como contexto de trabajo | ✅ Demostrado |
| 3 | Llenar ficha de estado de situación desde documentos | ✅ Demostrado |
| 4 | Propuesta de inversión personalizada (Word + PDF) | ✅ Demostrado |
| 5 | Presentación comercial con diseño de referencia | ✅ Demostrado |
| 6 | Contactar leads por WhatsApp y registrar seguimiento | ✅ Demostrado |
| 7 | Segundo mensaje de seguimiento a leads sin respuesta | ✅ Explicado |
| 8 | Roleplay de cliente para practicar la venta | ✅ Demostrado |
| 9 | Organizar documentos que el cliente envía sueltos | ✅ Explicado |
| 10 | Sumar transcripción de reuniones al contexto del cliente | ✅ Explicado |
| 11 | Emitir facturas en el SII desde una cotización | ✅ Relatado |
| 12 | Decorar un piloto vacío a partir de una foto | ✅ Mencionado |
| 13 | Investigación de plusvalía por comuna (Deep Research) | ✅ Mencionado |
| 14 | Generación de contratos | Aportado por un alumno |

## 10. Interacción de la audiencia

| Momento | Intervención |
| --- | --- |
| 0:33 | **Nancy** — "¿Qué son los tokens?" → derivó en la mejor explicación de la primera parte |
| 0:36 | **Álvaro** — "¿Hay que llegar con una idea más desarrollada?" |
| 0:45 | Sondeo de herramientas: ChatGPT, Claude, Copilot |
| 0:45 | Alumna: no paga porque aún no sabe usarlo |
| 0:46 | **Álvaro** — usa IA para consolidar contratos |
| 1:09 | **Nancy** — *"Estoy anonadada con todo lo que se puede hacer"* |
| 1:16 | **Alumna** — pregunta extensa sobre protección de datos del cliente (RUT, domicilio) |
| 1:26 | **Alumna** — "ya tengo mis carpetas armadas a mano, ¿de qué me sirve la IA?" → uno de los mejores intercambios |
| 1:53 | **Alumna** — "¿cómo filtro a qué contacto le manda WhatsApp?" |
| 1:58 | **Alumna** — "¿cómo sabe el QR quién soy?" |
| 2:07 | **Alumno** — "¿contempla el segundo mensaje a un lead que no respondió?" |
| 2:11–2:13 | Cierre entusiasta: *"parece un mago"*, *"te deberían lanzar un diplomado solo de IA"* |

## 11. Frases ancla

> *"Aunque no sea literal, con IA todo es posible. Lo que ustedes menos se imaginen."*

> *"Antes se decía: ¿probaste googleando? Hoy lo cambio a: ¿probaste preguntándole a ChatGPT?"*

> *"La electricidad multiplicó nuestros músculos. La IA multiplica nuestra mente."*

> *"Yo estoy durmiendo y él está trabajando."*

> *"Para la IA no tenemos que saber de diseño, solo tenemos que tener buen gusto."*

> *"Nunca podemos delegar el criterio de un asesor inmobiliario."*

> *"Antes de preguntarme '¿se puede hacer?' — sí, se puede hacer."*

## 12. Compromisos asumidos con los alumnos

| # | Compromiso | Momento |
| --- | --- | --- |
| 1 | Subir las **skills** a Recursos de la academia | 2:08:43 |
| 2 | Subir el **prompt de roleplay** a Recursos | 2:21:05 |
| 3 | **Generar un quiz de la clase** y avisar por correo | 2:16:29 |
| 4 | Enviar una **encuesta anónima** de feedback | 2:12:34 |
| 5 | Enviar una **cápsula / video** con la configuración paso a paso | 2:10:16 |
| 6 | Compartir contenido adicional de IA en la academia | 2:12:34 |
| 7 | Disponibilidad para dudas técnicas por Slack o presencial | 2:11:48 |

**Pendientes de la primera parte que quedaron sin cerrar:**

- [ ] Dónde se visualiza el consumo de tokens en tiempo real (prometido en 0:40).
- [ ] Qué es **Artefactos** en Claude — quedó mal nombrado en 1:05:35.

## 13. Sugerencia surgida en clase

Varias alumnas propusieron abrir un **diplomado o módulo dedicado solo a IA aplicada**
("parte dos y tres"). El docente coincidió: *"dos horas es muy poco tiempo, podría estar
semanas enseñándoles cosas"*.

---

## Anexo — Correcciones de transcripción

| En la transcripción | Es realmente |
| --- | --- |
| Cloud | **Claude** |
| Word / word (modo) | **Work** |
| co-word / cowork | **Cowork** |
| prom / prono | **prompt** |
| guía / la guía | **IA** |
| leaks | **leads** |
| self / selfers | **Selfers** (CRM) |
| root | **RUT** |
| Antropic | **Anthropic** |
| Dribble | **Dribbble** |
| soned | **Sonnet** |
| Alkis / elquis / el Kistasa | **Elkis** |
| Deep Search | **Deep Research** |
| Canva (en contexto de lienzo) | **Canvas** |
