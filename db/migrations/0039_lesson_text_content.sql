-- =============================================================================
-- Capital Academy — Migración 0039: contenido de texto/diapositiva por lección.
--
-- Hasta ahora una lección grabada (`kind='recorded'`) solo tenía sentido con
-- video Mux. Una lección sin video abría a un placeholder muerto. Esta migración
-- habilita "clases de texto": una explicación en formato enriquecido (Markdown)
-- que el alumno lee, además de los recursos ya existentes.
--
--   1. `lessons.content` (text, Markdown). NULL = sin contenido de texto.
--   2. Bucket PÚBLICO `lesson-content` para imágenes intercaladas en el Markdown.
--      Público (como `avatars`) porque un <img> en Markdown necesita una URL
--      estable; las signed URLs (que expiran) no sirven para contenido embebido.
--      El path lleva un UUID no adivinable. Solo imágenes, límite 5 MB.
--
-- Idempotente.
-- =============================================================================

-- 1. Columna de contenido Markdown.
alter table public.lessons add column if not exists content text;

-- 2. Bucket público para imágenes inline del contenido (solo imágenes, 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-content',
  'lesson-content',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
