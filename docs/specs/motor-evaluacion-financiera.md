# Motor de Evaluación Financiera

**Clasificación**: `feat` · large · **riesgo alto** · known (tras la exploración del 7-ago) · toca `lib/credito/`, `lib/evaluacion/`, `components/evaluacion/`, `app/(classroom)/`
**Tier**: 3 — Full
**Estado**: especificado, sin implementar
**Fecha**: 2026-08-10 (continúa la sesión de especificación del 2026-08-07)
**ADR**: 0032 (por escribir — ojo: el devlog del 7-ago lo llama "0031", número que ese
mismo día tomó LiveKit)

---

## Objetivo

Que el asesor complete la Ficha de Estado de Situación de su cliente (Paso 7 de la
metodología comercial), presione **"Analizar capacidad de compra"** y obtenga en segundos
—durante la misma reunión— hasta qué valor de propiedad puede evaluar ese cliente, con un
veredicto legible que le permita conducir la conversación hacia el Paso 8.

La frase que la herramienta tiene que habilitar es:

> "Con este perfil financiero, hoy podríamos evaluar propiedades hasta aproximadamente
> 3.850 UF."

**No es una calculadora hipotecaria más.** La calculadora pública responde
`valor de propiedad → dividendo`. Esta responde `situación financiera → valor máximo de
propiedad`. Es la función inversa, y ese es el hallazgo que reordena todo el trabajo.

---

## Lo que ya existe y se reusa

`lib/credito/calculo.ts` (ADR-0027) aporta, sin cambios:

| Pieza | Qué resuelve |
|---|---|
| `reconocerIngresos()` | Castigos por fuente: sueldo 100%, boletas 70% (mín. 3), arriendo 100%, retiros 70% |
| `rentaFinal()` | Ingreso reconocido − cuotas vigentes |
| `califica()` | Umbral de renta mínima ($1.400.000) |
| `plazoMaximoPorEdad()` | Mayor plazo de {15,20,25,30} tal que `edad + plazo ≤ 79` |
| `tasaMensual()`, `dividendo()` | Anualidad francesa |
| `lib/indicadores/uf.ts` | UF en vivo, caché 12 h, fallback que no se cachea |
| `lib/utils/rut.ts`, `lib/utils/money.ts` | Validación de RUT y formateo CLP/UF |

**Aproximadamente la mitad del motor ya está escrita y probada.** Lo que falta es el
despeje inverso y tres topes nuevos.

---

## Decisiones tomadas (cerradas el 2026-08-10)

### D1 — v1 no guarda nada de la ficha

La ficha vive **solo en el navegador** durante la reunión. Al cerrar la pestaña, los datos
del cliente desaparecen. El asesor se lleva el resultado en PDF.

**Por qué**: la ficha contiene datos financieros de un tercero identificado —RUT, renta,
deudas, patrimonio— que no es usuario de la plataforma y no aceptó ningún término. Guardar
eso activa la Ley 21.719: consentimiento, política de retención, derecho a supresión, y
decidir qué pasa con las fichas cuando un asesor deja la empresa. **Agregar persistencia
después es barato; quitarla cuando ya hay 200 fichas cargadas no lo es.**

Consecuencias aceptadas:
- El asesor no puede retomar una ficha a medio llenar ni comparar evaluaciones.
- No hay historial ni analítica de uso.
- **Cero migraciones y cero RLS en v1.**

### D2 — La regla 25%/30% NO toca la calculadora pública

| Herramienta | Carga máxima |
|---|---|
| `/calculadora-credito` (pública, en producción) | **25% fija** — sin cambios |
| Motor de Evaluación (nueva) | **25% bajo $2.500.000 · 30% desde $2.500.000** |

**Por qué**: la pública ya está en producción captando leads y sus resultados calzan con
la planilla que Paola valida. Cambiarle la carga aflojaría los números publicados para
rentas altas (una renta de $3.000.000 pasaría de $750.000 a $900.000 de dividendo tope)
sin que nadie lo haya pedido.

`CARGA_MAXIMA` se conserva tal cual; la regla nueva vive aparte en `lib/credito/capacidad.ts`.

### D3 — Manda el tope MENOR (inferido, no preguntado)

Los tres topes se calculan por separado y **gana el más restrictivo**. La regla de
"60 veces la renta" y la capacidad de dividendo dan cifras distintas y ninguna es
"la correcta": son restricciones simultáneas.

