-- Post-cutover removal of obsolete anonymous direct-table token access.
DROP POLICY IF EXISTS anon_resolve_client_token ON public.client_invites;
DROP POLICY IF EXISTS anon_mark_opened ON public.client_invites;
DROP POLICY IF EXISTS anon_resolve_intake_token ON public.firm_memberships;

-- Discovery storage is private. Access is granted only to authenticated users
-- whose RLS-visible project matches the first object-path segment.
UPDATE storage.buckets
SET public = false
WHERE id = 'discovery-files';

DROP POLICY IF EXISTS discovery_files_select ON storage.objects;
DROP POLICY IF EXISTS discovery_files_insert ON storage.objects;
DROP POLICY IF EXISTS discovery_files_update ON storage.objects;
DROP POLICY IF EXISTS discovery_files_delete ON storage.objects;

CREATE POLICY discovery_files_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'discovery-files'
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY discovery_files_insert_authenticated
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'discovery-files'
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY discovery_files_update_authenticated
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'discovery-files'
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'discovery-files'
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY discovery_files_delete_authenticated
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'discovery-files'
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
  )
);
