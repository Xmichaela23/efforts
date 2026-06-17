# AREA — Cross-cutting

> Read-only reverse-documentation. Describes what the code does, not what it should do.
> "Discrepancies & flags" lists suspected issues for human review only — nothing here was
> acted on. Citations are `file:line` relative to repo root unless noted. Where a trigger
> or reachability could not be determined from code, it is marked "unclear from code".

## What this area does (plain-language overview)

This area covers the concerns that span the whole app rather than belonging to one discipline or screen: **how callers are authenticated** (JWT decoding, Strava OAuth token refresh, service-role vs. user-role clients), **what caches exist and what invalidates them** (`coach_cache`, `block_adaptation_cache`, `weather_cache`, per-workout `weather_data`), the **post-workout feedback popup** (the RPE/feel/gear/pool prompt) and the separate **post-race feedback chain** (a race result flowing back into learned fitness), the **coach / AI-context** subsystem (the deterministic week-context engine plus the LLM narrative layer, the Arc aggregator, and the several `generate-*-context` functions), the **goals lifecycle** (create → materialize → complete/auto-complete → delete → projections), the **weather** subsystem (two independent Open-Meteo archive flows), and a tail of **admin/ops & misc edge functions** (Garmin OAuth/proxy/export, course detail/strategy/upload, admin signup email, location save, readiness, plus several empty/retired stubs). The unifying theme is that almost none of these are owned by a single discipline; they are the connective tissue and the shared infrastructure.

## Features / flows

### Auth / JWT verification
- **What it does:** Establishes the caller's identity for edge functions. Two distinct styles coexist: (a) decode the JWT `sub` claim locally without a network round-trip (`_shared/bearer-auth.ts`), and (b) verify the JWT via `supabase.auth.getUser(jwt)` against the auth server.
- **How it works:** `authenticatedSubFromBearer(req)` (`_shared/bearer-auth.ts:6-33`) reads the `Authorization`/`authorization` header, strips `Bearer `, base64url-decodes the payload segment, and returns `sub` only when `role==='authenticated'` OR `aud==='authenticated'`, AND not anon, AND `sub` matches a UUID regex (`bearer-auth.ts:26-28`). It does NOT verify the signature — it trusts that Supabase's gateway (`verify_jwt`) already did. Callers: `create-goal-and-materialize-plan`, `delete-goal`, `fetch-strava-route`. The other style (`supabase.auth.getUser`) appears in `check-feedback-needed`, `dismiss-feedback`, `refresh-goal-race-projections`, `bright-service`, `course-*`, `save-location`, `readiness`, and most others.
- **Service-role vs. user-role:** Webhooks and most compute functions instantiate a service-role client (`SUPABASE_SERVICE_ROLE_KEY`) and bypass RLS; user-facing reads use the caller JWT. Several functions create a service-role client AND separately verify the caller's JWT to scope writes by token-derived `user_id` (e.g. `bright-service:3-6,46`; `save-location:15-18`; `readiness:48-58`; `course-upload`/`course-detail`/`course-strategy`). `coach/index.ts` deliberately holds BOTH a user client and a service client because the `coach_cache` upsert needs service-role INSERT under RLS (`coach/index.ts:1153-1158`).
- **Inputs / outputs:** Reads the bearer token; outputs a `user_id` string or null/401. No DB writes.
- **Triggers:** Every authenticated edge-function request.

### Strava access-token refresh
- **What it does:** Returns a usable Strava access token for a user, transparently refreshing via OAuth when stale.
- **How it works:** `ensureStravaAccessToken(supabase, userId)` (`_shared/strava-access-token.ts:11-95`) reads `device_connections` (provider='strava'), reads token + expiry from either the top-level columns or the `connection_data` JSON, treats the token as stale if missing or expiring within 300s (`strava-access-token.ts:35-36`), and on staleness POSTs `grant_type=refresh_token` to `https://www.strava.com/oauth/token`, then persists the new tokens to both the columns and `connection_data` (`:77-92`). Only known caller: `fetch-strava-route` (group-ride route snapshot).
- **Inputs / outputs:** Reads/writes `device_connections`; returns `{ok, accessToken}` or `{ok:false, error}`. Never throws.
- **Triggers:** A Strava-route fetch needing the user's token.

