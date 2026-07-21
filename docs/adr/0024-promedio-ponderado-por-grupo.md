# ADR-0024: Promedio ponderado por grupo en la pantalla de notas del alumno

- **Status:** accepted
- **Date:** 2026-07-21
- **Deciders:** Eduardo Daza
- **Tags:** classroom, evaluaciones, notas

## Contexto

ADR-0018 (corrección A7) decidió suprimir el promedio de un grupo de notas
cuando alguna evaluación del grupo tenía `weight_pct` cargado, listando solo
las notas individuales sin promedio. La razón era evitar mostrar un promedio
simple que contradijera una composición ponderada ya comunicada por la
profe.

En la práctica esa supresión deja al alumno sin ningún dato consolidado del
grupo, justo cuando la UI del resto del sistema SÍ promete ponderación:

- `components/admin/quiz/evaluations-list-client.tsx:89` muestra el peso de
  cada evaluación al profe como parte de la composición del grupo.
- `lib/admin/evaluation-list.ts:47-49` ya calcula y advierte cuando los
  pesos de un grupo no suman 100%, es decir, el sistema ya entiende
  "peso parcial" como un estado legítimo, no un error a bloquear.

Suprimir el promedio en la pantalla del alumno, sin ninguna explicación,
comunica menos de lo que el propio sistema ya sabe sobre esas notas.

## Decisión

Calcular el promedio del grupo con ponderación real cuando corresponda,
vía `computeGroupAverage` (`lib/grades/scale.ts`):

1. Si ninguna nota del grupo tiene `weightPct`, el promedio es simple
   (como hoy).
2. Si al menos una nota tiene `weightPct > 0`, el promedio se calcula
   **solo sobre esas notas**, normalizando por la suma real de sus pesos:
   `Σ(nota × peso) / Σ(peso)`. Normalizar (en vez de dividir por 100)
   hace que el resultado sea correcto incluso si los pesos cargados no
   suman 100 todavía.
3. Las notas del grupo que NO tienen peso quedan **excluidas** del
   ponderado — no se les asume peso 0 ni se cae a un promedio simple que
   las mezclaría con las ponderadas. La UI declara explícitamente cuántas
   notas quedaron excluidas.

## Opciones consideradas

### Opción A — Ponderar normalizando por la suma de pesos, excluyendo las notas sin peso (elegida)
- Pros: correcto incluso con pesos parciales o que no suman 100; no
  requiere que la profe termine de cargar toda la composición antes de
  ver un número; consistente con `evaluation-list.ts`, que ya tolera
  peso parcial.
- Contras: requiere comunicar en la UI qué quedó fuera del cálculo, o el
  número puede mal-interpretarse como "el promedio de todo el grupo".

### Opción B — Mantener la supresión de ADR-0018 (statu quo)
- Pros: cero riesgo de mostrar un número mal explicado.
- Contras: dejar sin dato consolidado un grupo que el propio sistema ya
  sabe ponderar es peor experiencia que un número bien explicado.

### Opción C — Promedio simple siempre, ignorando `weight_pct`
- Pros: más simple de implementar.
- Contras: contradice directamente la composición que la profe ya
  comunicó a los alumnos vía los pesos cargados.

## Consecuencias

### Positivas
- El alumno vuelve a ver un promedio consolidado por grupo aun cuando
  hay pesos cargados, con una etiqueta ("Promedio ponderado") que aclara
  que no es un promedio simple.
- El cálculo es correcto con pesos parciales, sin esperar a que sumen
  exactamente 100.

### Negativas
- Añade una rama de UI (fila individual anota "X% del promedio" o "no
  pondera" cuando el grupo es ponderado) que no existía antes.
- En prod, ninguna evaluación tiene `weight_pct` cargado hoy, así que
  este cambio es invisible hasta que la profe empiece a cargar pesos —
  el candado de test (`computeGroupAverage`, un solo elemento con peso)
  es la única verificación real hasta entonces.

### Riesgos
- Si una futura fila con peso 0 se interpreta como "pondera pero con
  peso nulo" en vez de "no pondera", el resultado cambiaría; se
  documentó explícitamente en `computeGroupAverage` que `weightPct > 0`
  es la condición para entrar al ponderado.

## Referencias

- [ADR-0018: Evaluaciones y notas 1-7](0018-evaluaciones-y-notas-1-7.md) —
  corrección A7, ahora superada por este ADR.
- `lib/grades/scale.ts` — `computeGroupAverage`, con los tests candado en
  `lib/grades/__tests__/scale.test.ts`.
- `lib/admin/evaluation-list.ts:47-49` — advertencia de pesos que no suman
  100% en el panel de la profe.
