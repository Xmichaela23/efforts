# Work order — the plumbing: a queue with retries, an alarm, "failed" on screen, connection health (2026-09-07)

Why now (both happened tonight): the ride analyser died on every ride from 2026-09-01 to 2026-09-07 and the
only sign was `analysis_status = 'analyzing'` on rows nobody reads; Supabase's gateway was unreachable for
six minutes mid-copy and nothing retried. FOUNDATION-READINESS S3 (no queue), B4 (no monitoring), B7 (failure
illegible), B3 (dead connection looks alive). This closes all four. Every commercial app has these; none
advertise them.

Today's chain: `strava-webhook` / `garmin-webhook-activities` → `ingest-activity` → fire-and-forget `fetch`
to `recompute-workout` (which runs summary → analysis → workload → adaptation → facts → snapshot in one
request), plus `adapt-plan` and `auto-attach-planned`, all `.catch(console.error)`.

## 1. A job queue

Migration (Michael pastes): table `jobs` — `id bigserial`, `kind text` (`recompute-workout` | `adapt-plan` |
`auto-attach-planned` | anything later), `payload jsonb`, `user_id uuid`, `workout_id uuid null`,
`status text` (`queued` | `running` | `done` | `failed`), `attempts int default 0`, `max_attempts int default 3`,
`next_run_at timestamptz default now()`, `last_error text`, `started_at`, `finished_at`, `created_at`.
Index on `(status, next_run_at)`. RLS on; owner-select only (a screen may show its own jobs); writes are the
service role. A SQL function `claim_jobs(n int)` that takes up to n due `queued` rows with
`FOR UPDATE SKIP LOCKED`, sets them `running`, `attempts + 1`, `started_at`, and returns them.

Edge function `run-jobs` (verify_jwt off, secret in the path like the Garmin webhooks, `JOBS_SECRET`): claims
up to 5, runs each by calling its target function with the service key and the payload, waits for the
reply; 2xx → `done`; anything else or a throw → if `attempts < max_attempts`, back to `queued` with
`next_run_at = now() + (1, 5, 25 minutes by attempt)` and `last_error`; else `failed` + alarm (§2). Replies in
under the gateway limit: process sequentially, stop claiming after ~40 s, the next tick takes the rest.

Enqueue instead of fire-and-forget: `ingest-activity` inserts jobs for `recompute-workout`, `adapt-plan`,
`auto-attach-planned` in that order (the recompute job carries the workout id). Keep the athlete-tapped
Recompute synchronous — it already returns its result. `recompute-workout` itself: each step failure throws
with the step name so the job's `last_error` says which step.

Scheduler: `pg_cron` + `pg_net` calling `run-jobs` every minute (migration text for `cron.schedule` with
the function URL and secret from vault; Michael enables the two extensions in the dashboard — write the
exact steps). If the project's plan has no pg_cron, say so and fall back to a GitHub Actions cron hitting
the URL every minute (`.github/workflows/run-jobs.yml`, secret in repo settings).

## 2. An alarm

