# FOUNDATION-READINESS — the hardening backlog (scale + security + ops)

**What this is.** The companion to `TARGET-ARCHITECTURE.md`. The north star says *what the app should be*; this says *what the foundation needs before it can carry paying users*. Severity-ranked, evidence-cited, and each item marked **[tracked: Q/D-ref]** or **[NEW — file]** so a fresh chat can pick it up cold. Derived from a 3-way architecture audit 2026-07-10 (pattern inventory + scalability + commercial-readiness).

**One-line verdict.** The **domain logic and the target pattern are genuinely good** (the pure-math core is well-tested; run+`session_detail_v1` is the correct smart-server/dumb-client model). What is **not** commercial-ready is the **layer around it**: orchestration/cache coherence (scale) and the security/ops trust boundary. **Pre-launch, one real user → nothing is on fire today.** But **B1 (cross-user exposure) and B4 (no error visibility) gate onboarding a second paying account.** Don't over-alarm; do fix these two before real users.

**How this connects:** the biggest scale fix and the biggest north-star fix are the SAME move — retire client-side compute (`useStateTrends`) by reading the server cache that already exists. "Dumb client" = "reads one cached value" = correctness + scale in one edit.

---

## TRACK 1 — Scale (orchestration & cache coherence). *The math scales; the plumbing doesn't.*

| # | Item | Sev | Evidence | Status |
|---|---|---|---|---|
| S1 | **coach_cache invalidation RACE** — `invalidateUserTrainingCache` fires at ingest *before* the async analyzers/snapshot write; nothing re-invalidates when they land → a State open in that window rebuilds off OLD data and re-caches it for up to 24h. Hidden at 1 user; constant at 1k. | **Blocker (scale)** | `ingest-activity/index.ts:1600` (invalidate) vs `:1622-1643` (analyzers fire after); `compute-snapshot`/analyzers never touch `coach_cache` | **NEW — file** |
| S2 | **State recomputes ~10 history queries in the browser** instead of reading the cache it already built (`state_trends_v1`). Dumb-client violation AND per-open waste. Highest bang-for-buck. | **Serious (scale + Law-4)** | `src/hooks/useStateTrends.ts:50-205` (10 queries → client `assembleStateTrends`); cache exists at `compute-snapshot/index.ts:745` | partly **[D-186 / D-194]**; the State-screen fix itself **NEW — file** |
| S3 | **Ingest fan-out: no queue, no retry, no dead-letter.** ~8 fire-and-forget `fetch` calls; failures only `console.error`; a dropped analyze leaves `analysis_status:'pending'` forever. Thundering herd + partial-failure accumulator at scale. | **Serious (scale)** | `ingest-activity/index.ts:1433-1680`; `compute-facts/index.ts:1794-1821` | **NEW — file** |
| S4 | **`getArcContext` re-invoked 2–3× per workout** (14 callers: analyzers + adapt-plan + detail open), ~30–40 arc queries per ingest. Assemble once, pass down. | **Serious (scale)** | `_shared/arc-context.ts` + its 14 callers | **NEW — file** |
| S5 | **`route_progress_metrics` likely missing `(user_id, metric_date)` index** — no migration in-repo, queried on two hot paths → seq-scan risk. Verify in prod. | Cleanup (verify) | `coach/index.ts:3710,3730`, `useStateTrends.ts:74` | **NEW — file** |

**Scales fine as-is (leave alone):** per-workout facts/snapshot compute (bounded 5-week windows, indexed), coach's bounded query windows (`limit 80` + date ranges — not O(history)), hot-table indexes on `workouts`/`workout_facts`/`exercise_log`/`athlete_snapshot`.

---

## TRACK 2 — Commercial / Security / Ops. *The trust boundary and operability layer.*

