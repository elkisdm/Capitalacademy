---
clase: "IA aplicada al rol de asesor inmobiliario — De conversar a dirigir"
programa: "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria (4ª generación)"
docente: "Elkis Daza"
fecha: 2026-07-22
modalidad: "En vivo por Zoom"
asistentes: "~19 alumnos (21 en sala, incluye equipo)"
cobertura: "0:00 – 1:03:47 (PRIMERA MITAD)"
estado: "PARCIAL — pendiente documentar la segunda mitad"
transcripcion: "./2026-07-22-ia-asesor-inmobiliario-transcripcion.md"
---

# Documentación de clase — IA aplicada al rol de asesor inmobiliario

> **Alcance de este documento.** Cubre solo la primera mitad de la sesión
> (hasta 1:03:47, donde la transcripción se corta a media frase). Los bloques
> anunciados en clase pero no dictados aún en este tramo —demo de roleplay con
> voz, ejercicios prácticos, "un par de ejemplos que estuve explorando hoy"—
> quedan pendientes de documentar.

---

## 1. Ficha

| Campo | Valor |
| --- | --- |
| Título declarado | "De conversar a dirigir" — IA aplicada al rol de asesor inmobiliario |
| Duración documentada | 64 minutos |
| Inicio real del contenido | 6:24 (los primeros ~6 min son sala de espera y conversación informal) |
| Formato | Presentación web interactiva + demos en vivo sobre Claude, ChatGPT y Gemini |
| Nivel de la audiencia | Mixto — declarado por el docente a partir de una encuesta previa |
| Prerrequisitos | Ninguno |

## 2. Objetivos declarados

El docente enunció cuatro objetivos en 6:24–7:30:

1. Entender qué es la IA y, en particular, la **IA generativa** que se popularizó en 2022 con ChatGPT.
2. Entender **lo esencial que cambió este año**, dado el ritmo de avance.
3. **Distinguir sus distintas formas** — la IA no es solo un chat; alimenta otro tipo de herramientas.
4. **Explorar formas prácticas de aplicarla al rol de asesor inmobiliario** (con la aclaración de que las bases sirven para cualquier rubro y para proyectos personales).

**Cobertura en esta mitad:** objetivos 1, 2 y 3 quedan cubiertos. El objetivo 4 se
aborda de forma dispersa y minoritaria (ver §7).

## 3. Estructura y tiempos

| Tramo | Bloque | Duración |
| --- | --- | --- |
| 0:00 – 6:24 | Sala de espera, conversación informal, comentarios sobre notas del roleplay | 6 min |
| 6:24 – 12:00 | Bienvenida, objetivos y presentación personal del docente | 5,5 min |
| 12:00 – 17:30 | Línea histórica de la IA (Turing → agentes 2026) | 5,5 min |
| 17:30 – 20:00 | Qué puede hacer hoy la IA + horizonte de tareas de larga duración | 2,5 min |
| 20:00 – 22:00 | Bucle de auto-mejora: la IA construye el software que la acelera | 2 min |
| 22:00 – 27:30 | Industria, adopción, escalera de madurez de uso, impacto en el empleo | 5,5 min |
| 27:30 – 33:40 | Qué es un LLM + las **4 ideas** (modelo, contexto, tokens, herramientas) | 6 min |
| 33:43 – 42:13 | Pregunta sobre tokens + explicación + **demo fallida** de consumo de tokens | 8,5 min |
| 42:13 – 45:18 | Mapa de actores (Anthropic, OpenAI, Google, modelos abiertos, Higgsfield, ElevenLabs) | 3 min |
| 45:18 – 47:00 | Sondeo: quién usa qué herramienta | 1,5 min |
| 47:00 – 1:03:47 | Tour práctico: Gemini → ChatGPT → conectores → **tareas programadas** | 17 min |

**Distribución aproximada:** ~55 % teoría y contexto, ~35 % tour de herramientas
(demo del docente), ~10 % pérdida por fallas técnicas. **0 % de práctica ejecutada
por el alumno** en este tramo.

## 4. Contenido conceptual

### 4.1 Línea histórica presentada

| Hito | Contenido según la clase |
| --- | --- |
| Alan Turing | Primeras ideas sobre máquinas que piensan; referencia a la película *El código Enigma* y al descifrado de la máquina nazi |
| 1956, Dartmouth | El campo de la programación recibe el nombre "Inteligencia Artificial" |
| 1959 | Aparece el término *Machine Learning*, base del aprendizaje de las máquinas |
| 1997 | **Deep Blue** (IBM) derrota al campeón mundial de ajedrez Garry Kasparov |
| 2009 | **ImageNet**: millones de imágenes aceleran el aprendizaje visual; raíz del análisis y la generación de imágenes actual |
| — | Redes profundas / *deep learning* / redes neuronales |
| 2017 | **"Attention is all you need"** (Google) — punto de inflexión, base de los grandes modelos de lenguaje |
| 2022 | Salida pública de la IA generativa con ChatGPT |
| 2024 | Primeros **modelos razonadores**: piensan antes de responder, descomponen el problema en pasos |
| 2025–2026 | **IA agéntica**: delegar tareas complejas y autónomas, no solo consultar |