### Caching & invalidation
- **What it does:** Maintains and invalidates derived caches so State/coach/adaptation recompute when training truth changes.
- **How it works:** `invalidateUserTrainingCache(supabase, userId, logPrefix)` (`_shared/invalidate-user-training-cache.ts:7-25`) does two things: hard-DELETEs all `block_adaptation_cache` rows for the user, and UPDATEs `coach_cache` setting `invalidated_at = now()` (does NOT delete the coach row). Both steps are individually try/caught and only `console.error` on failure. Callers (verified by grep): `ingest-activity/index.ts:1600`, `generate-combined-plan`, `recompute-workout`, `delete-plan`, `create-goal-and-materialize-plan/index.ts:2075`. `complete-race/index.ts:222` and `delete-goal` invalidate `coach_cache` separately.
  - **`coach_cache`** — one row per user, keyed `user_id` only (`coach/index.ts:5136` `onConflict:'user_id'`; read at `1161-1165`). Served from cache only if `payload` present AND not `skip_cache` AND all three staleness gates pass: age ≤24h, `invalidated_at` null, and `payload.coach_payload_version >= COACH_PAYLOAD_VERSION` (=45, `index.ts:94`). Written via service-role upsert with `invalidated_at:null` (`5132-5142`), non-fatal on failure.
  - **`block_adaptation_cache`** — server cache for block-adaptation aggregates, populated/read by `getBlockAdaptation` (used by `generate-overall-context`), wiped wholesale on invalidation.
  - **`weather_cache`** — geo+hour+duration-bucketed Open-Meteo cache (see Weather).
  - **`workouts.weather_data`** — per-workout persisted weather blob.
  - **`course_strategy_debug` / `race_research_cache` / `course_segments`** — course-strategy observability + materialized strategy (see Course flows).
- **Inputs / outputs:** Reads/writes the cache tables above.
- **Triggers:** Ingest, plan generation, goal create/delete, plan delete, workout recompute, race completion.

### Feedback popup (post-workout RPE/feel/gear/pool)
- **What it does:** After a completed run/ride/swim with no RPE, prompts the athlete for RPE, feeling, gear, and (for swims, D-162) pool length + equipment confirmation.
- **How it works:** "Smart server, dumb client." `check-feedback-needed` (service-role; `supabase.auth.getUser` auth) queries the single most recent `workouts` row that is `workout_status='completed'`, `type IN (run,ride,swim)`, `rpe IS NULL`, `feedback_dismissed_at IS NULL`, within the last 7 days, newest first (`check-feedback-needed/index.ts` query). Returns `{needs_feedback, workout:{id,type,name,existing_gear_id,existing_rpe}}`. The client (`AppLayout.tsx:407-458`) calls it on app load, on home navigation (500 ms delay, `:471-476`), and via a realtime subscription on new workouts (`:577+`). A per-session `feedbackShownIdsRef` Set prevents re-showing the same workout twice in one session (`AppLayout.tsx:194,429,444`). `dismiss-feedback` sets `workouts.feedback_dismissed_at = now()` scoped by `id`+`user_id`. The popup itself is `PostWorkoutFeedback.tsx`: it writes `rpe`, `feeling`, `gear_id`, and for swims `pool_length(_m)`, `pool_unit`, `number_of_active_lengths`, and equipment confirmations into `workout_metadata` — directly via the client supabase table update (`PostWorkoutFeedback.tsx:355-359`), not an edge function.
- **Inputs / outputs:** Reads `workouts` (+ linked `planned_workouts.computed` for swim equipment, `PostWorkoutFeedback.tsx:200-239`); writes `workouts.{rpe,feeling,gear_id,pool_length,pool_length_m,pool_unit,number_of_active_lengths,workout_metadata,feedback_dismissed_at}`.
- **Triggers:** App load, home nav, realtime new-workout event, selecting a completed workout (`AppLayout.tsx:481-566`).

### Post-race feedback chain (race result → learned fitness)
- **What it does:** When a goal race finishes, nudges `learned_fitness.run_threshold_pace_sec_per_km` from the race result and re-runs memory + fitness-profile learning. Distinct from the popup above — same word "feedback", different system.
- **How it works:** `runPostRaceFeedbackChain` (`_shared/race-feedback.ts:162-302`), invoked from `analyze-running-workout/index.ts:2884`. Idempotency marker `{goal_id, finish_seconds}` written to `workouts.workout_analysis.post_race_feedback` (`race-feedback.ts:75-87`); ±1s drift tolerated (`:84`). Step 1: Riegel-projected threshold pace (`riegel.ts`) compared to existing learned value; updates only if it diverges >5% or no prior exists (`PACE_DIVERGENCE_THRESHOLD=0.05`, `:23,136`), clamped to 150–720 sec/km sanity bounds (`:26-27,109-111`), marked `source:'race_result', confidence:'high'`. Steps 2–3: fire-and-forget POST to `recompute-athlete-memory` and `learn-fitness-profile` with the service-role key in the Authorization header (`invokeFunctionBestEffort`, `:306-338`). Best-effort throughout — errors collected in `result.errors`, never thrown.
- **Inputs / outputs:** Reads/writes `user_baselines.learned_fitness`; writes the idempotency marker into `workout_analysis`; invokes two sibling functions.
- **Triggers:** Running-analyzer run for a marathon-distance goal-race workout.

