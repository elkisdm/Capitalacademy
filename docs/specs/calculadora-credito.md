# Calculadora pública de crédito hipotecario

**Classification**: `feat` · medium · **risk med** (superficie pública + captura de PII +
dependencia externa + cifras financieras a consumidores) · known · toca
`app/calculadora-credito/`, `components/calculadora/`, `lib/credito/`, `lib/indicadores/`,
`lib/utils/money.ts`
**Tier**: 2 — Standard · **Sin migraciones**
**Fecha**: 2026-07-29
**ADR**: [0027](../adr/0027-calculadora-publica-de-credito-hipotecario.md)

---

## Goal

Portar la planilla `CALCULADORA CREDITO.xlsx` (hoja `DIVIDENDO RENTA 25%`) a una página
pública de Capital Academy que estime el dividendo de un crédito hipotecario y capture al
visitante como lead. La misma lógica que la clienta usa para filtrar prospectos antes de
mandarlos al banco, ahora como activo de captación permanente.

## Decisiones de producto (del usuario, 2026-07-29)

- **Pública, para captación de leads**: la matriz de escenarios se libera tras el formulario.
- **UF en vivo** desde mindicador.cl con caché diario.
- **Corregir los bugs de la planilla** documentando cada cambio (las 7 correcciones viven
  en el ADR-0027).

## Assumptions made

- **Cero migraciones**: el lead va a la tabla `leads` existente vía `POST /api/leads`, con
  `source: "calculadora-credito"` y la simulación serializada en `message`.
- `program_interest` por defecto `"diplomado"` (constraint: `diplomado|liderazgo|ruta|indeciso`).
- El cálculo corre en el navegador; el servidor solo aporta la UF.
- **El arriendo se mantiene al 100%** como en la planilla — castigarlo al 70% es una
  decisión de negocio de la clienta. Queda como constante marcada para revisión.
- v1 sin seguros de desgravamen ni incendio: se advierte en pantalla, no se inventa prima.
- mindicador.cl es público y sin API key → **no hay variables de entorno nuevas**.

## Acceptance criteria

- [x] `/calculadora-credito` carga sin sesión y muestra el valor UF real del día.
- [x] El total reconocido aplica los castigos correctos (70% boletas y retiros, 100% sueldo
      y arriendo).
- [x] Los pasivos restan por **valor cuota**, no por deuda total.
- [x] Bajo $1.400.000 de renta final se informa "no califica" y no se muestra matriz.
- [x] La matriz 4×4 marca cada escenario como califica o no, según la regla del 25%.
- [x] Los plazos que exceden el máximo por edad quedan bloqueados con la razón visible.
- [x] El resultado se libera al enviar el formulario, que crea un lead con la simulación.
- [x] Si mindicador.cl falla, la calculadora sigue con el último valor conocido y lo dice.
- [x] Disclaimer legal visible junto al resultado.

## Files & routes

| Path | Acción | Qué hace |
|---|---|---|
| `lib/credito/constants.ts` | nuevo | Castigos, umbral, tasa, pies, plazos, edad tope 79 |
| `lib/credito/calculo.ts` | nuevo | Motor puro: ingreso reconocido, renta final, dividendo francés, matriz, plazo por edad |
| `lib/indicadores/uf.ts` | nuevo | `getValorUF()` cacheado 12h; el fallback nunca se cachea |
| `lib/utils/money.ts` | nuevo | `formatCLP`/`formatUF`/`maskMonto` — cierra el gap de `ui-conventions` §2.4 |
| `app/calculadora-credito/{page,loading,error}.tsx` | nuevo | Ruta pública con SEO, skeleton y error boundary |
| `components/calculadora/{CalculadoraCredito,CampoMonto,MatrizDividendos}.tsx` | nuevo | UI |
| `app/sitemap.ts` | modificado | Entrada de la ruta nueva |
| `app/api/leads/route.ts` | **sin cambios** | Se reusa tal cual |

*Verificado contra el código: sí.*

