/*
  # Profile: user_baselines.profile + the avatars bucket (2026-09-06)

  Training Baselines folds into one Profile screen (/profile). The screen owns the numbers, zones,
  equipment, units and swim settings it already owned, plus name, photo, email, location, weight,
  height and age. Email is the auth user's and is not stored here. Weight, height and birthday are the
  existing columns. `profile` holds the three new identity fields:
    { name: string, location: string, photo_url: string }
  Written only by the client from the Profile screen; nothing on the server reads it.

  The photo lives in the `avatars` storage bucket at `<user_id>/photo.jpg`. Public read (the URL is
  stored in `profile.photo_url`); insert / update / delete only by the owner, in their own folder.

  Applied the way every migration in this repo is applied (see 20260828120000_exercise_log_slot_intent.sql):
  directly against production, then confirmed live by a PostgREST select and a storage upload as a
  throwaway user, not by reading a success message.
*/

ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_baselines.profile IS 'Identity fields set on the Profile screen: name, location, photo_url. Email is the auth user''s; weight, height and birthday are their own columns.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