### Coach (deterministic week engine + LLM narrative)
- **What it does:** Produces the weekly training-context payload (load, ACWR, key sessions, training_state, verdict, readiness, narrative) consumed by the State/coach surfaces.
- **How it works:** `coach/index.ts` (`Deno.serve` at `:1134`). Resolves `asOfDate` from the request timezone, checks `coach_cache` (above), and on a miss loads `getArcContext()` (`:1186`) as the single athlete-truth source plus `planned_workouts`/`workouts` windows, then computes the deterministic payload and layers an LLM narrative. **Two narrative generators tried in order:** Path A (`index.ts:3198-3583`) builds an `AthleteSnapshot` and calls `generateCoaching` (`_shared/athlete-snapshot/coaching.ts:382-437`) which uses a hardcoded model `claude-sonnet-4-20250514` via `callLLM`, with a single validator-retry then soft-accept and a deterministic `fallbackCoaching` (raw "X of Y sessions") on null. Path B (legacy, `index.ts:3585-4528`) runs only when Path A yields nothing, assembling a large `narrativeFacts[]` array and calling Anthropic via raw `fetch` with hardcoded `claude-sonnet-4-5-20250929`. `COACH_PAYLOAD_VERSION=45`.
- **Inputs / outputs:** Reads (via Arc + directly) `coach_cache`, `user_baselines`, `goals`, `plans`, `planned_workouts`, `workouts`, `athlete_snapshot`, `athlete_memory`, `readiness_checkins`, `gear`. Writes `coach_cache` only.
- **Triggers:** Client `useCoachWeekContext.ts:483` (`invoke('coach', {user_id, date, timezone, skip_cache})`); `skip_cache:true` only on explicit refresh.

### Arc context aggregator
- **What it does:** Single read-aggregator that assembles the "Arc" — identity, learned fitness, disciplines, equipment, performance numbers, effort paces, goals + race courses, plan summary, latest snapshot, `cycling_fitness`, memory, swim-from-workouts, gear, run pace-for-coach, longitudinal signals, readiness.
- **How it works:** `getArcContext()` (`_shared/arc-context.ts`, ~1028 lines; return at `~1134-1159`). One `Promise.all` of ~11 fail-soft queries (each `.error` is warned and the field degrades, e.g. `877-879`). No LLM, no `coach_cache` read/write — it is purely a read aggregator. `cycling_fitness` form band: `tsb>=5→fresh`, `tsb<=-10→fatigued`, else neutral (`~1006`). Run pace exposes both `per_km` and `per_mile` with a literal `_unit_note` (`~91,412`) to stop LLM mislabeling (paces stored sec/km). Thin wrapper `get-arc-context/index.ts` (service-role, `verify_jwt=false`) just calls it for inline UI.
- **Inputs / outputs:** Reads many user tables; returns the Arc object. No writes.
- **Triggers:** `coach`, `course-detail`, `course-strategy`, `generate-training-context`, `create-goal-and-materialize-plan`, `get-arc-context`, and others.

### generate-*-context functions
- **generate-overall-context** — block-state analysis, explicitly NO LLM (`index.ts:6-9`); service-role; reads active plan + planned/completed workouts + baselines + memory; returns `block_state_v1` plus legacy duplicate fields. Trigger: `useOverallContext.ts:80`.
- **generate-training-context** — large (~3404 lines), deterministic, NO LLM, NO coach_cache; computes ACWR/timeline/readiness; fire-and-forget invokes `recompute-athlete-memory` and (when no current snapshot) `compute-snapshot`. Trigger: no client invoker found in `src/` (unclear from code; possibly server-only or stale).
- **generate-daily-context** — directory exists but is EMPTY (no `index.ts`). No such function.
- **build-coaching-context** (`_shared/build-coaching-context.ts`) — assembles an analyzer-prompt text block but is NEVER imported (only a comment reference in `compute-snapshot:160`). Dead code.

