# Work order — Garmin partner readiness (2026-09-07)

Michael is meeting Garmin about a higher API tier. A Garmin partner review checks how the app behaves when
a user disconnects, whether the partner deletes Garmin data on request, and whether the callback endpoints
are protected. Three gaps, all on the Garmin side of the app. The user-data side is already tight
(FOUNDATION-READINESS B1 and B10 closed 2026-09-06/07; delete-account live).

What exists: OAuth2 connect from the client (`src/components/Connections.tsx`, `connect.garmin.com/oauth2Confirm`,
callback route `/auth/garmin/callback`); tokens in `user_connections` / `device_connections` (provider `garmin`,
`connection_data.garmin_user_id`); `garmin-webhook-activities` (verify_jwt=false) handles `activities` and
`activityDetails` notifications, mapping each to our user through the stored Garmin user id; `import-garmin-history`;
`send-workout-to-garmin`; `swift-task` (whitelisted proxy); `disconnect-connection` deletes our row only.

## 1. Handle Garmin's deregistration and permission-change notifications

Garmin's Health/Activity API sends two more notification types to endpoints registered in the developer
portal: `deregistrations` (the user removed efforts in Garmin Connect) and `userPermissionsChange` (the
user narrowed what we may read). Garmin requires a partner to stop pulling and delete that user's Garmin
data on deregistration.

- New edge function `garmin-webhook-user` (verify_jwt=false, same shape as the activities webhook). Body
  `{ deregistrations: [{ userId, userAccessToken? }] }` → for each: find our user by `garmin_user_id`,
  delete the `user_connections` and `device_connections` rows for provider garmin, and delete every
  `workouts` row where `garmin_activity_id is not null` for that user plus their dependent rows
  (`workout_facts`, `workout_data`, analysis rows keyed by workout id — check `delete_user_data` for the
  table list and delete by workout id, not by user id: the user keeps their account, only Garmin-sourced
  data goes). Write a `connection_events` row (new table, or reuse an existing log table if one fits)
  with `{ user_id, provider, event: 'deregistration', at }` so support can answer "what happened".
  Body `{ userPermissionsChange: [{ userId, permissions: [...] }] }` → store the permission list on the
  connection row (`connection_data.garmin_permissions`) and, if `ACTIVITY_EXPORT` is gone, stop pulling
  (the activities webhook checks it before fetching details). Always reply 200 fast; do the work after
  the reply the way the checkpoint re-price does (`EdgeRuntime.waitUntil`).
- Register the two endpoint URLs in the Garmin developer portal (Michael, from the report's exact URLs).

## 2. Tell Garmin when the user disconnects from our side

In `disconnect-connection`, provider `garmin`: before deleting our row, call Garmin's deregistration
endpoint with the user's access token — `DELETE https://apis.garmin.com/wellness-api/rest/user/registration`,
`Authorization: Bearer <token>`. A failure there is logged and does not block our delete (the user asked
to disconnect; we honour it either way). Same call from `delete-account` when the user has a Garmin
connection, before the sweep. Mirror for Strava if it is one line (`POST https://www.strava.com/oauth/deauthorize`).

## 3. A secret on the callback endpoints

Garmin does not sign notifications. The accepted protection is an unguessable callback URL. Add a
function secret `GARMIN_WEBHOOK_SECRET`; both webhooks require `?k=<secret>` on the URL and return 401
without it. The activities webhook keeps its second check (the notification's Garmin user id must match a
stored connection). Report the two full URLs, with the secret, for Michael to paste into the portal; the
old unsecured URL keeps working for 7 days (accept both during the switch, log which was used), then the
fallback comes out.

## 4. Housekeeping the reviewer would see

- `supabase/functions/garmin-webhook-activities-working.ts` is a stray copy at the functions root from an
  old fix. Delete it.
- The privacy page (`src/pages/Privacy.tsx`) must state, in plain words: what Garmin data we read, that we
  stop and delete it when the user disconnects or deletes the account, and that data is not sold. Add
  those sentences if missing. Michael reads the final text before the meeting.

## 5. Verify, ship

Throwaway account with a fake Garmin connection row (`garmin_user_id` set): post a deregistration to the
new endpoint with and without the secret → 401 / 200; after 200 the connection rows are gone, the
Garmin-sourced workouts and their dependents are gone, non-Garmin workouts remain, the account remains,
the event row exists. Post a permissions change → stored. Call disconnect as the user → our row gone,
Garmin call attempted (mock or observe the outbound request in logs). Delete the throwaway. Deploy the
new function and the three touched ones, push. Report: the two callback URLs for the portal, deployed
versions, what was verified, what needs Garmin's sandbox to confirm.
