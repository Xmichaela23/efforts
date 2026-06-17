# AREA — Ingestion & sync

> Reverse-documentation derived from code (read-only audit, 2026-06-16). Paths are relative to repo root unless absolute. Where a doc already captures intent (DECISIONS-LOG D-NNN, SPECs), this reconciles against it rather than re-deriving. "Trigger condition unclear from code" is used literally where reachability could not be determined.

## What this area does (plain-language overview)

This area gets workout data **into** the app from external providers and converts it into a canonical `workouts` row, then fans out the post-import pipeline. Activities arrive three ways: real-time **webhooks** (Strava push, Garmin push), **bulk historical import** at connect time, and **manual/phone/FIT** entry. Every device path converges on one orchestrator, `ingest-activity`, which normalizes provider shapes to `type ∈ {run,ride,swim,walk,strength}`, dedups (per-source unique index plus a swim-only cross-source merge gate), upserts to `workouts`, and triggers ~8 downstream systems (summary, facts, analysis, workload, adaptation, auto-attach, cache invalidation, athlete pipeline). A separate family of **sweeps / reassociation / auto-attach** functions re-links completed workouts to planned sessions and backfills derived state. Native iOS bridges (HealthKit, WatchConnectivity, BluetoothHR) are real but the HealthKit swim ingest path is built-but-dormant (0 HealthKit swims; Q-060).

## Features / flows

### Strava webhook (real-time create/update/delete)
- **What it does:** Receives Strava push events and mirrors activity changes into `workouts` via `ingest-activity`.
- **How it works:** `supabase/functions/strava-webhook/index.ts`. `Deno.serve` (L14): GET handles the subscription verification challenge; POST parses the event and dispatches `processStravaWebhook` inside `EdgeRuntime.waitUntil` (L46-48), returning `200 "OK"` immediately. `processStravaWebhook` (L61) switches on `aspect_type` → `handleActivityCreated`/`Updated`/`Deleted`. Reads tokens from `device_connections` (filtered `provider='strava'`, `provider_user_id=ownerId`), refreshes via local `refreshStravaAccessToken` (L385, **600s skew**). Fetches `GET /activities/{id}` + `/streams` (latlng,altitude,time,heartrate,cadence,watts,distance,velocity_smooth), upserts raw into `strava_activities` (on `user_id,strava_id`), then POSTs the enriched activity (activity+streams) to `ingest-activity` (L590-597). On create, runs `runPostImportAthletePipeline(userId,'strava-webhook-create')` (L214).
- **Inputs / outputs:** Reads `device_connections`. Writes `strava_activities` (upsert), delegates `workouts` write to `ingest-activity`. Delete path hard-deletes the `workouts` row by `user_id`+`strava_activity_id` (L679-695) and marks `strava_activities.deleted_at`.
- **Triggers:** Strava webhook GET (subscription validation) / POST (activity create/update/delete). Subscription registered app-wide by `strava-webhook-manager`.

### Strava subscription manager / token exchange / refresh
- **What it does:** `strava-webhook-manager` owns the single app-wide push subscription (`subscribe`/`unsubscribe`/`status`); `strava-token-exchange` turns an OAuth code into stored tokens; `strava-refresh` and `_shared/strava-access-token.ts` refresh access tokens.
- **How it works:** `strava-webhook-manager/index.ts`: POST-only, switches on `action`. `subscribe` lists existing subscriptions (`checkExistingWebhook`) and creates one if absent; `unsubscribe` **deliberately does NOT call Strava DELETE** (one subscription per app; deleting unregisters all users) — it only clears the local `webhook_id` (L126). `strava-token-exchange/index.ts`: POSTs `grant_type=authorization_code`, upserts `device_connections` on `user_id,provider`, then best-effort registers webhook + stores HR zones from `/athlete/zones` into `user_baselines.configured_hr_zones`. `_shared/strava-access-token.ts` `ensureStravaAccessToken` is the canonical refresher (**300s skew**, L36). `strava-refresh/index.ts` is a standalone refresher (**no skew check** — always refreshes when called).
- **Inputs / outputs:** Read/write `device_connections`, `user_baselines.configured_hr_zones`.
- **Triggers:** `strava-webhook-manager` from `Connections.tsx:428,643` (real-time-sync toggle) and `strava-token-exchange:101`. `strava-token-exchange` from `StravaCallback.tsx:36` (OAuth redirect). `strava-refresh` — **no in-repo caller found** (trigger condition unclear from code). `ensureStravaAccessToken` imported by `fetch-strava-route` (and mirrors `reingest-activity`).