### Goals lifecycle
- **create-goal-and-materialize-plan** — the wrapper that creates/links/builds an event goal, routes to one of three generators (`generate-combined-plan` / `generate-triathlon-plan` / `generate-run-plan`), links + activates the plan, retires competitors, recomputes projections, busts caches. Three modes: `create`/`build_existing`/`link_existing`. Auth via `authenticatedSubFromBearer` (excludes anon). Body `user_id` must equal token `sub` or throws (`:171-173`). **All errors return HTTP 200** with a `{success:false,error_code,http_status}` body (`:3027-3037`). See goals agent map for the full feasibility/marathon/replace edge-case list.
- **delete-goal** — cascade-deletes a goal, tears down linked plans via `delete-plan`, conditionally rebuilds the season plan (combined if ≥2 future siblings, standalone if 1, none if 0). Idempotent on already-gone goal (`:213-220`). Fresh-start cleanup (deletes `race_courses`, nulls `athlete_identity`, deletes `athlete_memory`) when zero active event goals remain (`:362-376`).
- **complete-race** — records official race time, marks goal completed, ends the plan (`executeEndPlan`, end_reason `race_completed`), snapshots the pre-race projection BEFORE invalidating `coach_cache`, recomputes remaining projections. Accepts already-completed/ended states (not idempotent).
- **auto-complete-goals-from-workouts** (`_shared`) — marks past active event goals completed when a matching completed workout exists on the target date; backfills `target_time` only when currently null. Tri = sum of run+ride+swim legs; single discipline = max finish. Then recomputes projections.
- **extract-races** — LLM (`claude-sonnet-4-6`) + web search to parse `{name,distance,date,priority}` from free text. Stateless. Defaults: distance `70.3`, name `Race`, priority everything-but-B → `A`.
- **refresh-goal-race-projections** — thin wrapper over `recomputeRaceProjectionsForUser` (`_shared/recompute-goal-race-projections.ts`), the single projection writer for `goals.projection`. Math model in `_shared/race-projections.ts` (70.3-first split model). Goal-race narrative detection in `_shared/goal-race-completion.ts` (run) and `_shared/cycling-goal-race-completion.ts` (tri bike).

### Weather
- **Flow A (per-workout):** `get-weather/index.ts` fetches Open-Meteo **archive** (no API key) for a workout's lat/lng/time, two-tier cached (`weather_cache` by geo-hour-duration bucket + per-workout `workouts.weather_data`), with device-temperature override from `workouts.avg_temperature`. `WEATHER_SCHEMA_VERSION=4`. Callers: `analyze-running-workout/index.ts:247` (server, persists) and `useWeather.ts` (client; `EffortsViewerMapbox` gates it off when a stored blob exists). Client merge SSOT `src/lib/sessionWeather.ts` (precedence: stored blob > live fetch > device avg).
- **Flow B (race-course):** `_shared/fetch-race-weather-archive.ts` fetches Open-Meteo archive for the race date at the course start point, assuming start≈07:00/finish≈noon local (hardcoded hour indices). Only caller: `course-strategy/index.ts:690`; writes `race_courses.{start_temp_f,finish_temp_f,humidity_pct,conditions}`, non-fatal.
- **Reconciliation:** `resolveRaceDebriefWeather` (`_shared/race-debrief.ts:222`) merges both flows for the race-debrief LLM (precedence: activity `weather_data` > device avg > course snapshot).

### Admin / ops & misc edge functions
- **bright-service** — Garmin OAuth2 PKCE token exchange (generic name, real/load-bearing). Service-role + own JWT check; derives userId from token. Writes `user_connections`. Logs partial token prefixes.
- **swift-task** — Garmin Connect read-only proxy; whitelisted endpoints; trusts a `token` query param (token-in-URL); no per-user ownership check of its own.
- **send-workout-to-garmin** — converts a planned workout to Garmin's schema and pushes + schedules it. Service-role only; trusts client-supplied `userId` (scoped by `.eq('user_id', userId)`). Imports from the `src/` tree (`../../../src/lib/resolve-current-ftp.ts`).
- **course-upload / course-strategy / course-detail** — GPX parse + persist; LLM (`sonnet`/`claude-sonnet-4-6`) pacing strategy with retry + `course_strategy_debug` writes; dumb-client course payload (no writes). All: service-role + own JWT check + ownership enforcement.
- **notify-admin-signup** — Resend email on `users` INSERT DB webhook; `verify_jwt=false` + `x-notify-secret` shared-secret. No DB.
- **save-location** — upserts `user_locations`; no in-repo caller found (likely native/iOS).
- **readiness** — read-only `readiness_v1` snapshot; `verify_jwt=false` with strict self-auth (token user must equal body `user_id`); no in-repo caller found.
- **fetch-strava-route** — group-ride route snapshot from a Strava URL; `authenticatedSubFromBearer` + `ensureStravaAccessToken`.
- **Empty/retired stubs:** `run-migration`, `test-db-connection`, `Garmin-Workout-Export`, `analyze-weekly-ai`, `analyze-workout-ai`, `activity-details` (empty, never had content); `analyze-workout` (deliberately emptied retired orchestrator, per CLAUDE.md); `generate-daily-context` (empty).

