# Presentación · IA 2026: de conversar a dirigir

Copia publicada de la presentación HTML de la clase **"IA aplicada al rol del asesor"**
(Diplomado, IV Generación · 22 de julio de 2026).

- URL pública: `/presentaciones/ia-2026` (el archivo real es `index.html`). En local la URL
  limpia funciona por el rewrite de `next.config.ts`; en Netlify, además, un 301 agrega la
  barra final. Por eso las rutas internas del HTML son absolutas y no relativas.
- Se sirve como archivo estático desde `public/`. No pasa por el layout ni por la sesión de
  Supabase: cualquiera con el enlace la puede abrir.
- Dentro del classroom se publica como recurso de tipo `link` de la clase en vivo.

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

## Editar

El modo de edición del navegador (tecla `E`) guarda en `localStorage`, es decir, por equipo
y por navegador: sirve para ajustes del expositor, no para cambiar lo que ven los alumnos.
Para eso hay que editar este `index.html` y desplegar.