### Garmin webhook (activities + activity details)
- **What it does:** Receives Garmin push payloads, stores raw into `garmin_activities`, fetches rich sample data from the Garmin API, routes swims to `swim-activity-details`, and mirrors into `workouts` via `ingest-activity`.
- **How it works:** `supabase/functions/garmin-webhook-activities/index.ts` (the live function; `config.toml` sets `verify_jwt=false`). `Deno.serve` (L3): non-POST → 405; **responds 200 OK before processing** (L16-18); branches `payload.activities` → `processActivities` (L182) vs `payload.activityDetails` → `processActivityDetails` (L288). `processActivities` resolves the app user via `user_connections` (`connection_data->>user_id = activity.userId`), upserts a summary `garmin_activities` row (on `garmin_activity_id`), calls `fetchActivityDetails` (7-day window, L60-63), pipes into `processActivityDetails`. `processActivityDetails` builds `allSensorData`/`gpsTrack`, computes power/HR/cadence rollups, optionally enriches Training-Effect/Running-Dynamics **only if `GARMIN_ENABLE_SINGLE_SUMMARY=true`** (L420-464), upserts an enriched row, routes swims, then POSTs to `ingest-activity` (L599-685).
- **Inputs / outputs:** Reads `user_connections`, `device_connections`, `users.preferences`. Writes `garmin_activities` (upsert). Calls `swim-activity-details`, `ingest-activity`.
- **Triggers:** Garmin push webhook (POST). Garmin's deferred activity-details push also lands here via the `activityDetails` branch. **Note:** `garmin-webhook-activity-details/` directory exists but is **empty (no index.ts)** — there is no separate details function; details processing is inside `garmin-webhook-activities`.

### `ingest-activity` — the dedup/upsert orchestrator
- **What it does:** Single convergence point for Strava/Garmin/HealthKit. Maps a provider activity → a `workouts` row, runs the swim cross-source merge gate, idempotently upserts, then fans out the post-import pipeline.
- **How it works:** `supabase/functions/ingest-activity/index.ts` (`@ts-nocheck`, 1735 lines). `mapStravaToWorkout` (L185) builds gps_track/sensor_data from streams and a server-computed `computed` JSONB (GAP via Minetti, splits, cadence). `mapGarminToWorkout` (L800, async) re-reads `garmin_activities` to enrich power/cadence/samples and reverse-geocodes a workout name (Nominatim, 1s rate-limit delay). `mapHealthKitToWorkout` (L1184) maps a native pool swim. `Deno.serve` (L1301): validates `{userId,provider,activity}`; selects mapper + `onConflict` (`user_id,{strava|garmin|healthkit}_activity_id`); **for swims calls `mergeSameSwimIfExists` first** (L1347); upserts; backfills scalar swim fields (L1392-1431); awaits `auto-attach-planned`, then fires summary/analysis/workload/adaptation/facts/cache-invalidate/analyzer/adapt-plan; milestone-gated post-import pipeline for Garmin (L1685-1708).
- **Inputs / outputs:** Reads `garmin_activities`, `gear`, `workouts`, `user_baselines`. Writes `workouts` (upsert + follow-up scalar updates + status columns).
- **Triggers:** POST from `strava-webhook`, `garmin-webhook-activities` (via swim-activity-details for swims), `reingest-activity`, HealthKit sync (`healthkit.syncSwimsFromHealthKit`), and `import-strava-history`.

### Historical / bulk import (Strava + Garmin)
- **What it does:** Backfills back-catalog at connect time.
- **How it works:** `import-strava-history/index.ts` (907 lines) loops Strava activities, skips already-present `strava_activity_id`, applies the **source-preference gate ported from the live webhook** (Q-066 resolution — skips a Strava copy only if Garmin already has that date+type), fetches detail+streams, and calls `ingest-activity`; runs `runPostImportAthletePipeline` unconditionally at the end (L894). `import-garmin-history/index.ts` (176 lines) chunks a date range into 24h UTC windows and hits Garmin's Wellness **backfill** endpoint per window (backfill triggers async webhook re-delivery — **writes no DB rows itself**; clamps days 1–180). `import-connect-history/index.ts` (153 lines) paginates the Garmin **Connect API** activity list and returns a 5-item sample per page — **persists nothing, no in-repo caller**.
- **Inputs / outputs:** import-strava-history writes via `ingest-activity`; reads `users.preferences`. import-garmin-history: no DB. import-connect-history: no DB.
- **Triggers:** `import-strava-history` from the Strava connect/import flow; `import-garmin-history` from `GarminPreview.tsx:202` (days:90); `import-connect-history` — **no caller found (trigger unclear from code; likely dead)**.

### Manual + phone + FIT entry
- **What it does:** Three non-device write paths that insert directly to `workouts`.
- **How it works:** `ingest-phone-workout/index.ts` ingests an in-app-tracked run/ride (service-role key + manual JWT `getUser`); plain `.insert()` (no upsert), `provider='phone'`, `provider_activity_id=session_id`, triggers `compute-workout-summary` (awaited). `save-imported-workout/index.ts` (`@ts-nocheck`) is the server-side mapper for FIT imports (anon key + forwarded auth → user RLS); plain `.insert()`, `mapImportToDb`, persists FIT HR zones to `user_baselines.configured_hr_zones` (service-role), triggers `compute-workout-summary` (fire-and-forget). `ManualSwimEntry` does a **direct client-side `workouts.insert()`** (`src/components/ManualSwimEntry.tsx:62`) and then invokes `recompute-workout` — it bypasses `ingest-activity` and its merge gate (D-174; reverse-order dup gap is Q-067).
- **Inputs / outputs:** Write `workouts`, `gear` (default-gear), `planned_workouts` (phone link), `user_baselines` (FIT zones).
- **Triggers:** `ingest-phone-workout` from `WorkoutExecutionContainer.tsx:315`; `save-imported-workout` from `AppLayout.tsx:957`; `ManualSwimEntry` from `LogFAB`.

