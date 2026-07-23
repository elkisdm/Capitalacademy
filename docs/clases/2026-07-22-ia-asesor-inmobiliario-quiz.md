---
clase: "IA aplicada al rol de asesor inmobiliario — De conversar a dirigir"
programa: "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria (4ª generación)"
docente: "Elkis Daza"
fecha_clase: 2026-07-22
scope: lesson
preguntas: 12
basado_en: "0:00 – 1:03:47 (primera mitad de la clase)"
---

# Quiz — IA aplicada al rol de asesor inmobiliario (parte 1)

## Configuración sugerida (`evaluations`)

| Campo | Valor |
| --- | --- |
| `scope` | `lesson` |
| `title` | Quiz — IA aplicada al rol de asesor inmobiliario (parte 1) |
| `passing_grade_pct` | `70` |
| `questions_per_attempt` | `10` (de 12 disponibles) |
| `max_attempts` | `3` |
| `min_completion_pct` | `80` |

> ⚠️ **Filtro aplicado.** Este quiz cubre solo contenido que es a la vez *dicho en clase*
> y *factualmente correcto*. Se excluyeron deliberadamente los datos de la clase que
> contienen errores de cifra o de atribución histórica (inversión en IA, porcentaje de
> código escrito por IA, quién acuñó el término "inteligencia artificial", cuál fue el
> primer modelo razonador, estadística NAR, distribución de tipos de mensaje). El detalle
> está en el informe de análisis, §"Errores factuales". **Corrige esos puntos con los
> alumnos antes de aplicar el quiz.**

---

## Preguntas

### P1 — `single_choice`
**¿Cuáles son las cuatro ideas con las que se explica prácticamente cualquier producto de inteligencia artificial?**

- A) Modelo, contexto, tokens y herramientas ✅
- B) Chat, imagen, video y voz
- C) Hardware, software, datos y usuarios
- D) ChatGPT, Claude, Gemini y Copilot

**Correcta:** A
**Justificación:** Es el andamiaje central de la clase (27:30–33:40). El modelo es el motor entrenado, el contexto es la información disponible al dar la indicación, los tokens son las unidades que se generan y consumen, y las herramientas son lo que permite a la IA ejecutar tareas.

---

### P2 — `single_choice`
**Según lo explicado en clase, ¿qué es fundamentalmente un gran modelo de lenguaje (LLM)?**

- A) Una base de datos que busca y devuelve la respuesta almacenada
- B) Un modelo matemático predictivo que estima cuál es la siguiente unidad de texto ✅
- C) Un cerebro digital con conciencia y razonamiento propio
- D) Un buscador de internet mejorado

**Correcta:** B
**Justificación:** La clase fue explícita: *"las IA como tal no tienen razonamiento, no tienen conciencia; es un modelo matemático prediciendo qué palabra viene después"*. El ciclo es: convertir texto en tokens → comparar con el contexto → calcular probabilidades → seleccionar la unidad → repetir.

---

### P3 — `single_choice`
**Una alumna preguntó si los tokens eran la cantidad de veces que se puede usar el chat gratis. ¿Qué son realmente?**

- A) La cantidad de mensajes gratuitos antes de pagar
- B) Los créditos que se compran por separado en cada herramienta
- C) La unidad con la que se mide el consumo de cómputo de la IA ✅
- D) Un sistema de puntos por antigüedad de la cuenta

**Correcta:** C
**Justificación:** La IA descompone el texto en tokens para procesarlo; ese procesamiento gasta cómputo, y el cómputo gasta electricidad. Los tokens son la forma de medir cuánto consume la IA. Cuanto más razona o relee un modelo, más tokens consume.

---

### P4 — `true_false`
**Afirmación: "La IA es puramente digital, por lo que su costo real de operación es prácticamente nulo."**

**Correcta:** Falso
**Justificación:** Uno de los puntos que más se subrayó: la IA corre sobre servidores físicos, el cómputo consume mucha electricidad y ese es el costo real. Además, hoy el servicio está subsidiado —las empresas pierden dinero con las suscripciones de ~USD 20 mensuales porque están en modo crecimiento— y los tokens podrían encarecerse.

---

