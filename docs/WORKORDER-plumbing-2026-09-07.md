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
