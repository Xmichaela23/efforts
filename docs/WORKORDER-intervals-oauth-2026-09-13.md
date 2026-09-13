# WORKORDER — Intervals.icu sign-in (OAuth) · 2026-09-13

Handoff from the 2026-09-12/13 session. Engineer session. Read this whole file before touching anything.

Rules that apply: no commit / push / deploy without Michael's "go". Never `git commit -a` (terminals share the tree —
add exact files). Every athlete-facing word goes to Michael for a yes before it ships. Deploy every importer of a
changed `_shared` / `src/lib` file. Michael is the only user (pre-launch); build for any athlete, verify on a throwaway
account, never tune to his numbers.

---

## 1. What is built and live (do not rebuild)

| commit | what |
|---|---|
| `87202a89` | Automatic calendar sync to Garmin + Intervals.icu; API-key connection; Connections entry |
| `a99f7b25` | Garmin schedule id fix (`scheduleId`); daily sync cron |
| `9c405b50` | Workout titles sent = `deriveWorkoutTitle`; `computed.anchors.ftp_w` written after the FTP resolves |
| `8907427b` | Run threshold HR from highest 20/60-min heart-rate windows (TrainingPeaks rule) |
| `3c6a22b5` | Run threshold pace from best 45-min pace (TrainingPeaks rule) |

**How the sync works**
- Trigger: `planned_workouts` insert/delete/relevant update → `queue_calendar_sync()` → one queued `jobs` row
  (`kind='calendar-sync'`, 60 s delay, deduped per user) → `run-jobs` → `calendar-sync`. Only for users whose
  `users.preferences.workout_destinations` is an object. Also fires when destinations change.
  Migration: `supabase/migrations/20260913120000_calendar_sync.sql` (applied).
- Daily: pg_cron `calendar-sync-daily` 10:00 UTC (job id 2) queues every user with destinations.
  Migration `20260913130000_calendar_sync_daily.sql` (applied).
- Logic: `supabase/functions/_shared/calendar-sync/run.ts` (DB + providers), `plan.ts` (pure diff, 15-day window =
  TrainingPeaks' Garmin window), records in `calendar_deliveries` (unique `planned_workout_id, provider`; no FK because
  `activate-plan` re-inserts every row on rebuild). Never writes `planned_workouts`.
- Intervals: `_shared/intervals/serialize.ts` (rides only; % of `anchors.ftp_w`), `_shared/intervals/client.ts`
  (`POST /events/bulk?upsert=true`, `PUT /events/bulk-delete` by `external_id` = planned workout id).
- Garmin: `_shared/garmin/convert-workout.ts`, `prepare.ts`, `training-api.ts` (moved out of `send-workout-to-garmin`,
  unchanged except delete + scheduleId fix). Changed workout on Garmin = delete old + create new.
- Credentials: `_shared/token-crypto.ts` AES-GCM, key `CONNECTION_TOKEN_KEY` (server secret, set). Intervals row in
  `user_connections`: `provider='intervals_icu'`, `access_token` encrypted, `connection_data = { auth: 'api_key' |
  'oauth', athlete_id, name, timezone }`. `run.ts` already branches on `auth === 'oauth'` → Bearer token.
- Key connect: `intervals-connect-key` (user JWT; `{ api_key }` or `{ disconnect: true }`); sets default destinations
  when absent: ride → intervals_icu, run → garmin if Garmin connected else none, swim/strength → none.

**Verified:** Intervals create/repeat/move/delete/rebuild/off on a throwaway account
(`scripts/_burner-calendar-sync-2026-09-13.ts`, lives only in `/Users/michaelambp/efforts-intervals`, gitignored).
Michael's real account: 7 rides on Intervals → Zwift with titles; 4 runs created on Garmin; plan delete removed all
from both. **Not verified:** Garmin update path on a real changed workout; Zwift picking up edits promptly (Intervals →
Zwift timing is not documented and lagged >1 h tonight).

**Michael's account right now:** Intervals connected by API key (`auth: 'api_key'`, athlete `i711093`); destinations
ride → intervals_icu, run → garmin. No active plan at close.

