/*
  # The `exports` bucket — "Download your data" (2026-09-07)

  docs/WORKORDER-menu-and-export-2026-09-07.md §2. The export-data edge function builds one zip per
  athlete and writes it with the service role to `exports/<user_id>/efforts-export-<date>.zip`, then hands
  the client a signed URL good for 60 minutes. Private bucket: nobody reads it anonymously. The owner may
  read their own folder directly (belt and braces beside the signed URL); nobody but the service role
  writes, updates or deletes — there is deliberately no INSERT / UPDATE / DELETE policy for `authenticated`,
  and the service role bypasses row security.

  The function also creates this bucket on first run if it is missing (so the flow works before this file
  is applied); this migration is what adds the owner-read policy. Objects older than a day are removed by
  the function itself on the athlete's next export — there is no scheduled job in this repo.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', false, 52428800, ARRAY['application/zip'])
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "exports owner read" ON storage.objects;
CREATE POLICY "exports owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);
