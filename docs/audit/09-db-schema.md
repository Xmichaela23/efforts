# Feature Audit — Area 09: Database Schema (Ground Truth)

Live schema derived from Supabase dashboard SQL queries, run 2026-06-17. Cross-referenced against code assumptions in areas 01–08. **Uncommitted — Michael reviews and commits.**

Queries run by: Michael (dashboard SQL editor, read-only).
Doc written by: Claude, from pasted results.
User audited: `45d122e7-a950-4d50-858c-380b492061aa`

---

## 1. TABLE INVENTORY (ground truth)

44 tables in `public` schema. Full list:

```
athlete_memory            athlete_memory_events     athlete_snapshot
block_adaptation_cache    coach_cache               course_segments
course_strategy_debug     cycling_segment_history   daily_context
device_connections        exercise_log              exercises
garmin_activities         gear                      goals
library_plans             plan_adjustments          plan_assessments
planned_workouts          planned_workouts_resolved plans
plans_legacy              race_courses              readiness_checkins
route_clusters            route_progress_metrics    routines
segment_progress_metrics  session_load              strava_activities
terrain_segments          training_plans            user_baselines
user_connections          users                     weather_cache
weekly_workload           workout_data              workout_facts
workout_intervals         workout_route_match       workout_segment_match
workout_terrain_profile   workouts
```

### Audit naming mismatches (code assumed vs. actual)

| Audit assumed | Actual table | Notes |
|---|---|---|
| `activities` | `workouts` | Primary completed-workout table |
| `performance_numbers` | `user_baselines` (JSONB column) | Embedded in `user_baselines.performance_numbers` |
| `learned_fitness` | `user_baselines` (JSONB column) | Embedded in `user_baselines.learned_fitness` |
| `session_detail_v1` | **Does not exist** | Response contract only, never persisted |
| `athlete_snapshot` | `athlete_snapshot` ✓ | Exists |
| `coach_cache` | `coach_cache` ✓ | Exists |
| `exercise_log` | `exercise_log` ✓ | Exists |

### Tables present but not in audit scope

- `plans_legacy` — exists, contains old plan format. Audit did not flag this. Low risk (likely migration artifact).
- `planned_workouts_resolved` — exists as a VIEW (all columns `is_nullable = YES`, no PK default), not a table. Resolves planned workouts with computed fields (`week1_monday`, `is_completed_real`, `status_final`, `date_final`). Not in audit. (Code reconciliation in §9: not referenced by name in app code.)
- `training_plans` — in table list but not in A2 column results (it was not in the A2 IN-list, so no columns were returned — see §9 for the corrected reading). Code reconciliation in §9: live legacy fallback table.
- `workout_data`, `workout_intervals`, `workout_route_match`, `workout_segment_match`, `workout_terrain_profile` — present, not in audit scope.
- `athlete_memory_events`, `daily_context`, `readiness_checkins`, `routines`, `library_plans` — present, not in audit scope.

---

## 2. KEY TABLE SCHEMAS

### `workouts` (the real "activities" table)
157 columns. Notable confirmed columns:
- `swim_data` jsonb YES null — **confirmed**: exists on `workouts`, not a separate table. Strava swims will have this null (no stroke/SWOLF data from Strava ingest).
- `computed` jsonb, `computed_version` integer, `computed_at` timestamp — versioning columns confirmed.
- `summary_status` text default `'pending'`, `metrics_status` text default `'pending'` — dual-pipeline status confirmed.
- `pool_length_m`, `pool_unit`, `pool_length_source`, `pool_confidence`, `pool_conflict` — full pool resolver state is persisted.
- `user_corrected_pool_length_m` double precision — user override column confirmed.
- `gap_pace_s_per_mi` integer — GAP is stored as a top-level column, not buried in JSONB.
- `healthkit_id` text — HealthKit bridge column already exists (Q-060 Apple Watch work has a landing spot).
- `rpe` integer AND `session_rpe` integer — **two RPE columns**. `rpe` appears older; `session_rpe` is the current one. Potential drift point. (§9: both are live in code.)
- `workout_analysis` jsonb, `analysis_status` text — separate from `computed`; audit did not distinguish these. (§9: distinct documented layers, not ambiguous.)
- `feedback_dismissed_at` timestamp — feedback popup dismissal stored here, confirmed.

