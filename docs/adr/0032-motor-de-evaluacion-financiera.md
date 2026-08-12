# ADR-0032: Motor de Evaluación Financiera

- **Status:** accepted
- **Date:** 2026-08-10
- **Deciders:** Elkis Daza (ingeniería), Paola Vicuña (producto / metodología comercial)
- **Tags:** cálculo financiero, PII, asesoría comercial, classroom

## Contexto

La calculadora pública (ADR-0027) resuelve `valor de propiedad → dividendo`. Paola pidió
integrarla con la Ficha de Estado de Situación (Paso 7 de la metodología comercial) para
que el asesor levante la situación financiera del cliente y obtenga, en la misma reunión,
hasta qué valor de propiedad puede evaluar.

**Lo pedido es la función inversa de lo que existe.** El motor actual —ingreso reconocido
con castigos por fuente, plazo por edad, anualidad francesa— se reusa casi entero; falta
el despeje inverso (valor presente de la anualidad) y tres topes nuevos.

La herramienta entrega una cifra que el asesor le dice a un cliente real en una reunión en
vivo. Ese es el hecho que gobierna las decisiones de abajo.

## Decisiones

### 1. v1 no persiste la ficha

La ficha vive solo en el navegador durante la reunión.

Contiene datos financieros de un **tercero identificado** —RUT, renta, deudas, patrimonio—
que no es usuario de la plataforma y no aceptó ningún término. Guardarlos activa la Ley
21.719: consentimiento, retención, derecho a supresión, y qué ocurre con las fichas cuando
un asesor deja la empresa.

Agregar persistencia después es barato. Quitarla con 200 fichas cargadas no lo es.

**Consecuencia aceptada**: no se puede retomar una ficha ni hay historial por cliente.
**A favor**: v1 sin migraciones, sin RLS y sin superficie de PII en reposo.

### 2. La regla de carga 25%/30% NO toca la calculadora pública

| Herramienta | Carga |
|---|---|
| `/calculadora-credito` | 25% fija — sin cambios |
| Motor de Evaluación | 25% bajo $2.500.000 · 30% desde $2.500.000 |

La pública está en producción captando leads y calza con la planilla que Paola valida.
Cambiarle la carga aflojaría resultados ya publicados para rentas altas sin que nadie lo
pidiera. Las constantes viven en archivos separados y un test existente protege que la
pública no se mueva.

**Consecuencia aceptada**: dos criterios conviviendo, cada uno documentado en su archivo.

### 3. Ante varios topes, manda el menor

> **Enmienda 3 — 2026-08-12 (noche)**: el historial pasa a NIVEL DE USUARIO,
> por decisión de Elkis, y revierte PARCIALMENTE la decisión 1. Lo que se
> mantiene: la ficha NUNCA se autoguarda — persiste únicamente lo que el asesor
> guarda con el botón explícito (ese acto es el consentimiento operativo). Lo
> que cambia: la copia vive en la tabla `evaluation_history` (migración 0098)
> con RLS estricta `user_id = auth.uid()` en select/insert/delete — sin
> excepción para admin/ops, sin política de UPDATE (cada entrada es una foto
> inmutable) — tope de 20 por usuario recortado en el endpoint
> (`/api/classroom/evaluaciones/historial`). Retención: manual, el asesor
> elimina desde la pantalla; si algún día se quiere historial COMPARTIDO entre
> asesores o retención automática, eso es una nueva decisión. El export a PDF
> sigue sin servidor: hoja de impresión del informe (`window.print()` + reglas
> en `globals.css`).
>
> *(La enmienda 2 de esa misma tarde — historial en localStorage — quedó
> reemplazada por esta antes de usarse en producción.)*

> **Enmienda 2026-08-12**: el ahorro deja de ser un tope. En uso real, una ficha con
> renta que califica y ahorro $0 mostraba "0 UF" junto a un perfil "viable" —
> contradictorio frente al cliente. Decisión de producto (Elkis): la capacidad la define
> la renta; el pie se informa como brecha (`brechaPieCLP`: cuánto exige ese valor y
> cuánto falta de ahorro), nunca colapsa el titular. Consecuencia asumida: un perfil que
> financia menos (amarillo, 80%) muestra un valor levemente mayor que uno verde para el
> mismo crédito, porque admite más pie — condicionado a cubrirlo, y la brecha queda a la
> vista. Los topes que quedan son capacidad de pago y 60× renta.