Se elige el mínimo porque el error barato es quedarse corto. Si la herramienta sobreestima,
el asesor ilusiona al cliente en la reunión y el banco lo rechaza semanas después — el peor
resultado posible para la metodología comercial que esta herramienta debe apoyar.

### D4 — El semáforo es determinista, sin IA

Cinco ejes con reglas explícitas. **No se usa un LLM.** Razones: dos asesores con la misma
ficha deben ver exactamente lo mismo; el resultado tiene que ser auditable frente al banco;
tiene que ser instantáneo (en una reunión no se esperan 4 segundos); y un modelo puede
alucinar cifras financieras. Una capa de lenguaje natural solo tendría sentido *encima* de
números ya calculados.

### D5 — El perfil se calcula solo desde los inputs

El % de financiamiento sugerido depende del perfil, y el perfil **no puede mirar la
capacidad** — sería circular (la capacidad depende del financiamiento, que dependería del
perfil, que miraría la capacidad). El perfil se deriva únicamente de los datos ingresados,
y recién después alimenta el financiamiento.

---

## La cadena de cálculo

```
  Ficha del cliente
        │
   1 ── reconocerIngresos()          [existe]  sueldo 100% · boletas 70% · arriendo 100% · retiros 70%
   2 ── rentaFinal()                 [existe]  − cuotas vigentes
   3 ── califica()                   [existe]  ¿≥ $1.400.000?
        │
   4 ── cargaMaxima(renta)           [NUEVO]   25% bajo $2.5M · 30% desde $2.5M
   5 ── dividendoMaximo              [NUEVO]   renta × carga
        │
   6 ── plazoMaximoPorEdad()         [existe]  edad + plazo ≤ 79
   7 ── perfilCrediticio(ficha)      [NUEVO]   5 ejes → verde/amarillo/rojo   (D5: solo inputs)
   8 ── financiamientoSugerido       [NUEVO]   90% verde · 80% amarillo/rojo
        │
   9 ── creditoMaximo = MÍNIMO de:   [NUEVO]   (D3)
        │   a) valor presente del dividendo máximo al plazo y tasa
        │   b) 60 × renta reconocida − saldo hipotecario vigente
        │
  10 ── valorMaximoPropiedad = MÍNIMO de:      (D3)
        │   a) creditoMaximo ÷ financiamiento
        │   b) ahorro disponible ÷ (1 − financiamiento)     ← el pie suele ser el tope real
        │
  11 ── pieRequerido = valor × (1 − financiamiento)
```

### Las dos correcciones al planteamiento original

Sin ellas la herramienta miente, así que van en v1:

**1. El ahorro disponible es un tope, no un dato de contexto (paso 10b).**
De nada sirve calificar para un crédito de 4.000 UF si el cliente tiene ahorrados 200 UF y
el pie exigido son 400. En la práctica **el pie es el tope que manda más seguido que el
crédito**. Además, es lo único que le da sentido real a la palanca "aumentar pie" que
Paola quiere ofrecer: sin este tope, esa recomendación no cambiaría ningún número.

**2. `deudaTotal` por fin entra al cálculo (paso 9b).**
El tope de 60× renta se calcula **menos el saldo hipotecario vigente**. Hoy el formulario
pide la deuda total y no la usa en ningún cálculo — es la corrección #6 documentada en el
ADR-0027 como deuda deliberada. Este es el momento en que se paga.

### Fórmula del despeje inverso

El crédito máximo por capacidad de pago es el valor presente de una anualidad:

```
              1 − (1 + i)^−n
  C  =  D  ·  ──────────────
                    i
```

donde `D` = dividendo máximo mensual, `i` = tasa mensual (`tasaMensual()`), `n` = meses del
plazo. Es exactamente el inverso de la fórmula que ya usa `dividendo()`, así que ambas
deben cuadrar: **hay un test de ida y vuelta que lo verifica.**

---

## El semáforo: cinco ejes

Cada eje aporta puntos. El total define el color. **Todos los umbrales son constantes
nombradas en un solo archivo** — la política de un banco cambia, y cuando cambie tiene que
ser una línea, no una cacería.

| Eje | Verde | Amarillo | Rojo |
|---|---|---|---|
| **Estabilidad de renta** | Sueldo fijo, contrato indefinido | Mixto o plazo fijo | Solo boletas/variable |
| **Antigüedad laboral** | ≥ 2 años | 1–2 años | < 1 año |
| **Carga financiera** | Cuotas < 15% del ingreso | 15–30% | > 30% |
| **Patrimonio neto** | Positivo y > 20% del valor objetivo | Positivo | Cero o negativo |
| **Capacidad de ahorro** | Cubre el pie del 80% | Cubre el pie del 90% | No cubre ninguno |