### `user_baselines` (the real "performance_numbers" + "learned_fitness" table)
One row per user. All performance data lives here:
- `performance_numbers` jsonb — contains `ftp`, `bench`, `squat`, `deadlift`, `fiveK`, `easyPace`, `swimPace100`, `overheadPress1RM`. **Not null columns** — your row has values.
- `learned_fitness` jsonb — contains full learned signal (see §3 below). **Not a separate table** — audit area 07 was correct that it's a JSONB blob, but the column lives on `user_baselines`, not a standalone table.
- `configured_hr_zones` jsonb YES null — **confirmed null** for your row. HR zones are not manually configured.
- `athlete_identity` jsonb — contains `default_intent`, `training_intent`, `confirmed_by_user`, arc setup timestamp.
- `effort_score`, `effort_paces`, `effort_paces_source` — VDOT/effort scoring persisted here.

### `athlete_snapshot`
52 columns. Key findings:
- `plan_phase` text YES null — **column exists** (audit was correct). Whether it's ever written is the question — see §4.
- `state_trends_v1` jsonb YES null — **confirmed JSONB**, added via `ADD COLUMN IF NOT EXISTS` per migration.
- `computed_at` timestamp — correct sort key (not `updated_at`, which does not exist on this table).
- `ctl`, `atl`, `tsb` — CTL/ATL/TSB columns confirmed on snapshot.
- `interference` jsonb, `intensity_distribution` jsonb — present.

### `coach_cache`
4 columns only: `user_id` (PK), `payload` jsonb, `generated_at` timestamp, `invalidated_at` timestamp.
- **One row per user confirmed** (LIMIT 5 returned 1 row).
- **No `date` key in payload** (`payload_has_date_key = false`) — confirmed date-blind.
- `invalidated_at` is null for your row — cache has never been explicitly invalidated.

### `exercise_log`
15 columns. Sort key is `computed_at` (not `updated_at` — that column does not exist).
- `estimated_1rm` numeric YES null — single column, Brzycki writer confirmed dominant (see §6).

### `goals`
20 columns. `projection` jsonb, `target_time` integer — race projection stored here.

### `plans`
21 columns. `generation_trade_offs` jsonb NOT NULL default `'[]'` — trade-offs from plan generation are persisted.
- `plans_legacy` — parallel table with overlapping columns (`sessions_by_week`, `notes_by_week`, `config`). Confirmed legacy artifact.

### `planned_workouts`
~60 columns. Very wide. Swim columns confirmed: `pool_length_m`, `pool_unit`, `pool_label`, `environment`, `workout_structure`, `swim_per100_sec/low/high`.
- `completed_workout_id` uuid — link back to `workouts` when completed.
- `workload_planned`, `workload_actual` — both present.
- `skip_reason`, `skip_note` — skip tracking confirmed.

### `session_load`
8 columns. `load_domain`, `load_target`, `magnitude`, `decay_hours` — the load ledger structure confirmed.

### `strava_activities`
6 columns: `id`, `strava_id`, `user_id`, `activity_data` (jsonb), `created_at`, `updated_at`, `deleted_at`. Raw Strava payload stored in `activity_data` blob — not normalized into columns.

### `garmin_activities`
~40 columns. Normalized (not blob). Swim-specific: `avg_swim_cadence`, `number_of_active_lengths`. No `swim_data` column — swim detail lives in `samples_data` jsonb or `sensor_data` jsonb.

### `block_adaptation_cache`
`expires_at` timestamp with `(now() + '24:00:00')` default — 24h TTL baked into schema. `aerobic_efficiency_trend`, `strength_progression_trend` jsonb.

---

## 3. ONBOARDING NULL GAP — CONFIRMED OR REFUTED?

**Refuted for this athlete. Confirmed as a structural risk for new athletes.**

Your `user_baselines` row has:
- `performance_numbers.ftp = 176` — populated
- `performance_numbers.swimPace100 = "2:30"` — populated
- `learned_fitness.ride_ftp_estimated.value = 176` (high confidence, 11 efforts)
- `learned_fitness.swim_pace_per_100m.value = 129` (high confidence, 10 sessions)
- `learned_fitness.run_threshold_pace_sec_per_km.value = 376` (high confidence, 5 runs)
- `learning_status = "confident"`

**You are not in the null gap.** You have 53 workouts analyzed and full learned signal.