### Post-import pipeline + sweeps + reassociation + auto-attach
- **What it does:** Warms learned fitness/memory/snapshot after import; re-links completed workouts to planned sessions; backfills workload/summaries.
- **How it works:** `_shared/post-import-athlete-pipeline.ts` sequentially awaits `learn-fitness-profile` → `autoCompleteGoalsFromWorkouts` → `recompute-athlete-memory` → `compute-snapshot` (all best-effort). `auto-attach-planned/index.ts` matches a completed workout to a planned one (four paths: explicit / sync-existing-link / strength-mobility / runs-rides-swims heuristic). `sweep-week/index.ts` pre-materializes planned rows then runs auto-attach + compute-summary per completed workout in a Mon–Sun window. `sweep-user-history/index.ts` recalculates workload per completed workout. `reassociate-workouts/index.ts` re-links logged workouts to a recreated plan's planned rows (exact date+type, dry_run default true). `enrich-history`/`reingest-activity`/`restore-gps-track` are backfill utilities.
- **Inputs / outputs:** Read/write `workouts.planned_id`, `planned_workouts.{completed_workout_id,workout_status}`, plus the derived caches via the functions they call.
- **Triggers:** post-import pipeline from `ingest-activity:1707` (Garmin milestone gate), `import-strava-history:894`, `strava-webhook:214`. auto-attach from `ingest-activity:1482`, `sweep-week:104`, `activate-plan:672`, and client explicit-attach. sweep-week from `AppContext.tsx:649` + `WorkoutCalendar.tsx:589`. sweep-user-history + reassociate from `WorkloadAdmin`. enrich-history/reingest-activity/restore-gps-track — **no in-repo callers (trigger unclear from code)**.

### Disconnect
- **What it does:** Removes a provider connection.
- **How it works:** `disconnect-connection/index.ts` deletes the `device_connections` row for `(user_id, provider)` (service-role). Strava disconnect uses it (`Connections.tsx:487`, with a fallback to misspelled `disconect-connection` then a direct client delete). **Garmin disconnect is done client-side directly against `user_connections`** (`Connections.tsx:840`), NOT via this function.
- **Triggers:** `Connections.tsx` disconnect buttons.

### Native bridges (HealthKit / Watch / BLE)
- **What it does:** iOS-native pipes for HealthKit swims, Apple Watch workout send, and live BLE HR.
- **How it works:** `src/services/healthkit.ts`, `watchConnectivity.ts`, `bluetoothHR.ts` are thin Capacitor `registerPlugin` bridges over **real** Swift plugins (`HealthKitPlugin.swift` uses `HKWorkoutBuilder`; `WatchConnectivityPlugin.swift` uses `WCSession`; `BluetoothHRPlugin.swift` implements CoreBluetooth). `healthkit.syncSwimsFromHealthKit` filters Swimming workouts and POSTs each through the injected `ingest(provider:'healthkit')` (relying on `mergeSameSwimIfExists` to avoid doubles).
- **Triggers:** `AppContext.tsx:220`, `Connections.tsx:121`, `AppleHealthSwimEnrichment.tsx`; `TodaysEffort.tsx:606`; `useBluetoothHR.ts`.

## Edge cases & conditional handling

**Strava webhook**
- **Empty verify-token disables validation** — GET `mode='subscribe'`: the token check is `if (expected && token !== expected)` (L25). If `STRAVA_WEBHOOK_VERIFY_TOKEN` is unset/empty, **any** subscription challenge is accepted.
- **Verify-token mismatch** → `403` (L25-28). Echoes `{hub.challenge}` on success.
- **GET without `mode='subscribe'`** falls through to `405` (L58). Trigger condition unclear from code (whether Strava sends such a GET).
- **Non-activity events ignored** — `object_type !== 'activity'` (e.g. athlete **deauthorize** events) skipped with a log, no handler (L66-69). **On Strava deauthorization no token/connection cleanup occurs.**
- **Unknown `aspect_type`** → default case logs, does nothing (L83-84).
- **No `device_connections` row for owner** → each handler returns early (L103,232,342).
- **Create: proactive refresh** if `expiresAt - now < 600` OR no token (L124-130); abort if still none.
- **Create: 401 on fetch** → refresh once + retry (L134-142).
- **Create: incomplete-processing retry** — GPS sport (run/ride/bike/walk/hike/swim) AND (`max_speed==null` OR no polyline) → retry after 10s then 20s, refreshing on a 401 inside the retry; proceeds with partial data if still incomplete (L150-173).
- **Create/Update: source-preference + swim-override skip (D-173)** — if `source_preference==='garmin'` OR (`swim_source_override==='garmin'` AND swim), look up a same-day same-`type` `workouts` row with non-null `garmin_activity_id`; **skip ingest entirely if found** (L180-204, L275-299). Existence-checked so a Strava-only activity is never lost.
- **Update: weaker refresh** — only refreshes on missing token (no near-expiry proactive check, unlike create) (L249-252), so a near-expiry token can 401 once before the reactive retry. **No post-import pipeline on update** (intentional, L323).
- **Delete** → hard-delete the `workouts` row (L679-695).
- **Dead path:** `updateWorkoutFromStravaActivity` (L610-677) is defined but never called (update path uses `createWorkoutFromStravaActivity`).