## Edge cases & conditional handling

Auth:
- `authenticatedSubFromBearer` returns null on: missing/short header, non-3-segment token, base64 decode failure, role/aud not authenticated, anon token, non-UUID `sub` (`bearer-auth.ts:10-32`). Signature is NOT verified — relies on the gateway.
- `delete-goal`'s copy of `authenticatedSubFromBearer` does NOT exclude anon tokens, unlike `create-goal`'s version which adds the `!isAnon` exclusion (`create-goal-and-materialize-plan/index.ts:148-150` vs the delete-goal copy). Divergent copies of the same helper.
- `create-goal` throws `user_id_mismatch` when body `user_id` ≠ token `sub` (`:171-173`); other functions silently scope by token only.
- `bright-service`, `send-workout-to-garmin`, `swift-task` are service-role; `send-workout-to-garmin` and `swift-task` trust client-supplied identity (userId / Garmin token) without an independent ownership cross-check beyond the data query filter.

Strava token:
- Stale = no token OR expiring within 300s (`strava-access-token.ts:35-36`). Missing refresh token → `{ok:false}` "reconnect" (`:40-42`). Missing client id/secret env → `{ok:false}` (`:46-48`). Refresh non-ok → warns + `{ok:false}` (`:60-64`). New refresh token falls back to old if absent (`:74`).

Caching / invalidation:
- `coach_cache` invalidation is an UPDATE (`invalidated_at=now()`), NOT a delete (`invalidate-user-training-cache.ts:18-21`); the stale payload row physically remains. The coach read honors `invalidated_at` (`coach/index.ts:1170`), but other consumers read `coach_cache.payload` directly WITHOUT checking `invalidated_at`: `course-detail:212`, `course-strategy:309`, `resolve-server-predicted-finish.ts:92`, `goal-race-completion.ts:67`. These can serve stale projections post-invalidation until coach recomputes.
- `coach_cache` is keyed by `user_id` only; the request `date`/`asOfDate` is not part of the key (`coach/index.ts:1161-1165,5136`). A payload computed for one focus date can be served for a different requested date while ≤24h old, not invalidated, version-current.
- Both invalidation steps are independently try/caught and only log on failure — a failed delete/update does not abort the caller (`invalidate-user-training-cache.ts:13-24`).
- `generate-overall-context` filters planned workouts by `training_plan_id = activePlanId || 'no-plan'` (`index.ts:104`) — with no active plan this matches zero rows via a sentinel rather than skipping the filter.

Weather:
- `get-weather` cache hit requires non-expired `expires_at` AND `schema_version===4` (`index.ts:115-119`); `force_refresh` deletes the shared cache row (`:134-139`). Cache write expiry is computed as **15 minutes** despite a "30-minute TTL" comment (`index.ts:184-189`).
- Device-temp override: a finite `workouts.avg_temperature` overrides all Open-Meteo temps (humidity/wind still from API) (`get-weather/index.ts:339-345`) — opposite precedence to `sessionWeather.ts` (blob wins), but different layers.
- `analyze-running-workout` only fetches weather when `start_position_lat && start_position_long && date` are truthy (`:220`) — lat/lng of exactly 0 (`&&` on a falsy 0) would skip the fetch.
- Both flows use the **archive** endpoint only; there is no forecast provider. `TodaysEffort.tsx` fetches "today" from the archive (typically unavailable) at hardcoded local-noon with no `workout_id` (never persists) — likely a silently-empty feature.
- Flow B hardcodes hour indices start=7/finish=12/condition=9 and TZ default `America/Los_Angeles` (env `RACE_WEATHER_TIMEZONE` override) — mislabels non-07:00 or non-Pacific races.
- Only running is weather-aware; cycling analyzer explicitly omits weather (`analyze-cycling-workout:204-208`); swim/strength have none.

Feedback popup:
- `check-feedback-needed` returns only the single newest qualifying workout (7-day window, `rpe IS NULL`, `feedback_dismissed_at IS NULL`). A workout that already has RPE, or was dismissed, or is >7 days old, never surfaces.
- Per-session `feedbackShownIdsRef` suppresses re-showing within a session but is UI-only (server dismissal is authoritative).
- Swim path reads linked `planned_workouts.computed` for per-step required AND session-level suggested/optional equipment (`PostWorkoutFeedback.tsx:213-239`); falls back to a static multi-select when nothing prescribed (`:678-708`). Pool prefill cascades completed → planned (`:188-212`).
- `PostWorkoutFeedback.handleSave` only writes when `updateData` is non-empty (`:355`); a save with nothing selected is a no-op (no toast).