**Fortalezas detectadas** = los ejes en verde, redactados en positivo.
**Variables que podrían mejorar** = los ejes en amarillo o rojo, redactados como acción
concreta ("con 180 UF más de pie…", no "mejorar el ahorro") **con el número exacto**. Ese
número es lo que convierte el semáforo en una herramienta de conversación en vez de un
adorno.

> **Los ejes afirman hechos, no prometen efectos.** Descubierto probando el motor con
> casos reales: cuando el límite es el múltiplo de renta, aumentar el pie NO sube el valor
> alcanzable, así que un texto fijo que lo prometa hace que la herramienta mienta en buena
> parte de los casos. El eje dice cuánto falta para cubrir cierto pie —siempre cierto—; es
> **la pantalla de resultado (tarea 5)** la que conoce `limitadoPor` y debe destacar la
> palanca que sí mueve la cifra. Un test lo protege.

---

## Archivos y rutas a tocar

> Verificado contra el código: **sí** (2026-08-10)

**Nuevos**
- `lib/credito/capacidad.ts` — el despeje inverso y los tres topes. Puro, sin I/O.
- `lib/credito/capacidad-constants.ts` — umbral $2.500.000, cargas 25/30%, múltiplo 60×,
  financiamientos 80/90%. Separado de `constants.ts` para que la pública no herede nada.
- `lib/evaluacion/ficha.ts` — tipo de la Ficha de Estado de Situación + validación (Zod).
- `lib/evaluacion/perfil.ts` — los cinco ejes, umbrales y redacción de fortalezas/mejoras.
- `components/evaluacion/FichaEstadoSituacion.tsx` — el formulario por secciones.
- `components/evaluacion/ResultadoEvaluacion.tsx` — semáforo, cifras y el "hasta X UF".
- `app/(classroom)/classroom/[cohortSlug]/evaluacion/page.tsx` — la pantalla, tras login.

**Modificados**
- `docs/codemap.md` — filas nuevas (Paso 5 de spec-flow).
- `CHANGELOG.md` — entrada orientada al lector.

**Explícitamente NO se tocan**
- `lib/credito/constants.ts` ni `lib/credito/calculo.ts` — la pública queda intacta (D2).
  Si un cambio parece exigir tocarlos, es señal de que la separación se está rompiendo.
- `app/calculadora-credito/` y `components/calculadora/`.
- La ruta pública **no se renombra**: rompe SEO y sitemap sin ganancia. "Motor de
  Evaluación Financiera" es el nombre de la herramienta nueva, no un rename de la vieja.

**Sin migraciones** (consecuencia directa de D1).

---

## Escenarios (Given/When/Then)

**E1 — El caso que da sentido a la herramienta**
- GIVEN un cliente con renta reconocida $2.800.000, 38 años, sin deudas, 900 UF ahorradas
- WHEN el asesor pulsa "Analizar capacidad de compra"
- THEN ve un tope en UF, el dividendo asociado, el pie requerido y un perfil verde
- AND el tope sale del MENOR entre capacidad de pago, 60× renta y lo que permite su ahorro

**E2 — La carga escalonada**
- GIVEN una renta reconocida de $2.499.000
- THEN la carga aplicada es 25%
- GIVEN una renta reconocida de $2.500.000
- THEN la carga aplicada es 30%