**Garmin webhook**
- **Ping / registration / deauth payloads** — there is NO explicit ping or deauthorize handling; a body with neither `activities` nor `activityDetails` hits the "No activities…" no-op branch (L25-27). **No Garmin deauthorize-webhook handler exists anywhere.**
- **No matching `user_connections`** → skip (L194,329); connection found but `user_id` null → skip (L198,333).
- **Source-preference skip (D-173)** duplicated in `processActivities` (L210-218) and `processActivityDetails` (L345-353): skip Garmin when `source_preference==='strava'` **unless** `swim_source_override==='garmin'` AND type contains "swim".
- **Token resolution** — 3-tier fallback (`user_connections.access_token` → `connection_data.access_token` → `device_connections`), appearing twice (L44-54, L426-444); no token → returns null.
- **`summaryId` normalization** strips trailing `-detail` (L109-112).
- **`garmin_activities` re-creation** — the detail-path upsert is explicitly "ensure a row exists even if it was deleted" (L466-489); upsert failure is non-fatal (warn only).
- **Swim routing** (L493-505): `routeAsSwim` if type contains "swim" OR `numberOfActiveLengths>0` OR `poolLengthInMeters>0` → POST to `swim-activity-details` and `continue`. If swim function non-OK and `STRICT_SWIM_DELEGATION=true` → skip ingest (L529-532); else **inline swim reconstruction fallback** integrates distance from speed and computes per-length crossing times, last resort equal-time partition (L533-592).
- **Single-summary enrichment** gated behind `GARMIN_ENABLE_SINGLE_SUMMARY=true`; tries 6 candidate URLs (L157-179); else `single_summary_status='disabled'`.
- **TE field reuse:** `total_training_effect` is set to the **aerobic** value (L651) — flag, may be intentional.

**ingest-activity — dedup / merge gate (the load-bearing path)**
- **Per-source upsert** keyed on `user_id,{strava|garmin|healthkit}_activity_id` (L1324-1332). This dedups **within** a source only.
- **Swim cross-source merge gate** `mergeSameSwimIfExists` (L1221-1299), runs only for `type==='swim'` BEFORE the upsert (L1347): Candidate set 1 = same-type swims within **±60s timestamp** with a **different source** and **±10% distance** (L1230-1234,1251). Candidate set 2 (D-184) = a same-`date` `source:'manual'` swim (manual entries store a **noon-UTC placeholder timestamp** the ±60s window can never catch), matched on date+±10% distance, skipped when the incoming row is itself manual (L1243-1248). On a manual match: **keep the manual row** (preserves user-captured RPE/feel/pool/equipment), upgrade provenance to the device source, adopt device-truth fields (timestamp/distance/moving/elapsed/HR), stamp the provider id (idempotent re-import) (L1261-1280). On a cross-device match: the HealthKit side fills pool_length/lengths/strokes where the kept row lacks them (L1281-1289). Recomputes summary+facts after merge (L1293-1296). Merge failure is non-fatal → falls through to normal upsert (L1356-1358).
- **`mergeSameSwimIfExists` 60s-window residual** (SPEC-swim-source-tiers §103-108, Q-060): Strava rounds starts to integer minutes while Garmin has seconds, so the same swim's starts can differ >60s → merge can miss → double. Widening to date+distance+duration is the Q-060-area fix.
- **NON-SWIM cross-source duplication (Q-066/Q-067)** — `mergeSameSwimIfExists` is swim-gated; **runs/rides have NO cross-source merge at all**. They dedup only on same-provider `onConflict`, which cannot catch a Strava-vs-Garmin duplicate. The bulk-import preference gate (now ported into `import-strava-history`, Q-066 resolved) is the only protection for runs/rides; webhook-vs-webhook duplicates of runs/rides rely entirely on the source-preference skip.
- **Explicit Strava date re-update** after upsert (L1368-1378) because "upsert might not update date on conflict".
- **Scalar swim backfill** (L1392-1431): re-reads the upserted row and fills distance/moving/duration/pool/lengths from provider summary if the mapper left them null (with `deriveSwimMovingSeconds` fallback for swims).
- **Auto-set default gear** (L1444-1466): completed run/ride with no gear_id → looks up `gear` where `is_default=true, retired=false` and sets it. **Duplicated** in `ingest-phone-workout:249-271`.
- **Provider routing synonyms removed** — the analyzer dispatch (L1604-1620) accepts only canonical `run`/`ride`/`strength`/`swim`; the old `cycling`/`bike` synonyms were stripped (comment L1612-1614; reconciled with CYCLING-INGEST-AUDIT).
- **adapt-plan auto** fires unless `ADAPT_PLAN_AUTO_ON_INGEST` is `0`/`false` (L1657-1680). Idempotent because activity ingest doesn't mutate plan JSON (CLAUDE.md topology note).
- **Post-import pipeline milestone gate (Garmin-only)** (L1685-1708): completed-workout count `n`; runs if `(milestone && n<=10)` where milestone = `n ∈ {1,2,5,10}`, OR (`n>10` AND (identity inferred >7 days ago OR never inferred)). **Strava ingest never triggers it here** (provider asymmetry; Strava warms via webhook/history-import instead).

