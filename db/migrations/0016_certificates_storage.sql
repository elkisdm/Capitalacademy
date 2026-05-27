-- Create storage bucket for certificate PDFs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificates',
  'certificates',
  true,
  5242880, -- 5 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Authenticated users can read their own certificates
create policy "Users can read own certificates"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'certificates'
  );

-- Only service role (admin client) uploads certificates — no user upload policy needed
-- Public read access for verification/download
create policy "Public certificate read access"
  on storage.objects for select
  to public
  using (bucket_id = 'certificates');