> ⚠️ Este bloque contiene imprecisiones factuales relevantes. Ver el informe de
> análisis, §"Errores factuales", antes de reutilizar estas afirmaciones.

### 4.2 Qué es un LLM

Un gran modelo de lenguaje (LLM) es un **modelo predictivo** — un modelo matemático
avanzado que predice cuál es la próxima palabra. El ciclo que describió:

1. Convierte el texto en **tokens** (una palabra, parte de una palabra, un número, un signo).
   Ejemplo dado: "inmobiliario" = 3 tokens.
2. Compara cada parte con el **contexto**.
3. **Calcula probabilidades** y selecciona la siguiente unidad.
4. Añade el contexto y **vuelve a empezar** hasta terminar.

Conclusión del docente: *"las IA como tal no tienen razonamiento, no tienen conciencia;
es un modelo matemático prediciendo qué palabra viene después"*.

### 4.3 Las 4 ideas que explican cualquier producto de IA

Este es el andamiaje central de la clase.

| Idea | Definición dada |
| --- | --- |
| **Modelo** | El motor entrenado. Distintos modelos optimizan calidad, velocidad, costo o especialización. ChatGPT, Claude y Gemini son modelos, y cada uno tiene submodelos |
| **Contexto** | Toda la información disponible al momento de dar la indicación. Ejemplo inmobiliario: perfil del cliente, nombre, edad, renta, perfil financiero, proyecto de interés, si quiere vivir o invertir, la cotización que se le hizo |
| **Tokens** | Las unidades que la IA genera y consume. Nueva "moneda de valor" |
| **Herramientas** | Lo que lleva a la IA de ser un chat a ejecutar tareas: navegador, correo, archivos, CRM, hojas de cálculo |

### 4.4 Tokens, cómputo y economía de la IA

Explicación desarrollada a partir de la pregunta de una alumna (33:43):

- Los tokens son **la forma de medir el consumo** de la IA, no un cupo de mensajes gratuitos.
- Leer o razonar sobre un texto **gasta cómputo**; el cómputo es servidores físicos; los servidores **gastan electricidad**. Aunque parezca algo puramente digital, la IA consume mucha energía.
- Cuanto más razona o relee un modelo, más tokens y más cómputo consume.
- Los planes pagos muestran una **barra de uso** que se reinicia periódicamente (el docente mostró la suya al 73 %, con reinicio el sábado a las 3 AM).
- **La IA está hoy subsidiada**: las empresas están en modo crecimiento y pierden dinero con las suscripciones de ~USD 20/mes. Es posible que los tokens se encarezcan.
- Alternativa a futuro: **modelos locales / de código abierto**, ejecutables sin conexión, hoy limitados por la potencia del equipo.

### 4.5 Escalera de madurez de uso

Progresión presentada (22:00–23:30):

1. **Preguntar** — consultas sueltas sin cuenta.
2. **Usar con cuenta** — correos, textos, borradores.
3. **Integrar al trabajo diario** — datos de clientes, procesos.
4. **Construir con IA** — páginas web, aplicaciones, agentes, productos nuevos. *"La joya de la corona"*, y lo que más está creciendo.

### 4.6 Impacto en el empleo

- Uno de cada cuatro empleos tiene **algún grado de exposición** a la IA generativa; exposición **no** significa desaparición sino transformación.
- **Mayor exposición:** ingreso de datos y digitación, contabilidad, tareas administrativas, secretaría, preparación de documentos, análisis financiero y —curiosamente— la programación.
- **Menor exposición:** trabajo físico, construcción, cuidado personal; tareas con contacto físico y atención humana.
- **Fórmula recomendada:** *expertise de dominio + IA*. Un programador con IA hace lo mismo multiplicado por 10, pero sigue necesitando el conocimiento base.
- **Analogía central:** la electricidad multiplicó nuestros músculos; **la IA multiplica nuestra mente**.
- Ejercicio propuesto al alumno: preguntarle al chat *"¿cómo puede la IA ayudarme en este trabajo/rubro concreto?"*.

### 4.7 Límites de la IA

Capacidad desigual: muy buena en matemáticas, generación de código y uso del
computador; **frágil en señales humanas** — no reconoce la ironía, ni el miedo de un
cliente, ni lo abstracto que un humano capta al leer a otra persona.

> Punto especialmente pertinente para un diplomado de ventas: delimita dónde el
> asesor sigue siendo insustituible.

