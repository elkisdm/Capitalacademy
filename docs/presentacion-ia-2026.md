# Presentación · IA 2026: de conversar a dirigir

Copia publicada de la presentación HTML de la clase **"IA aplicada al rol del asesor"**
(Diplomado, IV Generación · 22 de julio de 2026).

- URL pública: `/presentaciones/ia-2026` (el archivo real es `index.html`). En local la URL
  limpia funciona por el rewrite de `next.config.ts`; en Netlify, además, un 301 agrega la
  barra final. Por eso las rutas internas del HTML son absolutas y no relativas.
- Se sirve como archivo estático desde `public/`. No pasa por el layout ni por la sesión de
  Supabase: cualquiera con el enlace la puede abrir.
- Dentro del classroom se publica como recurso de tipo `link` de la clase en vivo.
- Versión descargable: `/presentaciones/ia-2026/presentacion-ia-2026.pptx` (enlace en el
  panel de ayuda, tecla `?`).

## Exportar a PPTX

El `.pptx` no se genera en cada visita: es un archivo estático que se reexporta a mano
cuando cambian las láminas. **Si editas `index.html`, el `.pptx` queda desactualizado
hasta que repitas estos tres pasos.**

Cada lámina entra como imagen a sangre completa, así que el resultado es idéntico al
diseño pero el texto de las láminas no es editable en PowerPoint. Lo que sí queda como
texto son las **notas del presentador**, que salen de `data-notes`.

```bash
# 1. El deck completo a PDF, usando su propio CSS de impresión (32 páginas 16:9).
#    Necesita el sitio corriendo en localhost:3000 y un Chrome headless.
"$HOME/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --headless --disable-gpu --virtual-time-budget=15000 --no-pdf-header-footer \
  --print-to-pdf=/tmp/deck.pdf http://localhost:3000/presentaciones/ia-2026

# 2. Cada página a JPEG de 1920x1080 (96 dpi sobre una página de 20 pulgadas). Requiere poppler.
mkdir -p /tmp/laminas && cd /tmp/laminas && pdftoppm -jpeg -jpegopt quality=82 -r 96 /tmp/deck.pdf slide

# 3. Armar el .pptx. Requiere `pip install python-pptx`.
python scripts/presentaciones/build-pptx.py \
  public/presentaciones/ia-2026/index.html /tmp/laminas \
  public/presentaciones/ia-2026/presentacion-ia-2026.pptx
```

Cualquiera puede obtener también un PDF con **Imprimir → Guardar como PDF** desde el
navegador: el `@page` de 1920×1080 y el bloque `@media print` están hechos para eso.

## Diferencias con el original

El original vive fuera del repo (carpeta de trabajo del autor). Al traerlo acá se hicieron
estos cambios; si se vuelve a sincronizar una versión nueva, hay que repetirlos:

1. **Fuente auto-hospedada.** La CSP del sitio (`style-src 'self' 'unsafe-inline'`) bloquea
   hojas de estilo externas, así que el `<link>` a Google Fonts se reemplazó por `@font-face`
   apuntando a `fonts/` (subset latin de Be Vietnam Pro, pesos 400–800). Beneficio extra:
   la presentación no depende de internet durante la clase.
2. **Rutas absolutas.** Todas las referencias `assets/…` y `fonts/…` pasaron a
   `/presentaciones/ia-2026/…`, porque la URL limpia no tiene barra final y las rutas
   relativas se resolvían contra `/presentaciones/`.
3. **Fotografías en WebP.** `elkis-obra`, `elkis-retrato`, `elkis-viaje` y `propiedad-demo`
   se convirtieron de JPG a WebP (`cwebp -q 82`): 2,0 MB → 820 KB en total.
4. **Logo reducido.** `capital-academy-logo.png` pasó de 648 px (106 KB) a 160 px (15 KB).
   Se usa 32 veces a 74 px de ancho, así que el original se decodificaba 16 veces más grande
   de lo necesario en cada lámina.

Se copiaron solo los assets que el HTML referencia; `aula.webp`, `diplomado.webp` y
`networking.webp` quedaron fuera porque no se usan.

## Por qué solo se pintan tres láminas

El diseño original deja las 32 láminas en el DOM, todas de 1920×1080, cada una con dos
pseudo-elementos grandes y con `will-change` en los 126 elementos revelables. En un
computador se aguanta; en Safari y Chrome de teléfono el navegador se queda sin memoria y
cierra la pestaña —la presentación abría un segundo y se caía—, y de paso el logo aparecía
roto porque el navegador descartaba imágenes ya decodificadas.

La corrección tiene cuatro partes, todas sin cambio visual:

- `render()` marca con la clase `far` toda lámina a más de una posición de la actual, y
  `.slide.far` usa `content-visibility: hidden` + `visibility: hidden`. Se pintan tres
  láminas en vez de 32. En Safari anterior a la 18 no hay `content-visibility`, pero
  `visibility: hidden` ya evita la mayor parte del gasto.
- `will-change` quedó acotado a `.slide.current [data-reveal]`.
- Se quitó un `filter: blur(.15px)` imperceptible que obligaba a crear una superficie de
  dibujo aparte en cada lámina, y las animaciones infinitas de `flywheel-ring` y
  `analogy-bridge` se acotaron a la lámina actual.
- En pantallas táctiles se apagan la textura `mix-blend-mode` del deck y la sombra del logo.

`@media print` reactiva las láminas lejanas para que imprimir siga dando las 32 páginas.

## El modo impresión estaba roto

De él sale el PPTX, así que hubo que arreglarlo. Tenía tres fallas, ninguna visible hasta
que se intentó imprimir: el deck se posiciona con `left/top: 50%` y se recentra con un
`translate` que el modo impresión anulaba, así que salía corrido media página y cada
lámina se partía en dos; los elementos revelables conservaban el desplazamiento de sus
variantes `.motion-left`/`.motion-right` (más específicas que el reset) y se solapaban
entre sí; y los que aún no se habían revelado salían con `filter: blur(4px)`. Además
faltaba `print-color-adjust: exact` —sin eso el navegador descarta los fondos— y un
`@page` de 1920×1080, sin el cual todo se imprimía en tamaño carta.

## Editar

El modo de edición del navegador (tecla `E`) guarda en `localStorage`, es decir, por equipo
y por navegador: sirve para ajustes del expositor, no para cambiar lo que ven los alumnos.
Para eso hay que editar este `index.html` y desplegar.
