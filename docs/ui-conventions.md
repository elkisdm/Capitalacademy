# Convenciones de interfaz — Capital Academy

> Instrucciones para agentes que generen UI nueva en este codebase.
> Extraídas por auditoría del código real (2026-07-11). Cada patrón: regla imperativa,
> ejemplo correcto del repo, y el antipatrón que evita (los contraejemplos citados son deuda, no licencia).

**Stack:** Next.js 16.2 App Router + React 19 + Tailwind v4 (`@theme inline` en `app/globals.css`, sin tailwind.config). Design system artesanal con prefijo `ca-` en `components/ui/` — **no hay shadcn ni Radix**. Clases con `cn()` (`lib/utils/cn.ts`). Formularios: react-hook-form + zod v4. Iconos: lucide-react. Sistema light-first: **no hay dark mode** (no agregues `dark:`). Sin framer-motion ni tailwindcss-animate — todo motion es CSS propio.

---

## 1. Componentes propios vs primitivas del navegador

### 1.1 Botones: `Button` de `components/ui/button.tsx`, nunca `<button>` estilizado a mano

**Regla:** Usa `<Button variant="primary|lime|outline|ghost|destructive" size="sm|md|lg">`; la base ya incluye `ca-btn-interactive`, `rounded-full`, focus ring y `disabled:opacity-50`.

**Ejemplo correcto:** `components/landing/Formulario.tsx:178` — `<Button type="submit" size="lg" disabled={pending}>`.

**Antipatrón (deuda viva):** `app/(admin)/admin/cobros/cobro-generator.tsx:136-140` — `<button className="... bg-[var(--color-ca-ink)] ...">` reimplementando la variante primary. Hay 52 `<button>` nativos en features; en código nuevo, `Button`.

### 1.2 Clases con `cn()`, estados con clases — no `style={{}}` inline

**Regla:** Combina clases con `cn()` de `lib/utils/cn.ts`; resuelve estilos condicionales (bordes de validación, estados) con clases en `cn()`, no con objetos `style`.

**Ejemplo correcto:** `components/ui/button.tsx:35`, `field.tsx:24`, `dialog.tsx:57`.

**Antipatrón (deuda viva):** `complete-profile-client.tsx:379-387` — borde del input calculado con objeto `style` inline.

### 1.3 Inputs/selects: desde `components/ui/field.tsx`

**Regla:** Usa `Input`, `Textarea` y `Select` de `components/ui/field.tsx`; el `Select` es un adaptador drop-in sobre el motor propio (`ui/select.tsx`) que preserva la API nativa (`<option>` hijos, `required`). No uses `<select>` nativo (hay 0 en features — mantenlo así).

**Ejemplo correcto:** `field.tsx:13-14` define `fieldBase` (borde `ca-ink/[0.14]`, `focus:ring-2 focus:ring-ca-violet/20`); `field.tsx:76-124` (adaptador Select).

**Antipatrón (deuda viva):** `components/landing/Formulario.tsx:184-211` redefine sus propios `Field`/`SelectField` locales en vez de importar los de `ui/field.tsx`.

### 1.4 Toasts: `useToast()` de `components/ui/toast.tsx`; modales: `Dialog` de `ui/dialog.tsx`

**Regla:** Feedback de acciones con el `ToastProvider` global (`ui/toast.tsx`: portal, `role="status" aria-live="polite"`, variantes success/error/info, auto-dismiss 3700/4000ms); modales con `Dialog` (trap de foco + Escape incluidos).

**Antipatrón (deuda reconocida en el propio código):** existe un segundo sistema en `components/admin/toast.tsx` (hex inline, hook por componente). El comentario en `ui/toast.tsx:35-37` admite la migración pendiente. En código nuevo, siempre `ui/toast.tsx`.

---

## 2. Formateo de inputs

### 2.1 RUT: `lib/utils/rut.ts` con máscara en vivo en `onChange`