## 5. Mapa de herramientas presentado

| Actor / Herramienta | Qué se dijo |
| --- | --- |
| **Claude** (Anthropic) | Modelo recomendado por el docente para tareas. Mejor para programar y para tareas de larga duración. Consume su cuota más rápido. **No genera imágenes** |
| **ChatGPT** (OpenAI) | Muy bueno y de cuota más duradera. **Mejor modelo de imágenes del mercado** hoy: editar fotos, crear creativos de marketing y anuncios con alta consistencia |
| **Gemini** (Google) | Integrado con el ecosistema Google (calendario, correo). Único de los tres que **genera video**. Genera imágenes con *NanoBanana* y también música |
| **Modelos abiertos** | Llama (Meta), Mistral (Francia), modelos de Alibaba. Descargables y gratuitos; la velocidad depende de la potencia del equipo |
| **Higgsfield** | Herramienta dedicada a la **generación de contenido visual**; propuesta como solución para quien no logra consistencia de escenas en video con IA |
| **ElevenLabs** | Referente en **IA conversacional de voz**: clonar la voz, crear agentes autónomos y llamadas automáticas muy naturales |
| **Copilot** (Microsoft) | Mencionado a partir de un alumno. Microsoft fue uno de los mayores inversores de OpenAI; Copilot se apoya en modelos de OpenAI |

### 5.1 Elegir el modelo correcto

Distinción operativa enseñada:

- **Modelos de inferencia**: responden de inmediato, más rápidos.
- **Modelos razonadores**: piensan antes de responder, más inteligentes.

> **Regla dada:** para tareas complejas o que requieran buen análisis, usar siempre
> el modelo más inteligente. La propia interfaz describe qué hace cada submodelo.

### 5.2 Funciones comunes de los paneles

- **Adjuntar archivos** (hojas de cálculo, documentos).
- **Generación de imágenes, video y música** (según la herramienta).
- **Canvas** — lienzo de trabajo colaborativo: la IA produce un documento o diapositiva y el usuario **edita en simultáneo**, al estilo de Google Sheets.
- **Deep Research** (llamado "Deep Search" en clase) — investigación profunda. La IA despliega múltiples agentes que recorren la web y sintetizan un informe. Puede tardar 10–30 minutos. Ejemplo propuesto: *"investiga la plusvalía de todas las comunas de la Región Metropolitana desde 1996 hasta 2026"*.
- **Línea de pensamiento visible** — al tocar el indicador "pensando" se ve cómo razona el modelo.

### 5.3 Conectores

Están en **Configuración**, con distinto nombre según la herramienta:

| Herramienta | Nombre del menú |
| --- | --- |
| ChatGPT | Complementos |
| Claude | Conectores |
| Gemini | Plugins |

Punto clave: **una cuenta nueva no tiene ninguna conexión activa**; hay que
habilitarlas. Cada conector muestra sus permisos explícitos.

- **Gmail** — leer, buscar, organizar, archivar, modificar y en algunos casos enviar correos.
- **Google Drive** — leer y buscar documentos, cargar archivos, leer presentaciones y hojas de cálculo.
- **Calendario** — habilitarlo toma dos clics.

Uso ejemplificado: *"revisa mis correos de hoy, clasifícalos y dime cuáles son los más urgentes"*.

### 5.4 Tareas programadas

Función disponible en varias herramientas (en ChatGPT aparece como **"Programado"**).
Permite ejecutar instrucciones de forma automática y recurrente.

**Demo ejecutada en vivo — "Radar Inmobiliario Chile":**

> *Todos los días a las 8:00 AM: busca noticias de la industria inmobiliaria en Chile,
> hazme un resumen y, a partir de esas noticias, genérame 10 ideas de contenido para
> mi perfil de asesor inmobiliario.*

La tarea quedó activa, con entrega diaria por correo a las 8:00 hora de Santiago, e
incluyó elementos que **el docente no pidió** y que el modelo agregó por su cuenta:

- Resumen ejecutivo **con las fuentes**.
- Impacto segmentado por compradores, inversionistas, propietarios, arrendatarios y desarrolladores.
- Riesgos, oportunidades y señales relevantes.
- 10 ideas de contenido, cada una con *hook*, enfoque, formato, desarrollo y llamado a la acción.
- Prioriza las últimas 24 horas y evita repetir ideas.

**Lección extraída en clase:** el modelo tomó la petición y la mejoró por sobre lo
solicitado.

Otro caso propuesto: *"revisa los correos, extrae las tareas que me asignaron y
colócalas en mi calendario"*.

## 6. Demos realizadas