| # | Item | Sev | Evidence | Status |
|---|---|---|---|---|
| B1 | **Cross-user data exposure (IDOR).** ~47 functions take `user_id` from the request body under the service-role key; ~24 also `verify_jwt=false` (publicly reachable). Anyone can POST any `user_id` and read that user's whole arc, or delete their connections. The CORRECT pattern already exists (`save-location` derives id from the verified JWT) — used in only ~26 of ~90 fns. | **BLOCKER** | `get-arc-context/index.ts:26-41`, `disconnect-connection/index.ts:26-35` (bad); `save-location/index.ts:11-34` (good) | **NEW — file (security)** |
| B4 | **No error sink.** Zero Sentry/structured logging; 455 `console.error` into ephemeral edge logs; no error table in 97 migrations. If a user's compute breaks you never know — this turns every other bug into a *silent* bug. Reuse the `notify-admin-signup` Resend wiring for a `notify-admin-error`. | **BLOCKER** | no error table; `notify-admin-signup` exists, no error analog | **NEW — file** (only "considered", DECISIONS-LOG:2120) |
| B2 | **Hardcoded anon key + project URL in client** (7 files). Public-by-design so not a secret leak, but defeats key rotation and makes B1 trivially scriptable. Move to `import.meta.env`. | Serious | `src/lib/supabase.ts:5-6`, `GarminPreview.tsx`, `Connections.tsx`, `TrainingBaselines.tsx:769` | partly **[SCREEN-CONNECTIVITY hygiene flags]**; **file** |
| B3 | **Sync dies silently; no connection-health state.** No `status`/`needs_reauth`/`last_error` column on `user_connections`/`device_connections`. A dead token looks healthy; cardio sync just stops. Plus a rotation bug: `import-strava-history` overwrites `connection_data` with stats, dropping the rotated refresh_token → next server refresh breaks permanently. | Serious | `strava-refresh/index.ts:58-64`; `import-strava-history/index.ts:880-891` | **NEW — file** |
| B5 | **Hottest paths untyped AND untested.** `ingest-activity` (1735 LOC), `get-week` (1560), `compute-workout-summary/analysis`, `workout-detail`, both webhooks — all `@ts-nocheck`, zero tests, failures swallowed. Client `tsc` = 316 errors (`strict:false` ships them). Not "fix 316" — "the ingest→summary→read spine needs types or contract tests before real traffic." | Serious | 27 `@ts-nocheck` files (CLAUDE.md); ingest `try{}catch{}` ~:1432 | partly **[CLAUDE.md notes @ts-nocheck]**; the risk framing **NEW — file** |
| B6 | **"Score that lies" — silent default-to-zero.** `workloadTotal += f.workload ?? 0` persisted as a complete week → a week with missing workloads renders as a real, lower training week. Same in ACWR (null workloads dropped, shown to 2 decimals). The app ships the honest guard elsewhere (`build.ts:352` `allZero`) — these two are inconsistent with its own bar. | Serious | `compute-snapshot/index.ts:124-125,759`; `_shared/acwr.ts:176-177,203` | **NEW — file (D-242 class)** |
| B7 | **Failure illegible to the user.** Analyzers write `analysis_status='failed'`/`analysis_error` but the client reads them NOWHERE; `athlete_snapshot` has no status column. User can't tell "computing" from "failed" from "genuinely low week." | Serious | write at `compute-workout-analysis:2018`; zero client reads | **NEW — file** |
| B8 | **No rate-limit/backoff on Strava ingest; webhook failures lost.** `import-strava-history` has no 429 branch (aborts whole import, no resume); Strava's app-wide limits mean one import storm rate-limits everyone; Garmin webhook has no `waitUntil` (isolate can die mid-flight; Strava got that fix, Garmin didn't). | Serious | `import-strava-history:736-738`; `garmin-webhook-activities/index.ts:21` | partly **[Q-141 single-vendor]**; **file** |
| B9 | **Garmin token in URL query param** → leaks into edge/proxy/browser logs + `localStorage`. Should be an `Authorization` header. | Serious | `swift-task/index.ts:56`; callers in `GarminDataService.ts`, `Connections.tsx:885` | **NEW — file** |
| B10 | **`weekly_workload` table has `user_id` but no RLS.** Latent cross-user read if ever queried with the anon client (server-only today). The one gap in an otherwise consistent RLS picture. | Cleanup (latent) | migration `20250115000002` (no `ENABLE ROW LEVEL SECURITY`) | **NEW — file** |
| B11 | **Migrations dir ≠ prod schema of record.** 6 naming schemes, two files share a prefix (undefined order), some "apply by hand not `db push`", `route_progress_metrics` has no migration at all. `run-migration/` is an empty stub. | Cleanup | `supabase/migrations/`; `route_progress_metrics` (no migration) | **NEW — file** |
| B12 | **`readiness_checkins` dual-write can diverge**; backfill reconciliation is gap-only (`ON CONFLICT DO NOTHING`) so it never corrects a diverged row. | Cleanup | `StrengthLogger.tsx:3278` (fail-soft table write) | partly **[D-140–143]** |
| B13 | **`backfill-facts` unguarded** — no auth, no dry-run, `user_id` optional → runs across ALL users on service-role. (4 of 6 backfills are properly gated.) | Cleanup | `backfill-facts` | **NEW — file** |

---

## The two blockers, restated plainly
**Before a second paying account:** (1) **stop trusting body-supplied `user_id`** — derive it from the verified login on every user-scoped function (B1), and (2) **add an error sink + admin alert** so a broken compute is visible (B4). Everything else in SERIOUS is a focused sprint; CLEANUP won't bite a small early cohort.

## What's genuinely good (don't touch)
The pure-math `_shared/` core (ACWR, workload, reconcile, week-optimizer) is well-tested and correct. RLS on user tables is broadly consistent (`auth.uid()=user_id`) — B1 is an *edge-function* trust-boundary problem, not a table-policy one. The compute algorithms are bounded and indexed. The target pattern (run+contract) is right.

## Cross-refs
`TARGET-ARCHITECTURE.md` (the destination this hardens toward) · `TRUTH-MAP.md` (per-fact authority) · `CONSTITUTION.md` · `SCREEN-CONNECTIVITY.md` (hygiene flags) · existing: Q-105/Q-106, Q-141, Q-054/Q-057, D-140–143, D-186, D-194.

## Owed at session close: file the [NEW] items as numbered Q-NNN (security/scale/ops) so they enter the tracked backlog.