**Regla:** Formatea con `formatRut` (puntos y guion) en cada tecla, limpia con `cleanRut`, valida dígito verificador con `isValidRut` (módulo 11); persiste `cleanRut(rut)`, no el string formateado.

**Ejemplo correcto:** `complete-profile-client.tsx:100-105`:

```tsx
const handleRutChange = useCallback((value: string) => {
  const cleaned = cleanRut(value);
  if (cleaned.length <= 9) setRut(formatRut(value));
}, []);
```

Con feedback inline check/alert y mensaje "RUT inválido. Verifica el dígito verificador." (`:389-403`); submit guarda `cleanRut(rut)` (`:132`).

**Antipatrón:** reimplementar el módulo 11 localmente o validar solo formato sin DV.

### 2.2 Teléfono: `formatPhone` de `lib/utils/phone.ts` en `onBlur`

**Regla:** Normaliza a formato visual `+56 9 XXXX XXXX` con `formatPhone` aplicado en `onBlur` (no en cada tecla); el helper es tolerante y no rompe la entrada. No se usa E.164 puro en UI.

**Ejemplo correcto:** `complete-profile-client.tsx:362` — `onBlur={() => phone.trim() && setPhone(formatPhone(phone))}`.

### 2.3 `inputMode`/`type`/`autoComplete` semánticos en todo input

**Regla:** Email → `type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none"`; teléfono → `type="tel" inputMode="tel" autoComplete="tel"`; RUT/montos → `inputMode="numeric"`.

**Ejemplo correcto:** `Formulario.tsx:127,138`; `student-profile-client.tsx:246`; `CheckoutClient.tsx:268`.

**Antipatrón (deuda viva):** teléfono y RUT de `complete-profile-client.tsx:357-388` sin `inputMode` — inconsistente con los checkouts.

### 2.4 Moneda: locale `es-CL`, precio base desde constantes únicas

**Regla:** El precio base vive en `lib/pricing.ts` (`DIPLOMADO_PRICE_CLP = 500_000`) y constantes de `lib/landing/constants.ts`. Formatea con los helpers de **`lib/utils/money.ts`**: `formatCLP(n)` (`$1.234.567`, redondea y tolera NaN), `formatUF(n)` (`2.500 UF`), `formatMiles(n)` y `maskMonto(input)` para inputs de monto. Fechas con `Intl.DateTimeFormat("es-CL", ...)` (`lib/landing/cohort.ts:19`).

**Ejemplo correcto:** `components/calculadora/CampoMonto.tsx` — `maskMonto` en el `onChange` (máscara de miles visible, número limpio hacia arriba); `components/calculadora/MatrizDividendos.tsx` — `formatCLP` en cada celda.

**Antipatrón (deuda viva):** `toLocaleString("es-CL")` ad-hoc (`admin/cobros/page.tsx:33`) y parseo manual `input.replace(/\D/g, "")` (`cobro-generator.tsx:34`), anteriores al helper. Si tocas esos archivos, migra a `lib/utils/money.ts`. En código nuevo, nunca sumes otro formateo inline.

---

## 3. Accesibilidad y estados de foco

### 3.1 Focus ring con el token de marca