However the structural gap is confirmed: `performance_numbers` and `learned_fitness` are both JSONB blobs on `user_baselines`. A new athlete leaving the wizard has an empty `performance_numbers = {}` and `learned_fitness = {}` with no FTP/CSS/threshold keys. The `|| 200` fallbacks in code are the only protection. `FTP-COLD-START-SPEC` remains unimplemented.

**Swim HR zone anchor finding:** `learned_fitness.run_threshold_hr.value = 150` (low confidence, 95th percentile). No `swim_threshold_hr` key exists in your `learned_fitness` blob. Swim HR zones anchoring to `run_threshold_hr` is confirmed — there is no separate swim HR threshold stored anywhere.

---

## 4. STATE_TRENDS_V1 WRITE BEHAVIOR — CONFIRMED

**B5 result confirms the audit's finding exactly:**

| week_start | has_trends | computed_at |
|---|---|---|
| 2026-06-15 | **true** | 2026-06-17 05:54 |
| 2026-06-08 | false | 2026-06-17 03:29 |
| 2026-06-01 | false | 2026-06-04 |
| 2026-05-25 | false | 2026-05-31 |
| … (6 more) | false | … |

**Confirmed:** `state_trends_v1` is written ONLY for the current week (`2026-06-15` = Monday of today's week). All 9 past weeks have `state_trends_v1 = null`. This is intentional behavior (area 03 audit was correct), not a bug.

**`plan_phase` write status — CONFIRMED stub (2026-06-17):** queried all 10 rows. `plan_phase` is `null` on **every** row, including weeks where `plan_id` and `plan_week_number` are fully populated:

| week_start | plan_phase | plan_week_number | plan_id |
|---|---|---|---|
| 2026-06-15 | null | 5 | 3845fc1b… |
| 2026-06-08 | null | 4 | 3845fc1b… |
| 2026-06-01 | null | 3 | 3845fc1b… |
| 2026-05-25 | null | 2 | a20c4024… |
| 2026-05-18 | null | 1 | 9116e261… |
| 2026-05-11 | null | null | null |
| … | null | … | … |
| 2026-04-13 | null | 7 | 080aaab8… |

**`plan_phase` is confirmed null on all 10 rows, despite `plan_id` and `plan_week_number` being populated on 6 of them.** The column exists; the writer never fires. This closes the "stub or dropped" question raised in areas 03 + 05 — **it's a stub** (declared but never written by `compute-snapshot`), not a dropped/renamed column. Confirmed at the data level.

(Side observation: `plan_id` varies across weeks — multiple plans over the athlete's history — and is null for the 2026-04-20…2026-05-11 stretch, i.e. weeks with no active plan. Expected.)

---

## 5. COACH_CACHE DATE-BLIND — CONFIRMED

**B6 result:**
- 1 row returned (confirms `user_id` is the PK — one row per user)
- `payload_has_date_key = false` — no date key in the payload JSONB
- `invalidated_at = null` — cache never invalidated
- `generated_at = 2026-06-17 06:05` — generated this morning

**Confirmed:** coach_cache is keyed by `user_id` only. Date is not part of the key or the payload. A payload built on date X will serve on date Y until 24h elapses or `invalidated_at` is set. The four direct `payload` reads that bypass `invalidated_at` (flagged in area 08) remain the live exposure.

---

## 6. E1RM RACE — CONFIRMED NON-ISSUE

All 20 `exercise_log` rows examined. `computed_at` timestamps cluster around `2026-03-04 20:16:xx` (bulk backfill) with a few later individual entries. No evidence of two concurrent writers racing on the same row. Epley formula in `compute-adaptation-metrics` appears dormant — Brzycki is the active writer.

---

## 7. ADDITIONAL FINDINGS (not in original audit)

- **`workouts` has two RPE columns**: `rpe` (integer) and `session_rpe` (integer). Likely `rpe` is legacy, `session_rpe` is current. Risk: code reading wrong column silently. Not flagged in areas 01–08. (§9: both are referenced in code.)
- **`healthkit_id` text column on `workouts`** — Apple Watch HealthKit ingest (Q-060) already has a dedicated column waiting. No migration needed for that part of the work.
- **`planned_workouts_resolved` is a VIEW** not a table — all columns nullable, no PK sequence. Code treating it as writable would fail silently. (§9: code does not reference it by name.)
- **`training_plans` returned no columns in A2** — it was not in the A2 IN-list (see §9 correction); it does exist per A1 inventory.
- **`workout_analysis` jsonb separate from `computed` jsonb** on `workouts` — two JSONB analysis blobs. Audit area 05 did not distinguish these. (§9: distinct documented layers, not "unclear which is authoritative".)

---

## 8. COVERAGE NOTE

| Query | Result |
|---|---|
| A1 — table inventory | Complete, 44 tables |
| A2 — column schema | Complete for 16 tables (returned ~300 rows) |
| B3 — user_baselines row | Complete (1 row, full schema) |
| B4 — exercise_log rows | Complete (20 rows) |
| B5 — athlete_snapshot trends | Complete (10 rows) |
| B6 — coach_cache | Complete (1 row) |

Not queried: `workout_facts`, `workout_data`, `workout_intervals`, `session_load` row data, `athlete_memory` row data, `plans`/`planned_workouts` row data. Schema confirmed for these; row-level behavior not spot-checked.

`plan_phase` write behavior **confirmed** (see §4) — always-null stub, even with plan context present. No open items remain at the row level.

---

## 9. CODE-SIDE RECONCILIATION OF §7 OPEN ITEMS (Claude, from read-only code grep — no DB)

These resolve/correct the open items in §7 using the repo code, not the DB. Method: `grep` over `src/` and `supabase/functions/`.

- **`rpe` vs `session_rpe` — both are LIVE, not legacy-vs-current.** `session_rpe` is referenced in 19 `.ts` files; `\brpe\b` in 25. Both columns are actively read/written across code. The drift risk in §7 is **real and current** (not "rpe is dead"): different surfaces may read different columns. Which column is authoritative per surface was not traced exhaustively — flagged for human review, not resolved.
- **`planned_workouts_resolved` (VIEW) — not referenced by name in app code.** `grep "planned_workouts_resolved"` over `src/` + `supabase/functions/` returns **zero** TS hits. So the "code treating it as writable would fail silently" risk does not materialize from the app code — nothing queries or writes it by name. (It may be consumed via SQL/RPC or be currently unused; that was not determined.)
- **`training_plans` — live LEGACY FALLBACK table, not empty/alias.** Referenced in `analyze-cycling-workout/index.ts:1360`, `analyze-strength-workout/index.ts:403`, `analyze-swim-workout/index.ts`, and `validate-reschedule/index.ts:303-321`. Pattern (with in-code comments): `planned_workouts.training_plan_id` references the **`plans`** table; code reads `plans` first and **falls back to `training_plans` (legacy)**. So §7's "returned no columns in A2" is simply because `training_plans` was not in the A2 IN-list — not evidence of emptiness. Its column list was never queried.
- **`workout_analysis` vs `computed` — distinct documented layers, not ambiguous.** Per CLAUDE.md topology: `workouts.computed` = sensor-derived intervals/series, written by `compute-workout-summary`; `workouts.workout_analysis` = analyzer output (adherence, grades), written by `analyze-{running,cycling,swim,strength}-workout` (all four confirmed as writers via grep). Both are authoritative — for different things. The §7 "unclear which is authoritative" is resolved: they are not competing copies.

---

## 10. REMAINING OPEN ITEM — RESOLVED (2026-06-17)

`plan_phase` write behavior was the only audit discrepancy left at "unverified" after the first DB pass. **Now confirmed** (query result in §4): `plan_phase` is null on all 10 rows including weeks with full plan context, so the "always-null stub" flag (area 03 §discrepancy, area 05 §discrepancy) is confirmed at the data level. No row-level audit items remain open.

Query used:
```sql
SELECT week_start, plan_phase, plan_week_number, plan_id
FROM athlete_snapshot
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
ORDER BY week_start DESC
LIMIT 10;
```

---

## 11. CROSS-REFERENCES

- Confirms / grounds: area 01 (swim_data null for Strava), area 03 (state_trends_v1 current-week-only; plan_phase column), area 05 (compute layers, version columns), area 07 (learned_fitness/performance_numbers as JSONB blobs on user_baselines; onboarding gap structural; swim-HR anchored to run_threshold_hr), area 08 (coach_cache date-blind, single row per user, invalidated_at mechanism).
- `99-SUMMARY.md §4` soft spots (a) "schema/migration ground-truth" and (b) "exact columns" — soft spot (a) is now **resolved by this area** for the audited tables.
- D-184/D-185/D-182, Q-038/Q-054/Q-060 referenced in the per-area docs.
