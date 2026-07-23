---
tipo: "Diseño de encuesta anónima post-clase"
clase: "IA aplicada al rol del asesor — De conversar a dirigir"
programa: "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria (4ª generación)"
fecha_clase: 2026-07-22
docente: "Elkis Daza"
estado: "Listo para enviar — pendiente confirmar URL del formulario"
---

# Encuesta anónima de feedback — clase de IA (2026-07-22)

> Compromiso asumido en vivo por el docente al cierre de la clase: *"les voy a enviar
> por ahí una encuesta, es más anónima, para que puntúen y den feedback acerca de la
> clase"*. Este documento define las preguntas finales.

## Pendiente antes de enviar

**La URL del formulario es un placeholder** (`https://capitalinteligente.com/s/feedback-clase-ia-2026`)
y debe confirmarse — el formulario real (Google Forms, Typeform u otro) debe crearse
con las preguntas de este documento y su link reemplazar la constante `SURVEY_URL` en
`scripts/send-encuesta-feedback-clase-ia.mjs` antes de correr `send`.

**El formulario debe configurarse para NO recolectar el email del respondente**
(desactivar "Recopilar direcciones de correo electrónico" si es Google Forms) — de lo
contrario la anonimidad se rompe del lado del formulario aunque el link de envío sea
limpio.

## Principios de diseño

- 9 preguntas, pensadas para completarse en ~3 minutos.
- Mayoría de preguntas cerradas (4 de escala 1–5 + 2 de opción múltiple) para que
  responder sea rápido; 3 preguntas abiertas, que son las que aportan valor real.
- Ninguna pregunta evalúa al docente como persona — el objetivo es mejorar la clase,
  no calificar a Elkis.
- El check de "¿practicaste?" se formula sin tono de reproche (se pregunta junto con
  "qué te frena", no como un sí/no aislado).

## Preguntas finales

### 1. Utilidad práctica — escala 1 a 5

**"En general, ¿qué tan aplicable a tu trabajo sientes lo que viste en la clase de IA?"**
(1 = nada aplicable · 5 = muy aplicable)

> Mide si el alumno se llevó algo que de verdad puede usar en su rol de asesor, más
> allá de si la clase le pareció interesante.

### 2. Bloque más útil — opción múltiple (una respuesta)

**"¿Qué bloque de la clase te pareció más útil?"**

- Fundamentos de IA (qué es, tokens, contexto)
- Herramientas y conectores (Claude, ChatGPT, Gemini)
- Carpeta por cliente y propuestas de inversión
- Diseño y presentaciones con IA
- Skills y automatización de seguimiento a leads
- Roleplay de cliente con voz

> Identifica qué bloque real aterrizó mejor entre los alumnos, para reforzarlo o
> repetirlo en próximas clases.

### 3. Ritmo y densidad — opción múltiple (una respuesta)

**"¿Hubo algún momento en que sentiste que la clase avanzó más rápido de lo que
alcanzabas a seguir? ¿Cuál?"**

- Fundamentos de IA (qué es, tokens, contexto)
- Herramientas y conectores (Claude, ChatGPT, Gemini)
- Carpeta por cliente y propuestas de inversión
- Diseño y presentaciones con IA
- Skills y automatización de seguimiento a leads
- Roleplay de cliente con voz
- No, pude seguir el ritmo sin problema

> Mide si la densidad de la clase perdió gente y, sobre todo, **en qué bloque**
> concreto — el dato que permite repartir mejor el tiempo la próxima vez.

### 4. Claridad conceptual — escala 1 a 5

**"¿Qué tan claras te quedaron ideas como tokens, contexto y 'modo agente'?"**
(1 = muy confuso · 5 = muy claro)

> Mide si el andamiaje conceptual de la clase se entendió, independiente de si el
> alumno disfrutó las demos.

### 5. Barrera para empezar — escala 1 a 5

**"¿Qué tan preparado/a te sientes hoy para empezar a usar esto por tu cuenta?"**
(1 = no sabría por dónde partir · 5 = me siento listo/a)

> Dimensiona con un número cuánta gente sigue en el estado de "tengo un millón de
> dudas para poder configurar esto", que se escuchó en vivo durante la clase.

### 6. Práctica y obstáculo concreto — abierta

**"Desde la clase, ¿ya probaste algo de lo que vimos? Cuéntanos cómo te fue, o qué es
lo que te frena para partir."**

> Combina el check de si hubo práctica real después de la clase con el detalle de
> qué le falta a quien no ha partido — en un tono de acompañamiento, no de examen.

### 7. Intención de uso concreta — abierta

**"¿Qué es lo primero que te gustaría aplicar en tu trabajo esta semana?"**

> La intención concreta y de corto plazo es el mejor predictor de que lo visto en
> clase se traduzca en uso real, más que cualquier pregunta de satisfacción.

### 8. Qué faltó — abierta

**"¿Qué faltó, o qué te habría gustado ver con más profundidad?"**

> Recoge vacíos y demanda que no aparecen en las preguntas cerradas — incluye
> espacio para que quien quiera pedir más contenido de IA lo diga con sus palabras.

### 9. Interés en más formación de IA — escala 1 a 5

**"¿Qué tan interesado/a estás en que la academia ofrezca más formación dedicada a IA
(un módulo o curso aparte)?"**
(1 = nada interesado/a · 5 = muy interesado/a)

> Varias alumnas pidieron espontáneamente en vivo un diplomado o módulo dedicado a
> IA; esta pregunta dimensiona esa demanda con un dato duro en vez de depender solo
> de comentarios sueltos.

## Resumen de tipos

| # | Pregunta | Tipo |
| --- | --- | --- |
| 1 | Utilidad práctica | Escala 1–5 |
| 2 | Bloque más útil | Opción múltiple |
| 3 | Dónde se perdió el ritmo | Opción múltiple |
| 4 | Claridad conceptual | Escala 1–5 |
| 5 | Preparación para empezar | Escala 1–5 |
| 6 | Práctica y obstáculo | Abierta |
| 7 | Intención de uso esta semana | Abierta |
| 8 | Qué faltó | Abierta |
| 9 | Interés en más formación de IA | Escala 1–5 |