**Regla:** Botones → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40` (`button.tsx:6`); campos → `focus:border-ca-violet focus:ring-2 focus:ring-ca-violet/20` (`field.tsx:14`). No inventes otro anillo.

### 3.2 `aria-label` en icon-only; `aria-hidden` en decorativos

**Regla:** Todo botón sin texto lleva `aria-label` (dinámico si el estado cambia); SVGs decorativos con `aria-hidden="true"`.

**Ejemplo correcto:** `notification-bell.tsx:280` (`aria-label="Notificaciones"`); `sidebar.tsx:274` (`aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}`). 146 usos en el repo.

### 3.3 Labels con `htmlFor` + `id` en cada campo

**Regla:** Empareja `<label htmlFor="x">` con `<Input id="x">`; `Checkbox` y `DatePicker` ya traen el label integrado. No existe un componente `<Field>` que empaquete label+input+error, así que verifica el `htmlFor` cada vez que repitas el trío a mano.

**Ejemplo correcto:** `complete-profile-client.tsx:339-348`.

### 3.4 Diálogos: `useFocusTrap` + Escape + restauración

**Regla:** Usa `Dialog` de `ui/dialog.tsx`, que ya aplica `useFocusTrap` (`lib/utils/use-focus-trap.ts`: cicla Tab, restaura `previouslyFocused` al cerrar), listener de Escape, bloqueo de scroll y `role="dialog" aria-modal="true"`. Si construyes un overlay custom, reutiliza el hook, no lo reimplementes.

### 3.5 Tokens `ca-*`/`destructive`, nunca `red-*`/`green-*` ni hex inline

**Regla:** Usa los tokens de `app/globals.css:11-71` (`ca-ink`, `ca-violet`, `ca-lime-text`, `destructive`); las variantes de texto accesibles AA ya están declaradas (`--color-ca-lime-text: #3f5a05`). Para errores usa `fieldErrorClass` de `field.tsx:16` o `text-destructive`.

**Antipatrón (la inconsistencia más extendida del repo):** 62 usos de `text-red-*/bg-red-*/green-*` + 53 hex inline. Ej.: `complete-profile-client.tsx:284` (`bg-red-50 text-red-600` → debería ser `bg-destructive/10 text-destructive`), `Formulario.tsx:160` (`rose-*`), `admin/toast.tsx:35-47` (hex). No sumes ni uno más.

---

## 4. Manejo de errores y carga

### 4.1 Carga de rutas: `loading.tsx` con `Skeleton` que replica el layout

**Regla:** Cada ruta define `loading.tsx` componiendo `<Skeleton>` (`ui/skeleton.tsx`, aplica `ca-shimmer rounded-xl`) que reproduce header/filtros/filas reales; los spinners `animate-spin` se reservan para acciones puntuales.

**Ejemplo correcto:** `app/(admin)/admin/users/loading.tsx`. Hay 17 `loading.tsx` y `error.tsx` en `app/pago`, `(classroom)`, `(admin)` — mantén la cobertura en rutas nuevas.

### 4.2 Submit: `disabled` + texto de progreso

**Regla:** Deshabilita el botón durante el envío y cambia el label a gerundio ("Guardando...", "Enviando…"); la base `Button` refuerza con `disabled:pointer-events-none disabled:opacity-50`.

**Ejemplo correcto:** `complete-profile-client.tsx:520-527`; `Formulario.tsx:178-182`.

### 4.3 Errores inline con `role="alert"`; toasts para acciones

**Regla:** Errores de formulario van inline con `role="alert"` junto al campo o como banner arriba del form, mapeando los `issues` de zod a etiquetas legibles; los toasts (`useToast`) se reservan para feedback de acciones (guardar, copiar).

**Ejemplo correcto:** `Formulario.tsx:158-162`; `complete-profile-client.tsx:283-287` con `FIELD_LABELS` (`:141-151`).

### 4.4 Validación: zod en el server, estado local en el cliente, `uuidLike` para IDs

**Regla:** Los schemas zod viven en las API routes; en cliente valida con estado local (`rutValid`, `requiredDone`). Para IDs usa `uuidLike` de `lib/utils/zod.ts`, NUNCA `z.string().uuid()` (rechaza los UUID semilla del classroom y rompe progress/comments/quiz).

### 4.5 Empty states: componente `EmptyState`

**Regla:** Listas vacías con `<EmptyState icon title description action?>` (`ui/empty-state.tsx:12-21`), no `null` ni tabla vacía.

---

## 5. Microinteracciones

### 5.1 Anima con las utilidades `ca-*` y duraciones tokenizadas

**Regla:** Usa los keyframes y clases de `globals.css` — `ca-fade-up`, `ca-scale-in/out`, `ca-shimmer`, `ca-pulse`, `.ca-btn-interactive` (hover `translateY(-1px) scale(1.02)`, active `scale(0.97)`), `.ca-card-hoverable` — con las duraciones `--dur-fast/base` y easings `--ease-*`. No inventes `transition` ad-hoc ni instales librerías de animación.

