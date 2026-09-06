# Work order — B1: the server never trusts a user id from the request (2026-09-06)

The hole, from docs/FOUNDATION-READINESS.md B1: edge functions run with the service-role key, which
bypasses row-level security, so each one must decide who is asking. Twenty still read `user_id` from
the request body. Nine of those check nothing. Any signed-in person who knows another person's id can
read or recompute that person's derived training data. Michael is the only user today; before a second
user signs up this closes.

The pattern already exists and 14 functions use it: `supabase/functions/_shared/require-user.ts`
`requireUser(req)` verifies the JWT and returns `{ userId, supabase }`. Body `user_id` is ignored.

## 1. Add one guard for internal callers

`requireUser` rejects the service-role key on purpose, which is right for client-facing functions but
breaks the fan-out: `strava-webhook`, `garmin-webhook-activities` and the backfill scripts call other
functions with `Authorization: Bearer <SERVICE_ROLE_KEY>` and a body `user_id`. Add to require-user.ts:

```ts
/** Client JWT → its user. Service-role JWT (internal fan-out, backfill scripts) → the explicit body user_id. Anything else → 401. */
export async function requireUserOrService(req: Request, bodyUserId?: string | null): Promise<{ userId: string; supabase: any; internal: boolean }>
```

Decode the JWT's `role` claim; `service_role` with a valid signature → trusted, `userId = bodyUserId`
(401 if absent). Otherwise → `requireUser`. Never accept the anon key with a body id.

## 2. Convert these twenty (the list is from a code scan; re-scan before you start)

No check at all today: arc-setup-chat, backfill-facts, backfill-routes, compute-snapshot,
generate-combined-plan, learn-fitness-profile, planning-context, process-workouts-batch,
recompute-athlete-memory.

Some check, still body-driven: adapt-plan, backfill-planned-workload, backfill-strength-load, coach,
compute-core-verdict, delete-goal, detect-cores, match-cores, readiness, recompute-workout,
save-imported-workout.

For each: the user id comes from `requireUser` (client-facing) or `requireUserOrService` (called by the
webhooks / scripts / other functions as well). Delete the body read. Scope every query by that id. Where
a function is called from another function with the service key, keep passing `user_id` in the body; it
is now only honoured for the service role. The client already sends the session JWT through
`supabase.functions.invoke`, so no client change is expected; grep `src` for any direct `fetch` to a
function URL that passes the anon key and fix it to send the session token.

Also `verify_jwt`: the two webhooks stay `verify_jwt = false` (they are called by Strava/Garmin). Every
other function keeps the gateway JWT check on.

## 3. Verify

Two throwaway accounts, A and B, real sessions (sign in, take the access token). For every converted
function: called as A with B's id in the body → 401 or A's own data, never B's; called as A with no id →
A's data; called with the service key and B's id → B's data (internal path); called with the anon key and
B's id → 401. Then a real end-to-end: import a workout for A through the Strava-shaped path the webhook
uses and confirm the analysers still run (they are the internal callers). Delete both accounts, zero rows.

Deno tests for the guard: client JWT, service JWT, anon key, forged token.

## 4. Ship

`deno check` on every touched function, tests green, deploy the twenty plus the two webhooks in one
`supabase functions deploy …` command, push. Update FOUNDATION-READINESS B1 to CLOSED with the date and
the function list. Report: functions converted, deployed versions, the A/B matrix results, anything left.