Post-race chain:
- Idempotent on identical `{goal_id, finish_seconds}` within ±1s (`race-feedback.ts:84,193-196`); a different finish (re-import/edit) re-fires.
- Pace update skipped when within 5% of existing learned value (`:136`), and clamped to 150–720 sec/km (`:109-111`). All sibling invocations best-effort; failures collected, never thrown.

Goals (highlights — full list in the goals agent map):
- `complete-race` accepts plan status in active/paused/completed/ended and goal status active/paused/cancelled/completed (`:68,85`) — re-completing overwrites `race_result` and re-ends the plan; not re-entrant-guarded.
- `ADAPTIVE_MARATHON_DECISIONS_ENABLED` (default ON) makes the hard `weeksOut < floor` marathon-feasibility reject at `create-goal...:2726` unreachable (the guard requires the flag OFF) — the `race_too_close_personalized` path is effectively dead under default config.
- `create-goal` returns HTTP 200 for ALL outcomes including 401/409 (`:3036`); `invokeFunction` preserves downstream status into the body but the outer catch flattens to 200.
- `auto-complete-goals-from-workouts` flips status regardless of `target_time`, but only backfills `target_time` when currently null.

Coach LLM degradation:
- `callLLM`/`callClaudeConversation` (`_shared/llm.ts`) never throw — return null on missing `ANTHROPIC_API_KEY` (`:57-61`), non-ok HTTP (`:91-96`), or exception (`:106-110`).
- Missing API key: Path A's narrative gate is skipped, leaving the deterministic default; Path B is also key-gated, so `week_narrative` stays null and the response still returns.
- Path A LLM null/fail → `fallbackCoaching` deterministic line (`coaching.ts:432-434`) which emits raw "X of Y" counts that the Path-B prompt elsewhere forbids (`index.ts:4445`).

## Redundancies / duplication (observed, not judged)

- **`authenticatedSubFromBearer` copied** into `create-goal-and-materialize-plan` and `delete-goal` with a divergence: the create-goal copy excludes anon tokens; the delete-goal copy does not.
- **Two narrative generators** in coach (Path A snapshot `coaching.ts`, Path B legacy `index.ts:3585-4528`) — different models, prompts, fact assembly.
- **Three distinct Sonnet model ids** for the same product surface, defeating the `MODELS` alias indirection: alias `claude-sonnet-4-6` (`llm.ts:36`, unused by coach), `claude-sonnet-4-20250514` (`coaching.ts:408`), `claude-sonnet-4-5-20250929` (`index.ts:4509`). `course-strategy` and `extract-races` use the alias path (`claude-sonnet-4-6`).
- **Two independent weather archive-fetch implementations** with divergent param spelling (`relative_humidity_2m` vs `relativehumidity_2m`) and index logic (`get-weather` vs `fetch-race-weather-archive.ts`); no shared code.
- **Two cache layers inside `get-weather`** (shared `weather_cache` + per-workout `weather_data`) — intentional, both gated on `schema_version`.
- **Race-finish-seconds logic in ≥3 places** with differing unit assumptions: `goal-finish-from-workouts.finishSecondsFromRow` treats `moving_time`/`elapsed_time` as minutes×60 (`:31-39`); `complete-race` uses `actualFinishSecondsPreferElapsed` (separate module); both "prefer elapsed."
- **`goal-race-completion.ts` (run) and `cycling-goal-race-completion.ts` (tri bike)** are parallel, non-shared implementations with duplicated distance/date helpers.
- **`recomputeRaceProjectionsForUser` reads `user_baselines` twice** (identity/learned/perf, then effort_paces alone) — two round-trips for one row.
- **`generate-overall-context` returns both `block_state_v1` and legacy duplicate** text/structured fields.
- **`getMethodology`'s `|| RunPerformanceBuildMethodology` fallback** (`registry.ts:13`) is unreachable given the full record.
- **`coach/` reschedule factory** maps both `performance/balanced` and `sustainable` plan branches to the same `PerformancePlanRescheduleEngine` (the sustainable engine is a TODO, `reschedule-factory.ts:29-35`).

## Discrepancies & flags (for human review)