**Ejemplo correcto:** `button.tsx:6` (`ca-btn-interactive`); `dialog.tsx:67` (`ca-scale-in`/`ca-scale-out`).

### 5.2 Cierre animado: `onClose` en `onAnimationEnd`

**Regla:** Para cerrar modales/toasts con animación de salida, marca el estado `closing`/`exiting`, aplica la clase de salida y dispara `onClose` en `onAnimationEnd` — nunca antes.

**Ejemplo correcto:** `dialog.tsx:62-71` — `onAnimationEnd={() => { if (closing) onClose(); }}`; `toast.tsx:50-56` (exiting a 3700ms, remove a 4000ms).

### 5.3 Copiar: swap de label ~2s con `try/catch`

**Regla:** Tras copiar, cambia el label del botón ("¡Copiado!") con `setTimeout` de 2000ms y envuelve `navigator.clipboard.writeText` en `try/catch` (clipboard puede estar bloqueado).

**Ejemplo correcto:** `cobro-generator.tsx:45-53,139`; replicado en `session-qr.tsx`, `share-quiz-dialog.tsx`, `cert-view.tsx` y 6 archivos más.

### 5.4 `prefers-reduced-motion`: cubierto globalmente — no lo rompas

**Regla:** El override global de `globals.css:437-446` anula animaciones/transiciones bajo `prefers-reduced-motion: reduce`. Las microinteracciones nuevas quedan cubiertas automáticamente siempre que uses animaciones/transiciones CSS — no uses animaciones JS (rAF/librerías) que lo esquiven.

---

## 6. Responsive y táctil

### 6.1 Inputs a 16px en móvil

**Regla:** Todo control de texto (`input`/`textarea`/`select` reales) usa `text-base md:text-sm` (o `text-[16px] md:text-[Npx]` si el tamaño desktop es un valor arbitrario); nunca `<16px` en un control de entrada — iOS Safari hace auto-zoom al enfocar un campo con `font-size` menor a 16px.

**Ejemplo correcto:** `field.tsx:14` (`fieldBase`: `text-base md:text-sm`).

**Antipatrón:** fijar `text-[13px]`/`text-[14px]` directo sobre un `<input>`/`<textarea>` sin el prefijo `md:` — el zoom involuntario rompe el flujo de llenado de formularios en móvil.

### 6.2 Mínimo táctil ≥44px

**Regla:** Icon-buttons a mano usan `h-11 w-11 md:h-9 md:w-9` (44px en móvil, tamaño desktop normal con puntero fino); `Button size="sm"` ya trae `min-h-11 … md:min-h-0` para no forzar el `h-8` de escritorio.

**Ejemplo correcto:** `video-player.tsx:1192` (`h-11 w-11 … md:h-9 md:w-9`); `button.tsx:17` (`sm: "h-8 min-h-11 px-3 text-xs md:min-h-0"`).

**Antipatrón:** botones/íconos táctiles de ~24-32px sin variante móvil — el objetivo de Apple/WCAG es 44×44px como mínimo.

### 6.3 Nunca hover-only para acciones

**Regla:** Ninguna acción (editar, eliminar, copiar, menú) puede depender solo de `:hover`, porque en táctil no existe. Patrón: `opacity-100 md:opacity-0 md:group-hover:opacity-100` (visible siempre en móvil, oculto hasta hover solo en desktop).

**Ejemplo correcto:** `app/(admin)/admin/users/users-list-client.tsx:171`.

**Antipatrón:** `opacity-0 group-hover:opacity-100` sin el prefijo `md:` — en móvil la acción queda inalcanzable.

### 6.4 Pointer Events en superficies arrastrables

**Regla:** Barras de progreso, sliders y cualquier elemento arrastrable usan `onPointerDown`/`onPointerMove`/`onPointerUp` (+ `setPointerCapture`) en vez de `onMouseDown`/`onMouseMove`/`onMouseEnter`/`onMouseLeave`, que no reciben eventos táctiles.

