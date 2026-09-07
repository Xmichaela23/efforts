# Work order — a demo account for partner meetings (2026-09-07)

Michael is showing the app to Garmin (and later Strava). He is not sharing his own login. Build a demo
account that carries a copy of his training history so the screens are full, with his identity and his
device connections stripped, that he can hand to a reviewer and delete afterwards.

## What to build: `scripts/make-demo-account.mjs`

1. Create an auth user `demo@efforts.work` with the password given on the command line (Michael passes it;
   never print it, never store it in the repo). If the user exists, reuse it and wipe its rows first with
   `delete_user_data(uid)` (service role) so the script is repeatable.
2. Source: user id `45d122e7-a950-4d50-858c-380b492061aa`. **Read only** from the source, ever.
3. Copy every row from every public table with a `user_id` column (list it from `information_schema` at
   run time, the way `delete_user_data` does), in dependency order, remapping primary keys that other
   tables reference: at least `workouts.id` (→ `workout_facts.workout_id`, `workout_data.workout_id`,
   `planned_workouts.completed_workout_id`, `exercise_log.workout_id`…), `plans.id` / `training_plans.id`
   (→ `planned_workouts.training_plan_id`), `goals.id`, `routines.id`. Build the map table by table; a
   foreign-key violation on insert means a missed reference, fail loudly and fix the map.
4. Skip entirely: `user_connections`, `device_connections`, `connection_events`, `coach_cache`,
   `athlete_snapshot`, `block_adaptation_cache` (the caches get rebuilt for the demo user by calling
   `compute-snapshot`, `coach` and `learn-fitness-profile` with the service key and the demo id, the
   internal path from the B1 work order).
5. Strip identity: `user_baselines.profile` → `{ name: 'Demo Athlete', location: 'Los Angeles' }`, no
   photo; `users` row email = the demo email; clear `strava_activity_id`, `garmin_activity_id`,
   `healthkit_id` on workouts so nothing dedupes or syncs against real providers; keep `source` words.
6. Dates: keep as they are (the demo is "an athlete two weeks into the All Rounder"); the reviewer sees
   the same today Michael sees.
7. Print a summary: rows per table, the demo user id, and the login email. Nothing else.

`scripts/delete-demo-account.mjs`: `delete-account` semantics for the demo id (call `delete_user_data`
then `auth.admin.deleteUser`). Michael runs it after the meetings.

## Verify

Sign in as the demo on the web build: Home shows the week, State shows the four rows with numbers, Adjust
shows the lifts with their words, Profile shows Demo Athlete with no photo, Connections shows nothing
connected. Michael's own account is unchanged: row counts before and after the script are identical.
Report the counts and the two commands. The password is never in the report.
