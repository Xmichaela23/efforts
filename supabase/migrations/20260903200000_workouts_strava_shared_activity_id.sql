-- The Strava activity created when an athlete SHARES a strength session out of Efforts.
--
-- ⛔ DELIBERATELY NOT `strava_activity_id`. That column means "this workout CAME FROM Strava" and is
-- the key the ingest upsert and the cross-provider de-duplication read. Writing an outbound id there
-- would make a session we posted look like one we imported, and the next Strava sync would treat it
-- as a duplicate of itself.
alter table if exists public.workouts
  add column if not exists strava_shared_activity_id text;

comment on column public.workouts.strava_shared_activity_id is
  'Strava activity id created by share-strength-to-strava. Outbound only — never an import key.';