Capacidad de pago, 60× renta y ahorro disponible son restricciones **simultáneas**, no
alternativas. Gana la más restrictiva.

El error barato es quedarse corto. Si la herramienta sobreestima, el asesor ilusiona al
cliente en la reunión y el banco lo rechaza semanas después — exactamente el daño que la
metodología comercial que esta herramienta apoya intenta evitar.

### 4. El semáforo es determinista, sin IA

Cinco ejes con umbrales explícitos y nombrados. Se descartó un LLM porque: dos asesores
con la misma ficha deben ver lo mismo; el resultado debe ser auditable frente al banco;
debe ser instantáneo (en reunión no se esperan 4 segundos); y un modelo puede alucinar
cifras financieras. Una capa de lenguaje natural solo tendría sentido *encima* de números
ya calculados.

### 5. El perfil se calcula solo desde los inputs

El % de financiamiento depende del perfil, así que el perfil no puede mirar la capacidad:
sería circular. Se deriva únicamente de los datos ingresados y recién después alimenta el
financiamiento.

### 6. Dos correcciones al planteamiento original

Sin ellas la herramienta miente, así que entran en v1:

- **El ahorro disponible es un tope del valor de propiedad**, no un dato de contexto. De
  nada sirve calificar para 4.000 UF con 200 UF ahorradas. En la práctica el pie manda más
  seguido que el crédito, y es lo único que le da sentido numérico a la palanca "aumentar
  pie" que la herramienta va a recomendar.
- **El tope de 60× renta descuenta el saldo hipotecario vigente.** Con esto `deudaTotal`
  entra por fin a un cálculo: hoy el formulario la pide y no la usa (corrección #6 del
  ADR-0027, registrada como deuda deliberada).

## Alternativas descartadas

- **Guardar la ficha completa desde v1** — potente, pero es la decisión más cara de
  revertir de todo el diseño. Se reevalúa con la herramienta en uso real.
- **Que ambas calculadoras adopten la carga escalonada** — coherente, pero mueve un
  activo en producción sin que nadie lo pidiera.
- **Semáforo con LLM** — ver decisión 4.
- **Que el financiamiento dependa del perfil-como-resultado** — circular; ver decisión 5.
- **Renombrar `/calculadora-credito`** — rompe SEO y sitemap sin ganancia. El nombre nuevo
  es de la herramienta nueva, no un rename de la vieja.
- **Ponerla en la superficie pública** — la calculadora pública captura datos de quien la
  usa; esta captura los de un tercero. Va tras login.
- **Seguros y gastos operacionales en v1** (~3% del valor, salen del pie) — se advierte en
  pantalla en vez de inventar una prima, igual que la calculadora actual.

## Consecuencias

**A favor**
- El motor existente se reusa casi entero; la lógica nueva es acotada y pura.
- v1 sin migraciones ni PII en reposo: se puede construir y descartar sin costo residual.
- Los umbrales quedan nombrados en un archivo: cambiar una política del banco es una línea.

**En contra / deuda**
- Dos criterios de carga conviviendo (mitigado con archivos separados y un test).
- Sin historial: cada evaluación se hace de cero.
- **El arriendo se sigue reconociendo al 100%** (heredado del ADR-0027, decisión de negocio
  pendiente desde julio). Acá pesa más que en la pública: alimenta directamente la frase
  "puedes comprar hasta X UF".
- v1 sin seguros ni gastos operacionales, que en la práctica reducen el poder de compra real.

## Referencias

- Spec: `docs/specs/motor-evaluacion-financiera.md`
- Base: `docs/adr/0027-calculadora-publica-de-credito-hipotecario.md`
- Sesión de especificación previa: `docs/devlog/2026-08-07.md` (ahí este ADR se llama
  "0031"; ese número lo tomó LiveKit el mismo día)
- Código a reusar: `lib/credito/calculo.ts`, `lib/indicadores/uf.ts`, `lib/utils/rut.ts`