1. **Coach cache served across dates.** `coach_cache` is keyed by `user_id` only; the request date is ignored for keying (`coach/index.ts:1161-1165,5136`). A cached payload built for date X can be served for a different requested date if <24h old / not invalidated / version-current. Intent not documented in code.
2. **Invalidation never deletes the coach row, and several consumers ignore `invalidated_at`.** `course-detail:212`, `course-strategy:309`, `resolve-server-predicted-finish.ts:92`, `goal-race-completion.ts:67` read `coach_cache.payload` directly without the staleness check the coach read enforces — stale projections can be served post-invalidation until coach recomputes.
3. **Coach payload-version floors out of sync.** Server `COACH_PAYLOAD_VERSION=45` (`coach/index.ts:94`) vs client `COACH_CLIENT_MIN_PAYLOAD_VERSION=35` (`src/lib/coach-contract.ts:5`), despite an in-sync comment (`index.ts:86`).
4. **Weather TTL mismatch.** `get-weather` comment says "30-minute TTL" but expiry is 15 minutes (`index.ts:184-189`).
5. **`globalThis.__wx_cache_key` global round-trip** in `get-weather` (`index.ts:131,186`) stashes an in-scope value on `globalThis` and re-reads it — pointless indirection, theoretically race-prone across concurrent requests on a warm isolate.
6. **`TodaysEffort` weather likely always empty** — queries the archive endpoint for the current day (archive lags) at hardcoded local-noon with no `workout_id` (never persists). Comment claims "only fetch for today."
7. **Adaptive-marathon flag inverts the feasibility reject** (`create-goal...:2726`): under default ON, an under-spaced marathon proceeds with a clamped/shortened plan rather than being refused; the `race_too_close_personalized` path is dead under default config.
8. **`complete-race` is not idempotent / re-entrant-guarded** — re-invoking on an already-completed goal/plan overwrites `race_result`, re-ends the plan, and re-recomputes (`complete-race/index.ts:68,85`).
9. **`create-goal-and-materialize-plan` returns HTTP 200 for every outcome** including auth (401) and collision (409) — clients must read the body, not the status (`:3036`).
10. **Auto-complete time-unit assumption.** `goal-finish-from-workouts.ts:31` treats `workouts.moving_time`/`elapsed_time` as minutes; `complete-race` reads the same columns through a different module. If the two modules disagree on the unit contract, auto-completed `target_time` and explicit race `current_value` could differ in scale. Worth verifying the `workouts.elapsed_time` unit.
11. **`build-coaching-context.ts` is dead** — defined, never imported (only a comment in `compute-snapshot:160`). Its documented analyzer-prompt-injection role is not wired up.
12. **`generate-daily-context/` is empty** (no function) and **`generate-training-context` has no client invoker** found in `src/` (unclear from code whether server-only or stale).
13. **Token-leakage shapes (factual, not assessed):** `swift-task` passes the Garmin token in the URL query string (lands in logs/history); `bright-service` logs partial token prefixes extensively.
14. **`send-workout-to-garmin` trusts client-supplied `userId`** with service-role and imports from the app `src/` tree (`../../../src/lib/resolve-current-ftp.ts`) — an edge function reaching into client code.
15. **Cycling tri goal-race completion writes nothing** — `cycling-goal-race-completion.ts` only returns a narrative match; a completed 70.3 bike leg does not auto-complete the tri goal via this path (auto-completion relies on the leg-summing run path).
16. **`course-strategy` writes `course_strategy_debug` on every run** (`:601,618,639,707`) — unbounded growth risk; `course-detail` ships a `_debug_terrain` block to the client.
17. **Empty/retired edge-function directories** present in the tree: `run-migration`, `test-db-connection`, `Garmin-Workout-Export`, `analyze-weekly-ai`, `analyze-workout-ai`, `activity-details`, `generate-daily-context`, and `analyze-workout` (intentionally emptied). No in-repo callers. (No arbitrary-SQL `run-migration` function actually exists — the dir is empty, contrary to its name.)
18. **`save-location` and `readiness` edge functions have no in-repo callers** found — possibly invoked by the native/iOS layer; reachability unclear from code.

## Cross-references