### P5 — `single_choice`
**Estás preparando una propuesta para un cliente. Según la definición de "contexto" dada en clase, ¿qué corresponde entregarle a la IA?**

- A) Solo la instrucción "hazme una propuesta inmobiliaria"
- B) El nombre del proyecto y nada más, para no confundir al modelo
- C) El perfil del cliente, su renta y situación financiera, si quiere vivir o invertir, el proyecto de interés y la cotización realizada ✅
- D) El historial completo de todos tus clientes anteriores

**Correcta:** C
**Justificación:** El contexto es toda la información disponible al momento de dar la indicación. El ejemplo textual de la clase enumeró: cómo se llama, qué edad tiene, cuál es su renta, cómo es su perfil financiero, en qué proyecto está interesado, si quiere vivir o invertir, y qué cotización se le hizo.

---

### P6 — `single_choice`
**Tienes que hacer un análisis financiero complejo con IA. ¿Qué tipo de modelo conviene elegir y por qué?**

- A) Un modelo rápido o *lite*, porque responde de inmediato
- B) Un modelo razonador, porque piensa y descompone el problema en pasos antes de responder ✅
- C) Da lo mismo: todos los modelos de una misma marca dan el mismo resultado
- D) Un modelo de generación de imágenes, porque maneja mejor los datos

**Correcta:** B
**Justificación:** La clase distingue modelos de inferencia (responden de una vez, más rápidos) de modelos razonadores (piensan e iteran antes de responder, más inteligentes). La regla dada fue: para tareas complejas o que requieran buen análisis, usar siempre el modelo más inteligente.

---

### P7 — `multiple_choice`
**¿Cuáles de las siguientes son limitaciones reales de la IA señaladas en clase? (selecciona todas las que correspondan)**

- A) No reconoce la ironía ✅
- B) No puede detectar el miedo de un cliente ✅
- C) Es mala en matemáticas
- D) No capta bien las señales humanas y lo abstracto ✅
- E) No puede generar ni analizar imágenes

**Correctas:** A, B, D
**Justificación:** La clase describe la capacidad de la IA como "desigual": muy buena en matemáticas, generación de código y uso del computador (por eso C es falsa), pero frágil en todo lo que son señales humanas. E es falsa: varias herramientas generan y analizan imágenes. Este límite es justamente donde el asesor sigue siendo insustituible.

---

### P8 — `true_false`
**Afirmación: "Al crear una cuenta nueva en ChatGPT, Claude o Gemini, la herramienta ya viene conectada a tu correo, tu Drive y tu calendario."**

**Correcta:** Falso
**Justificación:** Textual de la clase: *"cuando ustedes abran su cuenta, su cuenta no va a tener ninguna conexión, no va a tener acceso a casi ninguna herramienta"*. Hay que habilitarlas manualmente desde configuración, donde además se ven los permisos que otorga cada conector.

---

### P9 — `single_choice`
**El menú donde se habilitan las integraciones con Gmail, Drive o calendario recibe un nombre distinto en cada herramienta. ¿Cuál es la correspondencia correcta?**

- A) ChatGPT: Complementos — Claude: Conectores — Gemini: Plugins ✅
- B) ChatGPT: Plugins — Claude: Complementos — Gemini: Conectores
- C) ChatGPT: Conectores — Claude: Plugins — Gemini: Complementos
- D) Las tres lo llaman igual: Integraciones

**Correcta:** A
**Justificación:** Se recorrió en vivo la configuración de las tres herramientas. La nomenclatura cambia pero la función es la misma: dar acceso controlado a la suite de herramientas del día a día.

---

### P10 — `single_choice`
**En la demo "Radar Inmobiliario Chile", ¿qué función se utilizó y qué la hace distinta de una consulta normal?**

- A) Deep Research, porque investiga la web durante 30 minutos
- B) Canvas, porque permite editar en simultáneo con la IA
- C) Una tarea programada, porque se ejecuta sola de forma recurrente sin que vuelvas a pedirlo ✅
- D) Un conector de Gmail, porque lee el correo entrante

**Correcta:** C
**Justificación:** Se programó una tarea diaria a las 8:00 de Santiago que busca noticias del rubro inmobiliario en Chile, arma un resumen y genera 10 ideas de contenido, con entrega automática por correo. La diferencia con un chat es que se ejecuta de forma autónoma y recurrente.

