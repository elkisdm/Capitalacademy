# ADR-0027: Calculadora pública de crédito hipotecario

- **Status:** proposed
- **Date:** 2026-07-29
- **Deciders:** Elkis Daza (ingeniería), con decisiones de producto del usuario
- **Tags:** landing, captación, leads, cálculo financiero, integraciones

## Contexto

La clienta trabaja con una planilla Excel — `CALCULADORA CREDITO.xlsx`, hoja
`DIVIDENDO RENTA 25%` — para filtrar prospectos antes de mandarlos al banco. Calcula la
renta que el banco reconoce, le resta las cuotas vigentes y estima el dividendo de un
crédito hipotecario para cuatro pies (7/10/15/20%) y cuatro plazos (15/20/25/30 años).

La planilla funciona, pero tiene los problemas propios de su formato: los parámetros viven
en celdas sueltas, la tabla de edad se escribió a mano y quedó con huecos, y —lo más
importante— **no cruza sus propios resultados**: muestra la renta final en un lado y la
renta requerida en otro, y es el usuario quien compara a ojo.

Se decidió portarla a la web como herramienta pública de captación de leads.

## Decisión

### 1. Superficie pública con el resultado tras el formulario

`/calculadora-credito` es pública y sin sesión. El resumen de renta (ingreso reconocido,
cuotas, renta final, si califica o no) se muestra **libremente** mientras el usuario tipea:
es lo que construye confianza. La **matriz de escenarios** —el entregable de valor— se
libera al enviar el formulario de contacto.

### 2. Cero migraciones: se reusa la tabla `leads`

El lead se guarda vía `POST /api/leads`, que ya existe, con `source: "calculadora-credito"`
y el detalle de la simulación serializado en la columna `message`. No se creó tabla ni
columna nueva. Consecuencia aceptada: la simulación queda como texto, no como datos
consultables. Si algún día se quiere analizar las simulaciones en agregado, ahí sí
corresponde una columna `jsonb` y su migración.

### 3. El cálculo corre en el navegador; el servidor solo aporta la UF

`lib/credito/calculo.ts` es puro y sin I/O. No hay secretos en las fórmulas —son
matemática financiera estándar— así que ejecutarlas en el cliente da resultado instantáneo
sin round-trip. El único dato externo, el valor de la UF, se resuelve en el servidor.

### 4. UF en vivo desde mindicador.cl, cacheada 12h, con fallback que NO se cachea

`lib/indicadores/uf.ts` consulta la API pública del Banco Central vía mindicador.cl.
Dos decisiones no obvias, ambas descubiertas midiendo:

- **Timeout de 12 segundos**, deliberadamente generoso. Medido desde Node, el endpoint
  responde entre 1,1s y 10,7s (muy variable, aunque `curl` sea instantáneo). Con el
  timeout inicial de 4s el fallback saltaba casi siempre. Esperar sale casi gratis porque
  el fetch ocurre al revalidar la caché de 12h, no en el request del visitante.
- **El fallback nunca se cachea.** La capa cacheada lanza cuando el valor es de respaldo
  (`rechazarFallback`), y `unstable_cache` no guarda promesas rechazadas. Sin esto, una
  falla transitoria de mindicador congelaba una UF obsoleta durante media jornada — peor
  que no cachear nada.

### 5. La tasa no es editable por el usuario

Se muestra como referencia (3,32% anual, `TASA_ANUAL_DEFAULT`). Exponerla como campo en una
página pública agrega fricción y deja que cualquiera fabrique el número que quiera ver. Se
actualiza en `lib/credito/constants.ts`.

## Las siete correcciones a la planilla

Se optó por corregir en vez de replicar (decisión del usuario), documentando cada cambio.
Consecuencia aceptada: **los números no siempre calzarán con la planilla de la clienta**.