## Spec (Given/When/Then)

**Scenario: ingreso reconocido con boletas parciales**
- GIVEN un visitante con 3 boletas de honorarios (500k, 800k, 700k) y sin sueldo
- WHEN las ingresa
- THEN el ingreso reconocido es $466.667 (promedio de 3 × 70%), no $233.333 como en la planilla

**Scenario: la deuda total no afecta el cálculo**
- GIVEN un visitante con una deuda de $90.000.000 y cuota mensual $0
- WHEN se calcula la renta final
- THEN la renta final es igual al ingreso reconocido

**Scenario: renta bajo el mínimo**
- GIVEN una renta final de $900.000
- WHEN se evalúa
- THEN se informa "no califica" y no se muestra la matriz de escenarios

**Scenario: plazo bloqueado por edad**
- GIVEN un visitante de 55 años con renta holgada
- WHEN se arma la matriz
- THEN los plazos de 25 y 30 años quedan marcados `plazo_excede_edad` y solo 15 y 20 califican

**Scenario: mindicador caído**
- GIVEN que la API de la UF no responde
- WHEN se renderiza la página
- THEN se usa el valor de respaldo, la UI lo advierte, y el fallo NO queda cacheado 12h

## Tests

- `lib/credito/__tests__/calculo.test.ts` — 33 casos. Los fixtures salen de los valores ya
  calculados por la propia planilla (total $2.233.333, renta final $2.153.333, las cuatro
  esquinas de la matriz), más bordes: tasa 0, umbral exacto, edad en el límite, los años
  1979-1989 que la planilla había perdido.
- `lib/indicadores/__tests__/uf.test.ts` — parseo, todos los caminos de fallback, y la regla
  de no-cachear-el-fallback.
- `lib/utils/__tests__/money.test.ts` — formateo, redondeo, negativos, NaN, máscara.

Suite completa: 2549 tests verdes en 166 archivos. `tsc` limpio. `next build` compila.

## Verificado en el navegador

Con los datos de la planilla cargados, las 16 celdas de la matriz coinciden con el Excel al
peso ($670.770 / $649.133 / $613.070 / $577.007 a 15 años … $415.935 / $402.518 / $380.156 /
$357.794 a 30 años) y la UF se resuelve en vivo ($40.845 al 2026-07-29). Con un año de
nacimiento que hace a la persona demasiado mayor (1950 → ~76 años), las 16 celdas quedan
correctamente bloqueadas con "No disponible por edad".

## Revisión de código (2 iteraciones)

- **It. 1 — bug de correctitud**: en `matrizDividendos`, cuando la edad excedía TODOS los
  plazos, `plazoMaximoPorEdad` devolvía `null` y ese `null` se confundía con "sin edad" →
  ninguna celda se bloqueaba y el cliente calificaba a los 4 plazos. Se separó `edadProvista`
  del tope. El legend de la matriz pasó a derivarse de las celdas, no de `plazoMaximo`.
  Tests de regresión en `calculo.test.ts`.
- **It. 2 — pulido**: (a) se guarda la sección de dividendo contra `valorPropiedadUF > 0`
  para no mostrar 16 celdas de $0 marcadas "califica" si el usuario borra el valor; (b) se
  quitó `aria-live` del panel de renta (se recalcula por tecla → un lector de pantalla leería
  todo el bloque en cada pulsación); el veredicto de califica/no-califica conserva su
  `role="status"`.

## Out of scope (v1)

Seguros y gastos operacionales · guardar simulaciones como datos consultables · PDF del
resultado · versión logueada para alumnos · WhatsApp · tasa editable por el usuario.

## Pendiente

- **QA en teléfono físico**: el resize de ventana no baja del mínimo de macOS. La matriz
  scrollea dentro de su contenedor (`min-w-[34rem]` + `overflow-x-auto`), pero conviene
  confirmarlo en pantalla real.
- **Revisar con la clienta** si el arriendo debe castigarse al 70%.
