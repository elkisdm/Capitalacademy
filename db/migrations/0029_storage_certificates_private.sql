-- =============================================================================
-- Capital Academy — Bucket de certificados: cerrar acceso público
-- Auditoría 2026-06-17: el bucket "certificates" era public=true con política
-- "to public" → cualquiera podía descargar el PDF de cualquier alumno si
-- conocía el path (expuesto en devtools al ver el correo/classroom).
--
-- Fix: bucket privado + lecturas solo vía signed URLs generadas server-side
-- con createAdminClient. Los paths existentes en pdf_storage_path siguen válidos.
-- =============================================================================

-- Hacer el bucket privado
update storage.buckets
set public = false
where id = 'certificates';

-- Eliminar políticas que permitían lectura pública / any-authenticated
drop policy if exists "Users can read own certificates" on storage.objects;
drop policy if exists "Public certificate read access" on storage.objects;

-- Nota: no se crea política de lectura. Todos los accesos van por service-role
-- (createAdminClient) que bypasea RLS. Las descargas se entregan via signed URLs
-- generadas por el servidor con expiración controlada.