- `docs/FEEDBACK-LOOP-WORKORDER.md` — the analyze→snapshot→Arc→planner loop closure work order. Phase 0 (D-032) + Phase 1 run pace (D-033) SHIPPED; Phases 2–4 PAUSED. The "feedback loop" there is the planner-adaptation loop, distinct from both the popup and the post-race chain documented here. Work Order 2 §"Source-of-truth consistency" anticipates the cache-staleness discrepancies (#1–#3 above).
- `CLAUDE.md` Topology — ingest fan-out (`ingest-activity/index.ts:~1430-1580`) is the registration point for cache invalidation; the four storage layers; coach as deterministic engine + LLM; the pace-unit footgun (Arc `_unit_note`); "smart server, dumb client" (the feedback popup is an instance).
- `docs/DECISIONS-LOG.md` — D-082 (`llm.ts` debug instrumentation hook), D-162 (swim post-workout feedback), D-191 (shared reasoning-core scaffold in coach narrative), D-028 (within-phase rep ramps, referenced by the cycling feedback phase).
- `docs/GOALS_SYSTEM_BLUEPRINT.md`, `docs/PRODUCT-POSITIONING.md`, `docs/ENGINE-STATE.md`, `docs/MAINTENANCE-DEBT.md` — to reconcile the goals lifecycle and dead-stub inventory against documented intent.
- Other audit areas: ingestion (01) owns the webhooks/import/`ingest-activity` that *call* `invalidateUserTrainingCache`; analyzers (02) own `analyze-running-workout` which *calls* the post-race chain + weather fetch; spine/snapshot (03) owns `compute-snapshot`/`athlete_snapshot` that Arc reads; planning (04) owns the generators the goals wrapper routes to; compute/contracts (05) owns `workout-detail`/`session_detail_v1`; baselines (07) owns `user_baselines.learned_fitness` written by the post-race chain.

---

### Coverage note (honesty)
Cross-cutting infrastructure (auth, Strava token, cache invalidation, both feedback systems, coach/Arc/generate-context, goals lifecycle, weather, admin/ops) is mapped with file:line. The goals lifecycle, coach subsystem, and weather subsystem were mapped in depth via dedicated read-only sub-audits; their full edge-case lists exceed what is reproduced here. Edge functions believed owned by areas 1–7 (and so NOT detailed here): ingestion/sync — `strava-webhook`, `strava-webhook-manager`, `strava-refresh`, `strava-token-exchange`, `garmin-webhook-activities`, `garmin-webhook-activity-details`, `swim-activity-details`, `ingest-activity`, `ingest-phone-workout`, `reingest-activity`, `import-strava-history`, `import-garmin-history`, `import-connect-history`, `enrich-history`, `save-imported-workout`, `process-workouts-batch`, `reassociate-workouts`, `sweep-user-history`, `sweep-attach-history`, `sweep-week`, `auto-attach-planned`, `detach-planned`, `disconnect-connection`, `restore-gps-track`; analyzers (02) — `analyze-running-workout`, `analyze-cycling-workout`, `analyze-strength-workout`, `analyze-swim-workout`, `analyze-user-profile`, `bulk-reanalyze-workouts`, `recompute-workout`, `compute-workout-analysis`; spine/snapshot (03) — `compute-snapshot`, `recompute-athlete-memory`, `learn-fitness-profile`, `compute-adaptation-metrics`, `backfill-adaptation-metrics`, `backfill-week-summaries`, `backfill-facts`, `backfill-power-curves`; planning (04) — `generate-combined-plan`, `generate-triathlon-plan`, `generate-run-plan`, `generate-plan`, `materialize-plan`, `activate-plan`, `pause-plan`, `resume-plan`, `end-plan`, `delete-plan`, `adapt-plan`, `ensure-planned-ready`, `validate-reschedule`, `planning-context`, `arc-setup-chat`; compute/contracts (05) — `compute-facts`, `compute-workout-summary`, `workout-detail`, `get-week`, `calculate-workload`, `weekly-workload`, `batch-recalculate-workloads`, `backfill-planned-workload`. **Cross-cutting (this doc):** `bearer-auth`, `strava-access-token`, `invalidate-user-training-cache`, `check-feedback-needed`, `dismiss-feedback`, `race-feedback`, `coach`, `get-arc-context`, `generate-overall-context`, `generate-training-context`, `arc-context`, `create-goal-and-materialize-plan`, `delete-goal`, `complete-race`, `extract-races`, `refresh-goal-race-projections`, `get-weather`, `fetch-race-weather-archive`, `fetch-strava-route`, `bright-service`, `swift-task`, `send-workout-to-garmin`, `course-detail`, `course-strategy`, `course-upload`, `save-location`, `readiness`, `notify-admin-signup`. **UNMAPPED / empty stubs (no content):** `run-migration`, `test-db-connection`, `Garmin-Workout-Export`, `analyze-weekly-ai`, `analyze-workout-ai`, `activity-details`, `generate-daily-context`, `analyze-workout` (retired). **`shared/`** is a misc dir (not the `_shared/` lib) — not separately inspected; flag for whoever owns it. Every non-empty edge function in `supabase/functions/` is plausibly attributed to an area above; no reachable function was left unattributed.
