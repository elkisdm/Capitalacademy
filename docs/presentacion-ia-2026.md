# Presentación · IA 2026: de conversar a dirigir

Copia publicada de la presentación HTML de la clase **"IA aplicada al rol del asesor"**
(Diplomado, IV Generación · 22 de julio de 2026).

- URL pública: `/presentaciones/ia-2026` (la URL limpia sale de un rewrite en `next.config.ts`;
  el archivo real es `index.html`).
- Se sirve como archivo estático desde `public/`. No pasa por el layout ni por la sesión de
  Supabase: cualquiera con el enlace la puede abrir.
- Dentro del classroom se publica como recurso de tipo `link` de la clase en vivo.

## Diferencias con el original

El original vive fuera del repo (carpeta de trabajo del autor). Al traerlo acá se hicieron
tres cambios; si se vuelve a sincronizar una versión nueva, hay que repetirlos:

1. **Fuente auto-hospedada.** La CSP del sitio (`style-src 'self' 'unsafe-inline'`) bloquea
   hojas de estilo externas, así que el `<link>` a Google Fonts se reemplazó por `@font-face`
   apuntando a `fonts/` (subset latin de Be Vietnam Pro, pesos 400–800). Beneficio extra:
   la presentación no depende de internet durante la clase.
2. **Rutas absolutas.** Todas las referencias `assets/…` y `fonts/…` pasaron a
   `/presentaciones/ia-2026/…`, porque la URL limpia no tiene barra final y las rutas
   relativas se resolvían contra `/presentaciones/`.
3. **Fotografías en WebP.** `elkis-obra`, `elkis-retrato`, `elkis-viaje` y `propiedad-demo`
   se convirtieron de JPG a WebP (`cwebp -q 82`): 2,0 MB → 820 KB en total.

Se copiaron solo los assets que el HTML referencia; `aula.webp`, `diplomado.webp` y
`networking.webp` quedaron fuera porque no se usan.

## Editar

El modo de edición del navegador (tecla `E`) guarda en `localStorage`, es decir, por equipo
y por navegador: sirve para ajustes del expositor, no para cambiar lo que ven los alumnos.
Para eso hay que editar este `index.html` y desplegar.