**E3 — El ahorro es el tope real** *(la corrección #1)*
- GIVEN un cliente que califica para un crédito de 4.000 UF pero tiene 200 UF ahorradas
- THEN el valor máximo NO es 4.000 UF sino el que su pie permite
- AND entre las variables a mejorar aparece cuánto pie le falta, en UF

**E4 — El hipotecario vigente descuenta** *(la corrección #2)*
- GIVEN un cliente con renta $3.000.000 y un saldo hipotecario vigente de $40.000.000
- THEN el tope de 60× renta se calcula como `180.000.000 − 40.000.000 = 140.000.000`

**E5 — La edad manda sobre el plazo**
- GIVEN un cliente de 62 años
- THEN el plazo ofrecido es 15 años (62 + 15 ≤ 79) y no 30
- AND el tope baja en consecuencia, sin mensaje de error

**E6 — No califica**
- GIVEN una renta final bajo $1.400.000
- THEN no se muestra ningún tope de propiedad
- AND se explica qué falta para calificar, sin cifras que ilusionen

**E7 — Ida y vuelta con el motor existente**
- GIVEN un crédito calculado por `capacidad.ts`
- WHEN se pasa por `dividendo()` de `calculo.ts`
- THEN el dividendo resultante coincide con el dividendo máximo (± $1 por redondeo)

**E8 — La pública no se movió** *(protege D2)*
- GIVEN una renta de $3.000.000 en `/calculadora-credito`
- THEN la carga sigue siendo 25% y los resultados son idénticos a los de hoy

---

## Tests

- `lib/credito/__tests__/capacidad.test.ts` — E1–E5, E7. Cada tope por separado y el
  mínimo entre ellos; el borde exacto de $2.500.000; ida y vuelta contra `dividendo()`.
- `lib/evaluacion/__tests__/perfil.test.ts` — los cinco ejes en sus tres estados, los
  bordes de cada umbral, y que las mejoras traigan el número que cambiaría el resultado.
- `lib/evaluacion/__tests__/ficha.test.ts` — validación: RUT inválido, renta negativa,
  campos faltantes, edad fuera de rango.
- `lib/credito/__tests__/calculo.test.ts` — **sin cambios**: que siga verde es la prueba
  de que la pública no se movió (E8).

Cobertura: no baja. Esto es lógica de dinero — aplica el umbral fijo de ADR-0012.

---

## Fuera de alcance en v1

- **Persistencia de fichas** (D1) — se reevalúa cuando la herramienta esté en uso real.
- **Seguros de desgravamen e incendio y gastos operacionales** (~3% del valor en Chile,
  salen del pie). Se advierte en pantalla en vez de inventar una prima, igual que hoy.
- **Reglas por profesión, universidad, tipo de contrato, primera/segunda vivienda.** Es la
  v2 que Paola describe. La arquitectura las admite —son ejes más en `perfil.ts`— pero
  cada una necesita su fuente y su validación.
- **Paso 8 (resumen financiero) y catálogo de propiedades.**
- **Exportar a PDF** — deseable y probablemente lo primero de la v1.1; el repo ya genera
  PDF para certificados y para la guía del profesor, así que hay de dónde copiar.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **La cifra se dice en reunión y el banco después rechaza** | Manda el tope menor (D3); disclaimer visible junto al resultado, no en letra chica |
| **El 🟢 se lee como aprobación bancaria** | El texto dice "perfil favorable para evaluar", nunca "aprobado"; el disclaimer va pegado al semáforo |
| **Dos criterios de carga conviviendo** (D2) | Constantes en archivos separados, cada una con su comentario; E8 protege la pública |
| **El arriendo al 100% infla el resultado** | Heredado del ADR-0027 y sigue siendo decisión de negocio pendiente — ver abajo |

### Pendiente para Paola (no bloquea v1)

**El arriendo se reconoce al 100%**, cuando la mayoría de los bancos castiga entre 70% y
80%. Viene de su planilla y está marcado para revisión desde julio. En la calculadora
pública el impacto es acotado; acá alimenta la frase "puedes comprar hasta X UF", así que
un arriendo sobrevalorado se traduce directo en un tope inflado.

Es una decisión de negocio, no de ingeniería. Si lo confirma, es cambiar una constante.

---

## Tareas

1. `capacidad-constants.ts` + `capacidad.ts` con el despeje inverso y los tres topes → tests E2, E4, E5, E7 en verde.
2. `perfil.ts`: los cinco ejes y la redacción de fortalezas/mejoras con cifras → tests de los quince estados.
3. `ficha.ts`: tipo y validación Zod de la Ficha de Estado de Situación.
4. `FichaEstadoSituacion.tsx`: el formulario por secciones, con los controles de marca del proyecto (`docs/ui-conventions.md`).
5. `ResultadoEvaluacion.tsx`: semáforo, las seis cifras y el "hasta X UF" como protagonista.
6. La pantalla en `/classroom/[cohortSlug]/evaluacion`, tras login.
7. Verificar E1–E8 completos, codemap, CHANGELOG y ADR-0032.

Las tareas 1–3 son lógica pura y se pueden hacer y probar sin nada de UI. **La tarea 1
sola ya permite responder "¿hasta cuánto puede comprar?"** — es el corte natural si se
quiere algo demostrable rápido.