---

### P11 — `single_choice`
**Según la analogía central de la clase, ¿cuál es la relación entre la electricidad y la IA?**

- A) La electricidad multiplicó nuestros músculos; la IA multiplica nuestra mente ✅
- B) La electricidad fue más importante que la IA
- C) Ambas reemplazaron trabajadores en la misma proporción
- D) La IA reemplazará a la electricidad como fuente de energía

**Correcta:** A
**Justificación:** La electricidad dio energía a las máquinas y luz a los hogares, multiplicando la capacidad física. La IA hace lo equivalente con la capacidad intelectual. De ahí se desprende el mensaje sobre el empleo: no reemplaza, transforma e impulsa —siempre y cuando se adopte.

---

### P12 — `short_answer`
**Eres asesor inmobiliario y quieres practicar la conversación con un cliente difícil antes de una reunión real. Describe brevemente cómo usarías la IA para lograrlo.**

**Respuesta esperada (elementos clave):**
Pedirle a la IA que **actúe como el cliente** —no como asesor—, entregándole el **contexto** del perfil: situación financiera, si busca vivir o invertir, sus objeciones, sesgos y actitudes. Luego sostener la conversación con ella como si fuera el cliente real, para practicar el manejo de objeciones.

**Criterios de corrección** (aprueba con 2 de 3):
1. Menciona que la IA debe adoptar el rol del cliente.
2. Menciona entregarle contexto o un perfil específico.
3. Menciona el propósito de practicar/entrenar la conversación de venta.

---

## Distribución del quiz

| Tipo | Preguntas | Total |
| --- | --- | --- |
| `single_choice` | P1, P2, P3, P5, P6, P9, P10, P11 | 8 |
| `true_false` | P4, P8 | 2 |
| `multiple_choice` | P7 | 1 |
| `short_answer` | P12 | 1 |

| Nivel cognitivo | Preguntas | Total |
| --- | --- | --- |
| Recordar / comprender | P1, P2, P3, P4, P8, P9, P11 | 7 |
| Aplicar / analizar | P5, P6, P7, P10, P12 | 5 |

**Cobertura temática:** conceptos base (P1, P2), economía de tokens (P3, P4),
contexto aplicado (P5), elección de modelo (P6), límites (P7), conectores (P8, P9),
automatización (P10), marco de empleo (P11), aplicación al rol (P12).

---

## Carga en la plataforma

```json
{
  "evaluation": {
    "scope": "lesson",
    "title": "Quiz — IA aplicada al rol de asesor inmobiliario (parte 1)",
    "passing_grade_pct": 70,
    "questions_per_attempt": 10,
    "max_attempts": 3,
    "min_completion_pct": 80
  },
  "questions": [
    { "n": 1,  "question_type": "single_choice",   "correct_option": "A" },
    { "n": 2,  "question_type": "single_choice",   "correct_option": "B" },
    { "n": 3,  "question_type": "single_choice",   "correct_option": "C" },
    { "n": 4,  "question_type": "true_false",      "correct_answer": false },
    { "n": 5,  "question_type": "single_choice",   "correct_option": "C" },
    { "n": 6,  "question_type": "single_choice",   "correct_option": "B" },
    { "n": 7,  "question_type": "multiple_choice", "correct_answer": ["A", "B", "D"] },
    { "n": 8,  "question_type": "true_false",      "correct_answer": false },
    { "n": 9,  "question_type": "single_choice",   "correct_option": "A" },
    { "n": 10, "question_type": "single_choice",   "correct_option": "C" },
    { "n": 11, "question_type": "single_choice",   "correct_option": "A" },
    { "n": 12, "question_type": "short_answer",    "correct_answer": "revisión manual" }
  ]
}
```

> Nota: `correct_option` acepta A–F desde la migración `0080_quiz_correct_option_af.sql`.
> Las preguntas `short_answer` requieren corrección manual desde el panel docente.

---

## Pendiente

Cuando llegue la transcripción de la segunda mitad, este quiz debe **ampliarse a ~20
preguntas** para cubrir la clase completa —o dividirse en dos evaluaciones de `scope`
`lesson`, una por tramo.