| # | Demo | Resultado |
| --- | --- | --- |
| 1 | Panel de uso de Claude (barra de consumo al 73 %) | ✅ Exitosa |
| 2 | Mostrar el consumo de tokens en tiempo real durante una respuesta | ❌ **Fallida** — ~4 minutos buscando sin encontrar la opción; se cerró con *"ahora si me acuerdo de dónde se muestra, les expando allí"* |
| 3 | Recorrido por el panel de Gemini (modelos, plugins, Canvas, Deep Research) | ✅ Exitosa |
| 4 | Recorrido por el panel de ChatGPT (submodelos, complementos) | ✅ Exitosa |
| 5 | Edición de imagen: foto real del living del docente + mueble de TV; luego iluminación | ✅ Exitosa — alta consistencia del espacio |
| 6 | Creación de la tarea programada "Radar Inmobiliario Chile" | ✅ Exitosa — la mejor demo del tramo |

## 7. Aplicaciones al rol inmobiliario mencionadas

Recopilación de todo lo que ancla explícitamente al público objetivo:

1. **Radar de noticias diario** con ideas de contenido para el perfil de asesor (demostrado).
2. **Decorar/ambientar un piloto vacío** a partir de una foto, al gusto del cliente, y usarlo también como idea de contenido (derivado de la demo del living).
3. **Roleplay con un cliente simulado** — pedirle a la IA que actúe como cliente con sesgos, actitudes y perfil financiero, para practicar. *Mencionado; la demo quedó anunciada, no ejecutada en este tramo.*
4. **Investigación de plusvalía por comuna** vía Deep Research. *Mencionado como ejemplo.*
5. **Generación de contratos** a partir de varios contratos existentes. *Aportado por un alumno (Álvaro), no desarrollado por el docente.*
6. **Propuestas y cotizaciones a cliente** usando el perfil del cliente como contexto. *Usado como ejemplo para explicar "contexto".*

## 8. Interacción de la audiencia

| Momento | Intervención |
| --- | --- |
| 33:43 | **Nancy** — "¿Qué son los tokens? ¿Es la cantidad de veces que puedo usar el chat gratis?" → derivó en la mejor explicación de la clase |
| 34:06 | Pregunta de seguimiento: ¿el panel de uso solo aparece pagando? |
| 36:16 | **Álvaro** — "¿Tenemos que llegar con una idea general más desarrollada al momento de interactuar?" → respuesta: es bueno "pimponear" con la IA |
| 45:18 | Sondeo de herramientas: ChatGPT, Claude (uno pagando), Copilot |
| 45:40 | Alumna: no paga porque aún no sabe usarlo — *"si no la sé ocupar, ¿para qué voy a pagar?"* |
| 46:34 | **Álvaro** — usa IA para consolidar varios contratos en uno |
| 1:03:43 | **Nancy** — *"Estoy anonadada con todo lo que se puede hacer"* |

Contexto relevante: los propios alumnos comentaron al inicio que **nadie enciende la
cámara** y que eso resulta incómodo para el docente.

## 9. Frases ancla de la clase

> *"Aunque no sea literal, con IA todo es posible. Lo que ustedes menos se imaginen."*

> *"Antes se decía: ¿probaste googleando? Hoy lo cambio a: ¿probaste preguntándole a ChatGPT?"*

> *"La electricidad multiplicó nuestros músculos. La IA multiplica nuestra mente."*

> *"No es algo que nos va a reemplazar, es algo que va a impulsar nuestro trabajo, siempre y cuando lo adoptemos."*

> *"Yo estoy durmiendo y él está trabajando."*

## 10. Pendientes anunciados y no cubiertos en este tramo

- [ ] Demo de **roleplay de cliente con voz** (anunciada en 44:50).
- [ ] Explicar la diferencia entre **"Chat" y "Work"** en ChatGPT (prometido en ~50:00).
- [ ] *"Un par de ejemplos que estuve explorando hoy por primera vez para ustedes"* (anunciado en 1:03:47, justo donde corta la transcripción).
- [ ] **Ejercicios prácticos** para el alumno (anunciados desde 32:00).
- [ ] Retomar dónde se visualiza el consumo de tokens (comprometido en 40:25).

---

## Anexo — Correcciones de transcripción

La transcripción automática introduce errores sistemáticos. Equivalencias:

| En la transcripción | Es realmente |
| --- | --- |
| Cloud | **Claude** |
| guía generativa / la guía | **IA generativa / la IA** |
| leaks | **leads** |
| PROM | **prompt** |
| Deep Search | **Deep Research** |
| el Kistasa | **Elkis Daza** |
| JCPT / EPT / chat gpt | **ChatGPT** |
| Higgsfield / HiggsField | Higgsfield |
| pimponear | *peloteo de ideas con la IA* |

Además, la diarización asigna mal varios turnos: hay intervenciones del docente
atribuidas a alumnas (p. ej. 46:07 y 55:28) y viceversa.