**Ejemplo correcto:** `components/classroom/video-player.tsx` (barra de progreso y slider de volumen).

**Antipatrón:** handlers `onMouse*` exclusivos en un control que también debe operarse con el dedo.

### 6.5 Full-height con `min-h-dvh`, nunca `min-h-screen`

**Regla:** Contenedores de pantalla completa usan `min-h-dvh` (alto de viewport dinámico, descuenta la barra de Safari/Chrome móvil), no `min-h-screen` (equivalente a `100vh`, que en móvil deja un remanente de scroll fantasma).

**Ejemplo correcto:** `app/pago/gracias/page.tsx:9,19`.

**Antipatrón:** `min-h-screen` en layouts o pantallas completas nuevas — usa `min-h-dvh` desde el inicio.

### 6.6 Safe-areas en elementos fijos

**Regla:** Todo elemento fijo/sticky pegado al borde inferior (CTA sticky, footers de quiz, drawers) suma el inset de la barra de gestos: `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (o sumado al padding existente). Esto solo funciona porque el viewport global ya declara `viewportFit: "cover"` (`app/layout.tsx`).

**Ejemplo correcto:** `app/layout.tsx` (`export const viewport = { …, viewportFit: "cover" }`).

**Antipatrón:** un elemento `fixed bottom-0` con solo `pb-3`/`pb-4` fijo — en iPhone con home indicator el contenido queda pegado o tapado.

### 6.7 Grids siempre con colapso

**Regla:** Toda grilla usa un breakpoint de colapso: `grid-cols-1 sm:grid-cols-N`. Nunca `grid-cols-N` (N > 1) sin prefijo dentro de modales, paneles o tarjetas de estadísticas — a 360px las columnas quedan ilegibles o se desbordan.

**Ejemplo correcto:** patrón general del design system; ver cualquier grilla de stats o formularios en modales.

**Antipatrón:** `grid grid-cols-3 gap-3` sin prefijo responsive en un panel que también se renderiza en móvil.

### 6.8 Filas flex densas: `min-w-0`/`truncate`/`flex-wrap`

**Regla:** En filas con contenido variable + acciones (roster, listas de alumnos, breadcrumbs), el contenido principal lleva `min-w-0 truncate` para no forzar el ancho de la fila, y el grupo de acciones lleva `flex-wrap` para no cortarse. Nunca sacrificar el dato principal (nombre, título) por las acciones.

**Ejemplo correcto:** `components/ui/select.tsx` (`min-w-0 flex-1 truncate` en el trigger, línea 451).

**Antipatrón:** una fila `flex items-center gap-2` sin `min-w-0` en el hijo de texto — el contenido largo desborda el contenedor en vez de truncarse.

---

## Deuda conocida (no replicar; migrar si tocas el archivo)

| Deuda | Ubicación | Patrón correcto |
| --- | --- | --- |
| Colores hardcodeados (62 `red-*/green-*` + 53 hex) | `complete-profile-client.tsx:284`, `Formulario.tsx:160`, `admin/toast.tsx` | tokens `ca-*`/`destructive` (§3.5) |
| Doble sistema de toasts | `components/admin/toast.tsx` | `ui/toast.tsx` (§1.4) |
| `Field`/`SelectField` duplicados | `Formulario.tsx:184-211` | `ui/field.tsx` (§1.3) |
| `inputMode` faltante en tel/RUT | `complete-profile-client.tsx:357-388` | atributos completos (§2.3) |
| ~~Sin helper CLP de cliente~~ — **saldada 2026-07-29**: existe `lib/utils/money.ts` | quedan por migrar `admin/cobros/*` | usar `formatCLP`/`maskMonto` (§2.4) |
| Estilos condicionales con `style={{}}` | `complete-profile-client.tsx:379-387` | clases con `cn()` (§1.2) |
| Botones nativos reimplementando variantes | `cobro-generator.tsx:136-140` | `Button` (§1.1) |