`_shared/alarm.ts`: `raise(kind, summary, detail)` → one email through Resend (the key already exists as a
function secret; sender `NOTIFY_FROM_EMAIL`, recipient new secret `ALARM_TO_EMAIL`, Michael's address) AND a
row in a new `alarms` table (kind, summary, detail jsonb, at). Rate-limited: at most one email per `kind`
per 15 minutes; the rest only land in the table. Called from `run-jobs` on final failure, from the two
webhooks when they 5xx, and from a `withAlarm(fn)` wrapper that the analysers and `recompute-workout`
wrap their handler in (report, then rethrow). Subject line: `efforts: <kind> — <summary>`. Body: who, which
workout, the step, the error text, a link to the Supabase function logs.

## 3. "Failed" on screen

- `run-jobs` final failure on a recompute job writes `analysis_status = 'failed'`, `analysis_error =
  <step>: <short reason>` on the workout.
- Any `analysis_status = 'analyzing'` older than 10 minutes reads as `stalled` on the client.
- Workout Performance tab (src/components/SessionNarrative.tsx / MobileSummary.tsx): a line in the card where
  "Recompute failed…" already prints: "Analysis failed at <step>: <reason>." or "Analysis did not finish."
  with a bordered pill "Try again" that calls `recompute-workout` (the existing tap). Plain words, no codes.
- Home week: a completed session whose analysis failed shows a small dot on its chip; the screen says why
  when opened. Nothing hidden, nothing blocking.

## 4. Connection health

Migration: `user_connections` and `device_connections` get `health text default 'ok'` (`ok` | `needs_reauth` |
`error`), `last_error text`, `last_ok_at timestamptz`. Writers: wherever the app calls Garmin or Strava with a
stored token (`swift-task`, `import-garmin-history`, `send-workout-to-garmin`, `strava-webhook`'s fetch,
`import-strava-history`, the token refresh) — a 401/403 from the provider sets `needs_reauth` + `last_error`;
any 2xx sets `ok` + `last_ok_at`; other failures set `error`. Connections screen: a `needs_reauth` row reads
"Reconnect ›" (bordered pill, right chevron, it leaves the screen into the provider flow) instead of
"Connected"; Home shows one line under Today, "Garmin needs reconnecting ›", only while it is so.

## 5. Verify, then ship

Throwaway account, real functions:
1. Enqueue a recompute job with a bad workout id → three attempts at 0 / 1 / 5 min (shorten the backoff
   through an env override for the test, say so), then `failed`, `last_error` set, one alarm email sent
   (report Resend's reply id), one `alarms` row; the workout row (if any) shows `analysis_status = 'failed'`.
2. Enqueue a good recompute → `done`; the workout's analysis is fresh.
3. Two jobs of the same kind failing inside 15 minutes → one email, two `alarms` rows.
4. Force a provider 401 (fake token on the throwaway's connection row) → `needs_reauth`; the Connections
   screen on the web shows "Reconnect ›"; Home shows the line. Reconnect path clears it.
5. Web walk of a failed workout: the card shows the failed line and "Try again", and the tap enqueues.
Tear the throwaway down. Deno tests: claim/backoff arithmetic, the rate limit, the health writer. Lint and
types clean. Deploy every touched function, push, `npm run ios`. FOUNDATION-READINESS: S3, B3, B4, B7 closed
with the date. Report: migrations to paste (in order), dashboard steps (extensions, secrets), functions
deployed, the alarm email's arrival, what was not device-checked.

---

## Status — 2026-09-07, terminal stopped on Michael's word before deploy

Everything below is ON DISK ONLY: nothing committed, nothing pushed, nothing deployed, no migration pasted, no
secret set, `npm run ios` not run, none of the five checks run. `git status` shows the full set.

### Finished (written and checked, not deployed)
- **Migrations, paste in this order:** `supabase/migrations/20260907070000_jobs_alarms_analysis_stamp.sql`
  (jobs + `claim_jobs(n)` + alarms + `workouts.analysis_updated_at` with its trigger), `20260907080000_connection_health.sql`
  (`health` / `last_error` / `last_ok_at` on both connection tables), `20260907090000_run_jobs_cron.sql` (pg_cron + pg_net +
  Vault secret `jobs_secret` + the every-minute schedule; `<JOBS_SECRET>` is a placeholder that must equal the
  `JOBS_SECRET` function secret — neither exists yet; generate one value, set it with `supabase secrets set JOBS_SECRET=…`,
  and substitute it into the paste). The CLI's login cannot run SQL from this terminal, so the paste stays with Michael.
- **§1 queue:** `_shared/jobs.ts` (backoff 1/5/25 min, 3 attempts, `enqueueJob`, 5 tests), `run-jobs/index.ts` (path secret,
  claims 5, sequential, 40 s budget, 90 s per job, kind allowlist, final failure → `failed` + alarm + `analysis_status='failed'`
  on a recompute job), `supabase/config.toml` `[functions.run-jobs] verify_jwt = false`. `ingest-activity` enqueues
  `recompute-workout` then `adapt-plan` through `enqueueOrCall` (falls back to the old direct call if the insert fails, so
  deploying before the paste is safe). No separate `auto-attach-planned` job: `recompute-workout` runs auto-attach as its
  step 0, and the `fnUrl` at the old fire-and-forget site was never called (code trace, not the work order's list).
  `recompute-workout` keeps every failed step as `<step>: <reason>` and answers 500 with the first one (summary / facts still
  halt; the rest continue degraded); the athlete's tap reads the same words.
- **§2 alarm:** `_shared/alarm.ts` — `raise()` (row in `alarms` + Resend email, one per kind per 15 min, `ALARM_TO_EMAIL` →
  `ADMIN_NOTIFY_EMAIL` → michael@efforts.work), `withAlarm()` wraps the four analysers, `compute-workout-analysis`,
  `recompute-workout`; `strava-webhook` and `garmin-webhook-activities` call `raise()` on their 500; `run-jobs` on final
  failure. 5 tests. Subject `efforts: <kind> — <summary>`; body: who, workout, step, error, logs link.
- **§3 failed on screen:** `get-week` + `workout-detail` return `analysis_status` / `analysis_error` / `analysis_updated_at`
  (both retry without the new column while the migration is unpasted — PostgREST 42703). `src/lib/analysis-state.ts`
  (6 tests): "Analysis failed at <step>: <reason>." / "Analysis did not finish." (analyzing or pending older than 10 min, or
  unstamped). `SessionNarrative.tsx` + `StrengthPerformanceSummary.tsx`: the line + bordered "Try again" (the existing
  recompute tap, synchronous — §1's rule; §5 check 5 says "the tap enqueues", that reading was NOT built). `MobileSummary.tsx`
  turns a 500 from the tap into the same words. Amber dot after the ✓ on the Home row (`TodaysEffort.tsx`) and on the week
  chip (`WorkoutCalendar.tsx`).
- **§4 connection health:** `_shared/connection-health.ts` (4 tests). Writers: `strava-webhook` (fetch + refresh),
  `garmin-webhook-activities` (activityDetails fetch), `send-workout-to-garmin` (push + refresh), `import-strava-history`
  (list), `import-garmin-history` + `swift-task` (athlete from the caller's JWT), `_shared/strava-access-token.ts` (refresh).
  A Strava/Garmin 400 `invalid_grant` on refresh reads as 401. Reset to `ok` on connect in `bright-service` and
  `strava-token-exchange`. `Connections.tsx`: "Reconnect ›" chip (GalaxyButton) instead of "Connected" on `needs_reauth`,
  tapping starts the provider flow. `TodaysEffort.tsx`: "Garmin needs reconnecting ›" under Today, tap → /connections.
- **Checks that ran:** deno tests 20/20 (jobs, alarm, connection-health, analysis-state); `tsc` no new errors in `src/`;
  eslint on the touched components 257 findings before and after (none new); `deno check` on every touched function: no
  error on a touched line (the pre-existing ones remain); `npm run build` exit 0 — but a `git stash`/`pop` ran during that
  build, so run it again before trusting it.
- **Docs:** FOUNDATION-READINESS rows S3, B3, B4, B7 marked CLOSED 2026-09-07 — that describes the code on disk, not
  production; STATE-SOURCES has four OURS rows (backoff, 15-min window, 10-min stall, worker budget); CAPABILITY-MAP rows;
  POLISH-PUNCH-LIST "AWAITING MICHAEL 2026-09-07" block.
- `scripts/_plumbing-verify-2026-09-07.mjs` — the five checks as `setup | t1 | t2 | t3 | t4 | t5 | check5 | teardown | all`,
  syntax-checked, NEVER RUN. Needs `JOBS_SECRET_FILE` and, for t1/t3, the `JOBS_BACKOFF_SECONDS=2,2,2` function secret
  (unset after). Check 4's "reconnect clears it" cannot be driven from a script (needs a real OAuth code); check 5's web walk
  is a browser step after `t5`.

### Not done
1. Secrets: `JOBS_SECRET`, `ALARM_TO_EMAIL` (Michael's address), the temporary `JOBS_BACKOFF_SECONDS`.
2. Deploy (after the secrets): `run-jobs ingest-activity recompute-workout analyze-cycling-workout analyze-running-workout
   analyze-strength-workout analyze-swim-workout compute-workout-analysis strava-webhook garmin-webhook-activities
   send-workout-to-garmin import-strava-history import-garmin-history swift-task bright-service strava-token-exchange
   get-week workout-detail share-strength-to-strava fetch-strava-route` (the last two import the changed
   `strava-access-token.ts`). `garmin-webhook-user` was not touched.
3. The paste (three migrations, order above), then `cron.job` shows `run-jobs-every-minute`.
4. The five checks, the web walk (Performance card, Connections, Home), teardown.
5. Commit, push, `npm run ios`.
6. Still open from §4: `import-strava-history` overwrites `connection_data` after an import (FOUNDATION-READINESS B3's
   rotation note) — not touched.