---

## 2. The job: "Connect Intervals.icu" via OAuth

The OAuth app is **approved** (Intervals app id 954, name "Efforts", managed at https://intervals.icu/settings/apps).
Registered on the application form:
- Redirect URI: `https://efforts.work/auth/intervals/callback` (a client page, same pattern as
  `/auth/garmin/callback` → `GarminCallback.tsx`, `/strava/callback` → `StravaCallback.tsx`; routes in `src/App.tsx`).
- Webhook URL `https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/intervals-webhook` with an authorization header
  (value in `efforts/.env.local` as `INTERVALS_WEBHOOK_SECRET`; not yet a server secret). **The webhook function is not
  built and is not part of this job** — do not build it.

### Step 0 — verify before code (write findings into this file)
From the Intervals OAuth thread https://forum.intervals.icu/t/intervals-icu-oauth-support/2759 and the OpenAPI doc
https://intervals.icu/api/v1/docs: authorize URL, token URL, exact scope names (calendar write is the one needed now),
token lifetime and whether refresh tokens exist, token response fields (athlete id?), revoke endpoint. Nothing in this
file about those is verified.

#### Step 0 findings (2026-09-13, read directly from the sources)
Sources read: forum thread raw text (`forum.intervals.icu/raw/2759`, 63 posts; post #1 by david, last edited
2026-08-28), the OpenAPI JSON served at `intervals.icu/api/v1/docs`, the API cookbook (`forum.intervals.icu/raw/80090`),
and "Uploading planned workouts" (`forum.intervals.icu/raw/63624`).

| item | finding | source |
|---|---|---|
| Authorize URL | `https://intervals.icu/oauth/authorize?client_id=…&redirect_uri=…&scope=…&state=…` | thread #1 |
| Redirect back | `<redirect_uri>?code=…&state=…`; declined → `<redirect_uri>?error=access_denied` | thread #1 |
| Redirect URI match | exact match only; wildcards not supported ("Invalid redirect_uri") | thread #38, #39 |
| Token URL | `POST https://intervals.icu/api/oauth/token`, form data `client_id`, `client_secret`, `code`. The example sends no `grant_type` and no `redirect_uri`. | thread #1 |
| Exchange window | the code must be exchanged **within 2 minutes** | thread #1 |
| Token response | `{ token_type: "Bearer", access_token, scope: "CALENDAR:WRITE,…", athlete: { id, name } }` — **athlete id and name come back in the exchange** | thread #1 |
| Calling the API | `Authorization: Bearer <access_token>`; `0` works as the athlete id in any path | thread #1 |
| Scopes | `ACTIVITY`, `WELLNESS`, `CALENDAR`, `CHATS`, `LIBRARY`, `SETTINGS`, each `:READ` or `:WRITE` (WRITE implies READ), comma-separated. **Calendar write = `CALENDAR:WRITE`.** The user can untick scopes on the consent screen, so check the returned `scope`. | thread #1; `CALENDAR:WRITE` for events confirmed in 63624 |
| `GET /athlete/{id}` | needs `SETTINGS:READ` | thread #47 (david) |
| Token lifetime | **no expiry and no refresh tokens** ("doesn't use refresh tokens, only access tokens"; tokens are "once-off", confirmed by david) | thread #9, #20, #22 |
| Re-authorising | each authorisation makes a new token; since 2023 older tokens for the same app stay valid; the most recent scopes apply to all of them | thread #14, #24 |
| Revoke | `DELETE https://intervals.icu/api/v1/disconnect-app` with the Bearer token; also stops webhook delivery | thread #1; OpenAPI `disconnectApp` (200 ok, 401 bad token) |
| PKCE | not mentioned in any source read | thread, OpenAPI, cookbook |
| Rate limit | per IP, about 10 requests/s with some bursting | thread #60 (2026-01-26) |
| OpenAPI coverage | security schemes `APIKey` (basic) and `AccessToken` (bearer). The OpenAPI JSON does **not** describe `/oauth/authorize` or `/api/oauth/token`; its only OAuth endpoint is `disconnect-app`. | OpenAPI JSON |
| external_id rule | `events/bulk?upsert=true` matches `external_id` only on events "created by the same OAuth application"; `bulk-delete` by `external_id` requires "created by the calling OAuth application". Confirms Step 2.4. | OpenAPI JSON |

**What this changes in Step 2 (for review before build):**
- Step 2.3 (refresh near expiry) has nothing to refresh. The only failure is a rejected token (athlete revoked the app
  in Intervals, or Intervals changes its policy): on a 401/403 from Intervals mark the connection `needs_reauth`.
  `refresh_token` / `expires_at` stay null.
- Step 2.2 does not need `GET /athlete/0`: the exchange returns athlete id and name. That call would need
  `SETTINGS:READ` too. `connection_data.timezone` is written by the key path but not read by `calendar-sync/run.ts`
  (it reads `athlete_id` and `auth` only — grep of `run.ts`). So request `CALENDAR:WRITE` only.
- Disconnect for an OAuth connection calls `DELETE /api/v1/disconnect-app` before deleting the row.
- No PKCE: bind `state` to the user (as the Garmin/Strava callbacks do). The exchange runs server-side so the client
  secret never reaches the phone.
- The 2-minute window means the callback page posts the code to the server immediately; no deferred exchange.

#### What already exists for each Step 2 piece (2026-09-13, code read in `efforts-intervals` at `3c6a22b5`)
| piece | what is there | file:line |
|---|---|---|
| Callback routes | `/strava/callback` and `/auth/garmin/callback`; no Intervals route | `src/App.tsx:43-44` |
| Garmin start | PKCE pair in `sessionStorage`, popup to `connect.garmin.com/oauth2Confirm`. **`state` is `Math.random()` and is never checked anywhere** | `src/components/Connections.tsx:858-898` (state :878) |
| Garmin callback page | no exchange on the page: popup → `postMessage` to the opener; same tab → `sessionStorage.garmin_auth_code` and navigate to `/` or `/welcome` | `src/components/GarminCallback.tsx:34-55` |
| Garmin exchange | opener listens (`:282-295`), POSTs `{ code, codeVerifier, redirectUri }` with the user JWT to `bright-service` | `Connections.tsx:792-856` |
| `bright-service` | JWT → user id (`:46-55`), form-encoded token call (`:81-104`), plain-text tokens upserted into `user_connections` with `healthyOnConnect()` (`:141-175`) | `supabase/functions/bright-service/index.ts` |
| Strava start | no `state` at all; same tab on Safari, popup elsewhere | `Connections.tsx:434-468` |
| Strava callback page | exchanges on the page: `strava-token-exchange` with `{ code, userId, redirectUri }` — **user id from the body, not the JWT** | `src/components/StravaCallback.tsx:32-39`; `strava-token-exchange/index.ts:39` |
| `intervals-connect-key` | JWT via `requireUser`; `{ disconnect: true }` deletes the row only, tells Intervals nothing (`:26-30`); key row `auth:'api_key'` encrypted with `healthyOnConnect()` (`:43-53`); default destinations when absent (`:55-63`) | `supabase/functions/intervals-connect-key/index.ts` |
| `run.ts` oauth branch | `connection_data.auth === 'oauth'` → `{ kind: 'oauth', accessToken, athleteId }` (`:63-70`); Intervals 4xx/5xx → `recordProviderResult(..., table:'user_connections')` (`:148-153`) | `supabase/functions/_shared/calendar-sync/run.ts` |
| Bearer header | `oauth` → `Bearer <token>` | `_shared/intervals/client.ts:20-22` |
| needs_reauth | 401/403 → `needs_reauth`, other non-2xx → `error` | `_shared/connection-health.ts:13-17, 44-55` |
| Card | reads `health` (`Connections.tsx:414`); "Reconnect ›" for `needs_reauth` (`:1067-1083`) — **for Intervals it calls `disconnectIntervals()`** (`:1076`); key box + "Connect" (`:1311-1335`); `disconnectIntervals` calls `intervals-connect-key` (`:1007-1018`) | `src/components/Connections.tsx` |
| Provider notify on disconnect | `disconnect-connection` and `delete-account` notify Garmin and Strava only; nothing for Intervals | `disconnect-connection/index.ts:43-45`; `delete-account/index.ts:63-64` |

Correction to Step 0: "bind state to the user (as the Garmin/Strava callbacks do)" — neither binds or checks state
(rows above). The Intervals flow is the first one that does.

**Build choices from the trace:**
- New function `intervals-oauth` (user JWT): `start` returns the authorize URL with a signed `state`; `exchange`
  takes `{ code, state }`; `disconnect` handles both key and OAuth rows. `intervals-connect-key` keeps the key path.
- State = HMAC over (user id, expiry, nonce), key derived from `CONNECTION_TOKEN_KEY`; no table, no migration. The
  exchange rejects a state signed for a different user. Expiry 30 min — OURS (time on the Intervals sign-in page).
- Callback page mirrors `StravaCallback` (exchange on the page, needed for the 2-minute window) with the JWT.
- The default-destinations rule moves to one shared helper both functions import.

#### Step 2 items 1–4: built 2026-09-13 in `efforts-intervals` (NOT committed, NOT deployed)
- `supabase/functions/intervals-oauth/index.ts` — start / exchange / disconnect. Uses its own service-role client:
  the client `requireUser` returns carries the athlete's JWT, so the database treats it as the athlete, and the
  first throwaway run failed on it ("permission denied for table calendar_deliveries").
- `_shared/intervals/oauth.ts` (+ `oauth.test.ts`, 10 pass) — state, authorize address, token call, disconnect-app.
- `_shared/intervals/connection.ts` — default destinations (moved out of `intervals-connect-key`, same rule), the
  key cleanup, queue a sync. Cleanup deletes on Intervals FIRST and drops the delivery rows only after it answers, so
  a failure keeps the rows and a second tap deletes again (bulk-delete ignores events already gone). Review 2026-09-13
  caught the first version doing it the other way round: a failure then a second tap doubled every ride.
- `src/components/IntervalsCallback.tsx`, route in `src/App.tsx`; `Connections.tsx`: "Connect Intervals.icu" above
  the key box, "Switch to Intervals.icu sign-in" on a key-connected card (a key athlete who disconnected first would
  lose the key and get every ride twice), Reconnect on a sign-in row starts the sign-in, Disconnect goes through
  `intervals-oauth`.
- Review fixes 2026-09-13: (1) every answer to a signed-in caller is HTTP 200 `{ ok, reason, error }` — supabase-js
  functions-js 2.4.5 `invoke` throws away the body of a non-2xx answer, so the calendar-access line could never show;
  only a bad session is 401. (2) cleanup order above. (3) Disconnect on a key connection runs the same cleanup with the
  key (today and later) before deleting the row; a failure keeps the connection. Sign-in disconnect stays revoke-first.
  (4) The card clears loading and re-reads the Intervals.icu row when the page is shown again after the sign-in
  started (`visibilitychange` / `pageshow` / `focus`); in the iPhone app the address opens in Safari and the page
  never leaves. (5) Approved copy in; DRAFT comments off.
- Deploy order when Michael says go: `intervals-oauth` and `intervals-connect-key`, then the website push.
  `calendar-sync` needs no deploy. Keep `supabase/functions/deno.lock` and `supabase/.temp/cli-latest` out of any
  commit.

**Verified on throwaway accounts** (`scripts/_burner-intervals-oauth-2026-09-13.ts`, gitignored; handler run on this
machine against the real database and real Intervals.icu; the token call for made-up codes is the one fake):
state refused for another user / altered; bad code at the real token URL refused (404 "Client and/or secret not
found" — the URL is live and reads form fields); calendar scope unticked refused; key connection untouched by every
refusal; every refusal answers HTTP 200 with its reason; Intervals.icu failing (500, faked) during the switch refused
it and kept the 4 delivery rows and 4 events, and the second tap then switched; switch removed the 4 key-sent rides from Intervals and their delivery rows, row saved as oauth with athlete
id from the token response, no refresh/expiry, token encrypted, sync queued; the DEPLOYED calendar-sync ran the oauth
branch with the made-up token and got 401 (retries, as for any provider error); a local sync marked the row
needs_reauth; re-sign-in over an oauth row skipped cleanup; disconnect called disconnect-app (401 for a made-up
token) and removed the row; a key sync put the 4 rides back, then key disconnect removed all 4 with the key and their delivery rows, sent nothing
to disconnect-app, and removed the row; connection_events rows written. Teardown: both users deleted,
0 throwaway events left on the Intervals calendar.

**Unverified:** a real code exchange (needs a real sign-in — Michael's go); that the real response matches thread #1
(athlete id and scope fields); whether disconnect-app with a real token revokes; no duplicates on Michael's calendar
after his switch; the card's loading clearing on the phone when the app comes back from Safari (not run on a device).
**Open item — iPhone sign-in (not built, by decision 2026-09-13):** in the app, Capacitor opens intervals.icu in
Safari, so Intervals.icu returns to `/auth/intervals/callback` in Safari, where the athlete is usually not signed in to
Efforts; the exchange then answers 401 and the page shows "Intervals.icu did not connect." A deep link back into the
app would fix it; not built now. The Garmin and Strava connects have the same shape (not checked).
**Known gaps left:** a sync already running with the key during the switch can re-create a ride after the cleanup;
a refused key during the switch cannot remove its rides (duplicates, logged in `cleanup.key_rejected`);
`delete-account` does not call disconnect-app. Toast fallback words ("Connection failed", "Disconnect failed") and
the server's raw error text in the toasts are not approved copy.

### Step 1 — Michael sets the secrets (he does this; you give him the command)
`INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET` from https://intervals.icu/settings/apps →
`supabase secrets set --env-file <file> --project-ref yyriamwvtvzlkumqrvpm`. Never ask for the values in chat.

### Step 2 — build
1. Client: Connections Intervals card → "Connect" starts the authorize redirect (state bound to the user, PKCE if
   supported); `/auth/intervals/callback` page posts `code` to a server function (mirror `bright-service` / Garmin).
2. Server `intervals-oauth-callback` (or extend `intervals-connect-key` with `{ code }`): exchange, `GET /athlete/0`,
   encrypt tokens with `encryptToken`, upsert `user_connections` with `connection_data.auth = 'oauth'`, refresh token and
   expiry if the API issues them; set default destinations when absent (same rule as the key path).
3. Refresh: before use in `run.ts`, refresh when near expiry (mirror `ensureValidGarminAccessToken`); on failure mark
   the connection `needs_reauth` via `recordProviderResult(..., table: 'user_connections')` — the card already shows
   "Reconnect ›" for that.
4. **Switch-over from the key:** Intervals upsert matches `external_id` only for events created by the same OAuth client.
   Events Michael's key created will NOT be matched by the OAuth client → duplicates. On an api_key → oauth switch:
   with the old key, `bulk-delete` every `calendar_deliveries` row for `intervals_icu`, delete those delivery rows, then
   let the next sync recreate under OAuth. No plan rebuild needed.
5. Remove the API-key box from the card once OAuth works (the key path can stay server-side for testing, or go — ask).
   > **Decided 2026-09-13 (Michael):** remove the box now; the card is one "Connect Intervals.icu" button, like Strava
   > and Garmin. `intervals-connect-key` stays on the server, unchanged, for the throwaway-account script. Existing key
   > rows keep Disconnect / Reconnect / Switch. Removing the box also closes the sign-in → Disconnect → paste-key doubling.
   > **Sign-up for athletes with no Intervals.icu account needs nothing built** (seen 2026-09-13 in a browser, logged
   > out): the authorize page shows "Not registered? Click to signup", which opens `intervals.icu/signup` with
   > `client_id`, `redirect_uri`, `scope` and `state` carried in the address. Not seen end to end (needs a real new
   > account). On the iPhone app the same trip ends in Safari — the open iPhone item above.

   **Done 2026-09-13 (not committed, not deployed):** `src/components/Connections.tsx` — the not-connected Intervals.icu
   card is the one "Connect Intervals.icu" button; removed the "API key" field, its hint, its "Connect" button,
   `connectIntervals` and `intervalsKey` (nothing else used them). Title and "Sends your rides to Zwift, Wahoo and other
   apps linked in Intervals.icu." unchanged. Key rows unchanged: Disconnect, Reconnect ›, "Switch to Intervals.icu
   sign-in" read `connectionData.auth`, not the removed code. No new words. `intervals-connect-key` not touched in this
   change. Checked: tsc on `Connections.tsx`, `IntervalsCallback.tsx`, `App.tsx` 0 errors; vite build ok; throwaway
   script setup / run (38 ok, 0 fail) / teardown (both users deleted, 0 events left). The script does not click the
   card, so the card itself is not seen in a browser.

### Step 3 — verify
Throwaway account through the real Connect flow is not possible without an Intervals login, so: verify the callback
exchange end-to-end on Michael's account only with his go, after a throwaway-account test of everything else
(adapt `_burner-calendar-sync-2026-09-13.ts`). Check: no duplicates on his Intervals calendar after the switch.

---

## 3. Open items that need Michael's words (do not ship copy without his yes)

1. **Where each sport goes.** There is no screen for `workout_destinations`. Needs its own small section on Connections
   (ride / run → Garmin · Intervals.icu · Off). Not inside "Activity Source Preference" (that card is about incoming
   activities).
2. **Send to Garmin button** (`TodaysEffort.tsx`, `StructuredPlannedView.tsx`) still shows on sports that now send
   automatically; a tap makes a second copy. Also it has never saved what it sent (`garmin_workout_id`,
   `garmin_schedule_id`, `workout_status='sent_to_garmin'` don't exist / fail the CHECK) — the sync cannot remove button
   sends. Decide what replaces it on auto-sent sports.
3. Approved card copy already live: title "Intervals.icu"; line "Sends your rides to Zwift, Wahoo and other apps linked
   in Intervals.icu."; "API key" + hint "Found in Intervals.icu under Settings, in Developer Settings."; "Connect".
4. **Sign-in copy approved by Michael 2026-09-13**, exactly as written: "Connect Intervals.icu"; "Switch to
   Intervals.icu sign-in"; callback page title "Intervals.icu" (spinner while it works); "Intervals.icu did not
   connect."; "Intervals.icu did not connect. Calendar access is needed to send your rides."; "Back to Connections".
   The "DRAFT WORDS" comments in `Connections.tsx` and `IntervalsCallback.tsx` can come off. Toast fallback text was
   not part of this approval.
   **Also approved 2026-09-13:** Connections toasts for the Intervals.icu card show only "Intervals.icu did not
   connect." (start / switch / reconnect failure) or "Intervals.icu did not disconnect." (disconnect failure), each with
   a "Try again" button that repeats the action; never server or library text. The callback page keeps "Back to
   Connections".
5. **What Intervals.icu is for (Michael, 2026-09-13):** Zwift and Wahoo only — rides out to them, finished rides back
   from them. Zwift stays inside Intervals.icu (workouts out and finished rides back through it) to avoid confusion.
   Not COROS / Suunto / Huawei / Amazfit; no runs through Intervals.icu. Not a Strava route: the Intervals API returns
   "an empty stub object" for Strava-sourced activities (OpenAPI `listActivities`, `getActivity`). Strava production
   access is pending (10 athletes allowed now); Michael plans up to 9 Strava athletes later. Needs, when built: a clear
   selection on Connections — finished activities come from Garmin / Strava / Intervals.icu, and where rides and runs go
   — replacing "Activity Source Preference" (today Garmin only / Strava only / Both, read by `garmin-webhook-activities`,
   `strava-webhook`, `import-strava-history`; `workout_destinations` has no screen). The return path (ACTIVITY webhook →
   `/activity/{id}/fit-file` → the existing `import-fit-file` / `save-imported-workout` path) is not built. **Decided 2026-09-13
   (Michael): the sign-in asks for `CALENDAR:WRITE,ACTIVITY:READ,SETTINGS:WRITE` in the one approval**, the same for every
   athlete (Zwift, Wahoo or both), so nobody approves twice. Goal: one step; the athlete never thinks about
   Intervals.icu again. Only the Zwift / Wahoo link inside Intervals.icu stays the athlete's (the API reads it via
   `GET /athlete/{id}/connections` → `zwift_connected`, `wahoo_connected`, but has no endpoint to create it); Efforts can
   then set `zwift_upload_workouts` / `wahoo_upload_workouts` / `*_sync_activities` via `PUT /athlete/{id}` (not built;
   scope each endpoint needs is inferred, not verified).
   **Garmin does not pass Zwift rides on** (checked 2026-09-13): Garmin support "No Data Forwarding" — Garmin Connect
   "does not forward data received from one third-party site to another" (support.garmin.com faq=8L3Z4gEmTk6sXV7ido1Uz6,
   faq=glJyCFNknq1gbFIL4MBGn6); Runalyze help says Garmin leaves these out of its API; Intervals.icu developer (forum
   t/98908, 2025): Garmin stopped passing on third-party files, and Zwift rides that reach Garmin or Wahoo will not appear
   in Intervals.icu — the athlete must link Zwift directly inside Intervals.icu. Hand-uploaded files are shared by Garmin
   (Garmin FAQ wording; not tested). Nothing in `garmin-webhook-activities` filters by device, so this is Garmin's rule.
   **Scope change done 2026-09-13 (not committed, not deployed):**
   - Format checked against Step 0 (thread post #1): comma-separated `SCOPE:READ|WRITE`, WRITE implies READ. The three
     names are all in that list.
   - OpenAPI JSON re-read 2026-09-13 (`intervals.icu/api/v1/docs`): `GET /api/v1/athlete/{id}/connections`
     (`getAthleteConnections`) and `PUT /api/v1/athlete/{id}` (`updateAthlete`) carry no per-operation `security`, no
     description, and no scope name; the document names no `SCOPE:READ|WRITE` on any operation (searched every path).
     Only the global schemes `APIKey` / `AccessToken` apply. The scope each needs is still not stated anywhere read;
     the only source naming one is thread #47 (`GET /athlete/{id}` needs `SETTINGS:READ`).
   - Code: `_shared/intervals/oauth.ts` — requested scope is `CALENDAR:WRITE,ACTIVITY:READ,SETTINGS:WRITE`; the refusal
     still checks `CALENDAR:WRITE` only; `connection_data.scope` keeps the granted list (unchanged). `oauth.test.ts` and
     the throwaway script updated to the three scopes.
   - Checked: deno tests 16 pass; throwaway setup / run (39 ok, 0 fail, including "granted scope list saved" and
     calendar-unticked refusal with `ACTIVITY:READ,SETTINGS:WRITE`) / teardown (both users deleted, 0 events left).
   - Unverified: the address sends the commas encoded (`%2C`); that Intervals.icu reads it and shows three permissions
     needs a real sign-in. Deploy: `intervals-oauth` only for this change (no client change).

---

## 4. Docs debt from this session (not written)
- `ENGINE-STATE.md`: the calendar sync (Solid, with the verification above); the two learner fixes.
- `DECISIONS-LOG`: calendar sync design (15-day window source, single destination per sport, delete+create on Garmin,
  no FK); threshold HR = TrainingPeaks 20/60 rule replaces fastest-20 HR; threshold pace = best 45 min.
- `CAPABILITY-MAP.md`: calendar-sync, intervals-connect-key, hr_curve / pace_curve['2700'].
- `STATE-SOURCES.md` OURS rows: 60 s queue delay; 10:00 UTC daily run; 80% heart-rate coverage per window.

## 5. Other facts found this session (context, not this job)
- Garmin sends one heart-rate sample per second; no beat-to-beat/HRV in the Activity API or the FIT importer.
- Garmin's own threshold (Firstbeat) is not available via its APIs (Health API user metrics = VO2 max, fitness age).
- Michael's current: learned threshold HR 162, learned threshold pace 8:41/mi (offered, not accepted; 8:51 accepted);
  Garmin reports LT 172 bpm / 8:28/mi (2026-09-02). He is comparing Efforts against TrainingPeaks going forward.