| # | Planilla | En la calculadora |
|---|---|---|
| 1 | `AVERAGE(B13:G13)` divide siempre entre 6, aunque se ingresen 3 boletas | Promedia solo las boletas ingresadas; exige un mínimo de 3 |
| 2 | Tabla de edad→plazo escrita a mano: faltan 1974-75 y **1979-1989 quedaron pisados** por la matriz de dividendos (celdas `J58:K62`) | Regla: mayor plazo de {15,20,25,30} tal que `edad + plazo ≤ 79` |
| 3 | El cruce renta-final vs. renta-requerida lo hace el ojo humano | Cada celda viene resuelta como califica / no califica |
| 4 | Umbral $1.400.000, tasa 3,32% y UF 41.000 en celdas sueltas | Constantes nombradas en un solo archivo; UF en vivo |
| 5 | El dividendo se presenta sin aclarar que excluye seguros | Se declara explícitamente en pantalla |
| 6 | La deuda total (`F23`) se pide pero no entra en ningún cálculo | Se mantiene informativa (solo la cuota resta) y viaja en el lead |
| 7 | El disclaimer legal vive en una celda perdida (`K25`) | Es parte del resultado, no letra chica |

Sobre el punto 2: la regla reproduce la tabla de la planilla salvo el año 1970, donde
redondeaba hacia arriba (ofrecía 25 años cuando la regla da 20). Además la tabla estaba
anclada al año en que se escribió: a un nacido en 1976 le ofrecía 30 años porque en 2025
tenía 49; en 2026 tiene 50 y le corresponden 25. Ese envejecimiento silencioso es
exactamente lo que una tabla hardcodeada no puede manejar.

## Lo que NO se corrigió, a propósito

**El arriendo se sigue reconociendo al 100%** (`CASTIGO_INGRESO.arriendo = 1`), a diferencia
de boletas y retiros que van al 70%. La mayoría de los bancos castiga la renta de arriendo
al 70-80%, así que probablemente sea un descuido de la planilla — pero bajarlo rechazaría
prospectos que hoy califican, y esa es una decisión de negocio de la clienta, no de
ingeniería. Queda como constante nombrada y marcada para revisión.

## Consecuencias

**A favor**
- Activo de captación permanente y indexable, con la lógica que la clienta ya valida.
- La lógica del negocio queda versionada y con tests en vez de vivir en un `.xlsx` que
  circula por correo.
- Se cierra el gap de `docs/ui-conventions.md` §2.4: nace `lib/utils/money.ts` como helper
  único de formateo CLP/UF para el cliente.

**En contra / deuda**
- Los resultados pueden discrepar de la planilla de la clienta (ver las siete correcciones).
- La simulación se guarda como texto en `leads.message`: no es analizable en agregado.
- v1 sin seguros de desgravamen ni incendio, que en la práctica suman entre 8% y 12% al
  dividendo real. Se advierte en pantalla en vez de inventar una prima.
- Dependencia de un tercero (mindicador.cl) para la UF, mitigada con caché y fallback.
- Falta QA en teléfono físico: el resize de ventana no baja del mínimo de macOS.

## Alternativas descartadas

- **Replicar la planilla exactamente, bugs incluidos.** Descartada por el usuario: habría
  perpetuado el promedio entre 6 y una tabla de edad que envejece sola.
- **Nueva tabla `simulaciones` con su migración.** Sobra para v1 y obligaba a aplicar
  migraciones a producción (ver `feedback-migracion-mcp-no-versiona`).
- **Calcular en el servidor vía endpoint.** Agrega latencia por tecla sin proteger nada:
  las fórmulas no son secretas.
- **Timeout corto (4s) para la UF.** Medido: hacía caer el fallback en casi todos los
  renders.

## Referencias

- Planilla origen: `CALCULADORA CREDITO.xlsx`, hoja `DIVIDENDO RENTA 25%`
- Spec: `docs/specs/calculadora-credito.md`
- Código: `lib/credito/`, `lib/indicadores/uf.ts`, `components/calculadora/`,
  `app/calculadora-credito/`
- Convenciones de UI: `docs/ui-conventions.md` §2.4 (helper CLP)