**Garmin mapping edge cases (ingest-activity)**
- `deriveSwimMovingSeconds` (L62-121): 5-tier fallback for swim moving time (explicit moving/timer → distance÷avg-speed → non-uniform lengths sum → distance×avg-pace → pool heuristic ×0.85 → overall duration). Explicitly rejects "essentially uniform" length durations (`max-min ≤ 1`, ≥3 lengths) as our own equal-time reconstruction, not real Garmin data (L89).
- `garminLocalDateAndTimestamp` (L163): builds local YYYY-MM-DD from localized epoch without reapplying timezone; multiple fallbacks.
- `pool_length` inference from distance÷lengths when neither explicit nor in summary (L1019-1022).
- Workout-name generation reverse-geocodes (Nominatim, 1s delay, L127); on failure falls back to the friendly sport label.
- Strava run/walk **cadence doubling** when peak < 120 (half-cadence correction) (L365-367).

**Manual / phone / FIT**
- **No dedup on either save path** — `ingest-phone-workout:237` and `save-imported-workout:139` both plain-`insert` (no `onConflict`, no pre-check); a retry/re-import can create a duplicate row unless a DB constraint catches it (none referenced).
- `ingest-phone-workout`: floors duration/moving/elapsed to **min 1 minute** (a sub-30s workout → 1 min, L209-211); `moving_time` hard-set = `elapsed_time` ("assume all moving"); `avg_speed` set only for ride with positive distance+duration; **no request-body validation** (missing `samples`/`gps_track` would throw at `.length`/`.map`).
- `save-imported-workout`: only required field is `date`; FIT HR-zone precedence **only overwrites if no existing source OR existing source is `fit_file`** (won't overwrite a strava-sourced zone config, L159-161); Friel 5-zone boundaries from LTHR (0.85/0.90/0.95/1.05, L171-180).
- `ManualSwimEntry` reverse-order dup (Q-067): device swim exists → user logs same swim by hand → second row, no merge (filed not-fixed by decision).

**auto-attach-planned (matching gate — exhaustive)**
- `sportSubtype` normalization (L8-26): null/empty/unknown type → **defaults to `run`** (an unrecognized type is matched against planned runs).
- Four mutually-exclusive paths in order: **A explicit** (`planned_id` passed), **B sync-existing-link** (workout already has `planned_id` — returns before any heuristic, so a linked workout is never re-matched), **C strength/mobility** (date+type only), **D runs/rides/swims heuristic**.
- **Date window is exact YYYY-MM-DD only** — no ±tolerance in any path (`.eq('date', day)`, L380-386).
- Path C: 0 candidates → `no_candidates`; **>1 candidates → refuses** `ambiguous_candidates` (no duration disambiguation for strength); exactly 1 → attach with a 1000ms commit sleep before materialize.
- Path D duration band: header comment says "85-115%" (L499) but the actual gate is **`0.50 ≤ ratio ≤ 1.50`** (L584) → `duration_out_of_range` outside it (comment/code drift).
- Path D ambiguity gate: only when `candidates.length>1` AND `secondBestScore` finite; if `secondBestScore − bestScore < 0.06` → refuses (L588-605). A single candidate skips this gate (attaches if in band); a clear winner (delta ≥ 0.06) attaches even with multiple candidates.
- Scoring (L545-579): `score = min(secPct,1) + 0.5·min(distPct,1)` (duration primary, distance secondary; distance contributes 0 if unavailable).
- `moving_time` unit heuristic (L501-502): `<1000` treated as minutes (×60), `≥1000` as seconds.
- `ensureTotals` (L515-543) materializes the planned row once if it has no usable seconds/meters, then re-reads.
- **Candidate pre-fetch uses normalized sport against the raw `type` column** (`.eq('type', finalSport)`, L385) — planned rows stored with a non-canonical `type` are excluded before the normalize-aware re-filter runs.
- Analysis-preservation guard (paths A/B only): only nulls `workout_analysis` if it isn't already a complete new-format analysis (L203-219). Strength/mobility (C) clears intervals but leaves analysis fields.
- Stale-reverse-link hardening (path A, L143-162) resets other planned rows pointing at this workout to `planned/null`.
- Swim-context column-name inconsistency: explicit path writes `plan_label` (L238); heuristic path writes `plan_pool_label` (L643).

**Sweeps + reassociation**
- `sweep-week`: selects `type IN (run,ride,swim,walk)` completed in window (`limit(1000)`); pre-materializes planned rows **capped at first 200** (L93); batches auto-attach + compute-summary (MAX=4); all sub-calls wrapped in empty `try/catch` (failures invisible, only success counters increment); empty-set path returns `{processed:0}` while the main path returns `{attached,computed}` (response-shape inconsistency); per-session client guard `backfilledWeeks` prevents repeat fires per visible week.
- `sweep-user-history`: row filter (L73-77) selects a workout if `workload_actual` is null OR `===1` (broken sentinel) OR `avg_heart_rate>0` → **every completed HR workout is reprocessed every run** (not skip-if-correct); **unpaginated** full-history fetch + per-workout HTTP fan-out (timeout risk on large histories); `skipped` counter is declared but never incremented (always 0).
- `reassociate-workouts`: **exact `date|type` match, no duration check, raw type equality** (no `sportSubtype` — would miss `cycling` vs `ride`); multiple candidates → first whose name substring-matches, else `candidates[0]`; **one-directional** — sets `workouts.planned_id` only, never `planned_workouts.completed_workout_id`/`workout_status` (reverse link left stale); **dry_run defaults true** (writing requires explicit `dry_run:false`); 24-week fallback window when `race_date` absent.
- `enrich-history`: Garmin activity-details backfill last N days in 24h slices, upsert into `garmin_activities` (no caller — trigger unclear).
- `reingest-activity`: re-fetches a single **Strava** activity + streams, refreshes token if <300s to expiry, re-pushes through `ingest-activity` (re-fires the WHOLE fan-out including auto-attach and post-import pipeline). Resolves by `workout_id` or `date`+optional `type`; the `date` path 404s on 0 matches and 400s on >1. No caller — trigger unclear.
- `restore-gps-track`: decodes the stored polyline into `gps_track` with **synthetic per-index timestamps** (`workoutTimestamp + index` seconds, not real GPS times, L141). No caller — trigger unclear.

**Identity inference (athlete-identity-inference.ts)**
- Operates on a 90-day `workouts.type` window only (never a `discipline` column). `normType` collapses ride/bike/cycling/virtualride→ride, etc.
- `discipline_identity` first-match chain (L241-255): runner/cyclist/triathlete/multi_sport/strength_athlete — because it's `if/else if`, the `multi_sport` (≥2 disciplines ≥0.12) branch precedes `strength_athlete` (strP≥0.35), so a strength+run mix never reaches `strength_athlete`.
- `current_phase` (L284-355): post-goal-race window → recovery/post_race (highest priority); else 7d-vs-prior-7d volume ratio buckets; post-key-race override (race-named run last 2 days); taper hint (race-named effort last 3 days).
- **`durMin` naming bug** (L124): `minutes()/60` yields **hours**, but the variable and the duration thresholds are labeled minutes. Numerically the bands roughly work as hours; only reached when distance is null.

**Cross-sport key scrub (cross-sport-key-scrub.ts)**
- `runOnlyKeyScrub` nulls exactly **six** top-level run-only `workout_analysis` keys (`mile_by_mile_terrain`, `score_explanation`, `summary`, `classified_type`, `heart_rate_summary`, `recomputed_at`) so a non-run analyzer's spread-merge scrubs stale run analysis. Keys are **nulled, not deleted**; the scrub spread must come before real cycling fields (ordering dependency, asserted by the test). **One-directional** — cycling-only keys bleeding onto a re-analyzed run are NOT yet scrubbed (documented follow-up).

**canonicalize.ts**
- `canonicalize` (L119): empty → `'unknown'`; dictionary hit → canonical key; miss → slugify (non-alphanumeric → underscore). Unknown exercises get a stable-ish key but `muscleGroup` → `'other'`. `bigFourLift` is `@deprecated` (superseded by `bigAnchorLift`).

**Native bridges**
- All three guard on `Capacitor.isNativePlatform() && ios`; off-iOS they no-op to `false`/`null`/`[]`.
- `bluetoothHR.ts` header claims a **Web Bluetooth fallback** (L5) that **does not exist** — non-iOS calls fail gracefully to empty/disconnected, not to Web BLE.
- HealthKit enum duplicate raw value 50 (`Yoga` and `TraditionalStrengthTraining`) — `TraditionalStrengthTraining` is effectively shadowed; `mapWorkoutTypeToHealthKit` maps strength → `FunctionalStrengthTraining` (20) anyway.

## Redundancies / duplication (observed, not judged)

- **Strava token refresh implemented three times** with diverging skew windows, all POSTing `grant_type=refresh_token` and persisting the same `device_connections` shape: `strava-webhook/index.ts:385` (**600s**), `_shared/strava-access-token.ts` (**300s**, canonical), `strava-refresh` (**no skew**). `strava-webhook` does not import the shared helper.
- **Refresh-token read fallback differs:** webhook + `_shared` read `connection_data.refresh_token || top-level`; `strava-refresh` reads **only** `connection_data.refresh_token` (a connection with only the top-level column would fail there but succeed elsewhere).
- **Source→type mapping duplicated** across `mapStravaToWorkout`, `mapGarminToWorkout`, the three sport-map blocks in `strava-webhook`, and `GarminDataService.detectSport` / `StravaDataService.groupActivitiesBySport`. Cadence-doubling (<120 → ×2) appears in both `strava-webhook` and `ingest-activity`.
- **Source-preference + user-lookup skip block** duplicated verbatim between Garmin's `processActivities` and `processActivityDetails`, and between Strava's `handleActivityCreated` and `handleActivityUpdated`.
- **Auto-default-gear block** duplicated verbatim between `ingest-activity:1443-1464` and `ingest-phone-workout:249-271`.
- **`merge_computed {intervals:[], planned_steps_light:null}` RPC + the summary/analysis trigger block** copy-pasted across all four `auto-attach-planned` paths.
- **Three independent date+type matchers** with different rules: `auto-attach-planned` (normalized sport, duration band, score-based ambiguity, bidirectional link), `reassociate-workouts` (raw type, no duration, name-substring tie-break, one-directional), `sweep-week` (re-implements the candidate window query, delegates the match).
- **Repeated planned-materialization checks** in `sweep-week:88-92`, `auto-attach-planned` `ensureTotals`, and the explicit-path step check — each independently decides "is this materialized" and calls `materialize-plan`.
- **`compute-workout-summary` triggered three ways** — `supabase.functions.invoke` awaited (ingest-phone-workout), raw `fetch` fire-and-forget (save-imported-workout), and again in ingest-activity.
- **Two Garmin history importers** with overlapping intent and different APIs (`import-garmin-history` = Wellness backfill, wired; `import-connect-history` = Connect API, unreferenced).
- **`garmin_activities` upsert happens in both Garmin webhook paths**, then `ingest-activity` re-reads + re-maps the same row.
- **`GarminDataService` reads three inconsistent column vocabularies** for `garmin_activities` across `fetchRecentActivities`, `analyzeActivitiesFromDatabase`, `convertDetailedDataToActivities` — and several columns the webhook never writes (`normalized_power`, `tss`, `ftp`, `hrv`, `avg_pace`…) resolve to undefined.

## Discrepancies & flags (for human review)

- **Strava deauthorize is a no-op** — `strava-webhook:66` ignores `object_type='athlete'` events, so on deauthorization no token/connection cleanup happens. No Garmin deauthorize handler exists either.
- **Empty `STRAVA_WEBHOOK_VERIFY_TOKEN` disables subscription validation** (`strava-webhook:25`) — any challenge is accepted.
- **`disconnect-connection` is effectively Strava-only despite its generic `provider` param** — it deletes `device_connections`, but Garmin tokens live in `user_connections` and Garmin disconnect is done client-side (`Connections.tsx:840`). A Garmin "disconnect" via this function would delete the wrong table.
- **Non-swim cross-source duplication remains (Q-066/Q-067)** — runs/rides have no cross-source merge; only the (now-ported) preference gate protects bulk import, and webhook-vs-webhook relies on the preference skip. Confirmed by the existing Q-066 entry (resolved for bulk import) and Q-067 (reverse-order manual, filed not-fixed).
- **auto-attach duration-band comment contradicts code** — header "85-115%" vs actual gate `[0.50, 1.50]` (`auto-attach-planned:499` vs `:584`).
- **auto-attach defaults unknown/empty workout type to `run`** (`:13,:25`) — an unrecognized type can attach to a run plan.
- **auto-attach candidate pre-fetch uses normalized sport against raw `type` column** (`:385`) — planned rows stored non-canonically are excluded before normalization helps.
- **auto-attach swim-context column name inconsistency** — `plan_label` (explicit path `:238`) vs `plan_pool_label` (heuristic path `:643`); one is likely wrong vs schema.
- **`reassociate-workouts` leaves the reverse link unsynced** — sets `workouts.planned_id` only, so `planned_workouts.completed_workout_id`/`workout_status` and the `get-week` reverse linkage can be stale after a reassociate; and its raw type equality misses `cycling`↔`ride`.
- **`sweep-user-history` reprocesses every HR workout every run** (filter `avg_heart_rate>0`), is unpaginated, and `skipped` is a dead counter — timeout risk on large histories.
- **Post-import pipeline is Garmin-only at the ingest call site** (`ingest-activity:1685`) — Strava ingest never milestone-triggers it (provider asymmetry in snapshot/memory warm-up cadence).
- **`sweep-attach-history/` directory is empty (no index.ts)** — the function named in the work order does not exist; no callers anywhere.
- **`garmin-webhook-activity-details/` directory is empty (no index.ts)** — no separate details function; details processing lives in `garmin-webhook-activities`.
- **`garmin-webhook-activities-working.ts`** (functions/ root) is a **dead, syntactically-incomplete snippet** (its only unique content is a `getTotalAscentOfficial` helper using a Connect-API `summaryDTO` shape not used by live code) — never deployed (not a directory-based function).
- **No-caller functions (reachability unclear from code):** `strava-refresh`, `restore-gps-track`, `enrich-history`, `reingest-activity`, `import-connect-history`. Reachable only by direct HTTP / ops invocation.
- **Dead code:** `updateWorkoutFromStravaActivity` (`strava-webhook`); `findBest5KFromBestEfforts`, `findFastest5KWithSimpleMethods`, `classifyRunningPerformance` (`StravaDataService`); `import-garmin-history` no-op ternary (`:53`) + unused `garminUserId` param (`:37`).
- **`StravaPreview.tsx:36` calls `analyzeActivitiesForBaselines` with 2 of 3 required args** — works only because the missing `accessToken` is unused on the live path.
- **`GarminDataService` precedence bug** (`:496-497`): `summary.startTimeLocal || summary.startTimeInSeconds ? new Date(...) : ''` — `||` binds before `?:`, so the ISO conversion runs whenever `startTimeInSeconds` is truthy regardless of `startTimeLocal`. Also: **hardcoded anon JWT + project URL inlined four times** in the service.
- **`restore-gps-track` writes synthetic per-index timestamps** as GPS times (`:141`) — approximate, not real.
- **Garmin `total_training_effect` set to the aerobic value** (`garmin-webhook-activities:651`) — may be intentional normalization.
- **`bluetoothHR.ts` header claims a Web Bluetooth fallback that the code does not implement** (`:5`).
- **`mergeSameSwimIfExists` 60s-window residual** (SPEC-swim-source-tiers §108, Q-060) — Strava minute-rounded vs Garmin second-precision starts can exceed 60s and miss the merge → double swim.
- **`@ts-nocheck`** on `ingest-activity`, `sweep-week`, `auto-attach-planned`, `reingest-activity`, `save-imported-workout`, `garmin-webhook-activities`, `ingest-phone-workout` — type errors surface only at runtime (consistent with CLAUDE.md).
- **`ingest-phone-workout` "async, don't wait" comment (`:290`) contradicts the awaited call (`:292`)** — minor drift.

## Cross-references

- **D-157** — HealthKit swim integration: dedup-first gate + native plugin + on-device merge (`mergeSameSwimIfExists`).
- **D-161** — derive HealthKit swim length-count from distance ÷ pool length (`mapHealthKitToWorkout:1192-1194`).
- **D-162 / D-171 / D-174** — swim post-workout popup + manual swim entry (the user-captured fields the D-184 merge preserves).
- **D-173** — Garmin per-discipline swim override; the webhook skip logic (`strava-webhook:180-204`, `garmin-webhook-activities:210-218`).
- **D-184** — dedup auto-imported swims against same-day MANUAL entries (the second candidate path in `mergeSameSwimIfExists`).
- **D-182** — swim pace + HR single-sourced to the raw-column scalar (`resolveSwimScalars`); reconciles the "compute-facts vs computed.overall" footgun for swims downstream of ingest.
- **D-034 / D-035** — `is_mixed_effort` + unlinked-workout null adherence; relevant to what the analyzers do AFTER ingest attaches (or fails to attach) a planned workout. See `UNLINKED-WORKOUT-INTERPRETATION-SPEC.md`.
- **Q-060** — HealthKit native swim enrichment deferred; the 60s-merge residual and the FORM→Apple pipe.
- **Q-066** — historical Strava import ignored source preference (RESOLVED — gate ported into `import-strava-history`); documents that **runs/rides have no cross-source merge**.
- **Q-067** — reverse-order manual swim bypasses the dedup gate (filed, not-fixed by decision).
- **SPEC-swim-source-tiers.md** — the source→tier model, the three-layer "richest data wins" (matrix informs / preference chooses / merge protects), and the load-bearing merge footgun.
- **CYCLING-INGEST-AUDIT.md** — the five-layer cycling ingest flow + FTP resolution; confirms the routing-synonym cleanup reflected at `ingest-activity:1612-1614`.
- **Other audit areas:** `02-analyzers.md` (what `analyze-{sport}-workout` does with the ingested row), `03-spine-snapshot.md` (`compute-snapshot` warmed by the post-import pipeline), `05-compute-contracts.md` (`compute-facts`/`compute-workout-summary` triggered by the fan-out), `07-baselines.md` (`learn-fitness-profile` + `athlete_identity` written by identity inference).
