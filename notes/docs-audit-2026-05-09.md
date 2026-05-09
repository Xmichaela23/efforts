# Docs Audit — 2026-05-09

Read-only audit of doc claims vs current code. Cited file paths are absolute.

---

## APP_ARCHITECTURE.md
Last edited: 2025-11-10 (header itself says "Last Updated: November 7, 2025"). This is the oldest of the audited docs and shows its age.

### Claim 1: "Smart Server, Dumb Client. Client NEVER queries planned_workouts or workouts directly."
Lines 41–69, 71–77, 1148–1162, 1779–1782.
**Status:** STALE / partially MISSING
**Evidence:** Calendar reads do go through `get-week` via `src/hooks/useWeekUnified.ts` and `src/lib/fetchWeekUnified.ts` (verified). But the absolute "client NEVER queries" framing is no longer accurate:
- `src/hooks/useWorkouts.ts:231` queries `workouts` directly with `.from("workouts")` for the workout list.
- `src/hooks/usePlannedWorkouts.ts` and `src/hooks/usePlannedWorkoutLink.ts` (lines 116/142/164) read from `planned_workouts`.
- `src/components/AllPlansInterface.tsx` (lines 1010, 1047, 1101, 1118, 1168) and `src/components/TodaysEffort.tsx:524`, `src/components/AppLayout.tsx:1020`, `src/contexts/AppContext.tsx:865` mutate or read both tables directly.
The principle holds for the unified calendar view; outside that view the client touches the tables. CLAUDE.md (line 48–53) softens this to "must not re-derive planned-vs-executed adherence" / "never queries... for calendar data" — that's the accurate phrasing today.

### Claim 2: `useWeekUnified(fromISO, toISO)` is the calendar data hook and calls `get-week`.
Lines 899–908, 2082.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/src/hooks/useWeekUnified.ts` exists and delegates to `fetchWeekUnified` at `/Users/michaelambp/efforts/src/lib/fetchWeekUnified.ts:11` which calls `supabase.functions.invoke('get-week', ...)`.

### Claim 3: `get-week` returns `{ items, weekly_stats, training_plan_context }` and on-demand materializes planned rows + steps.
Lines 745–763, 1545–1585.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/get-week/index.ts:1519` returns `weekly_stats`, line 1531 attaches `training_plan_context`. Lines 322–332 and 483 invoke `materialize-plan` for rows missing computed.steps. Lines 144 and 167 read `plans.sessions_by_week` and create planned rows lazily.

### Claim 4: Plan structure stored as `plans.config.sessions_by_week`.
Lines 232–238 (Plan section), 1399–1432 (example), 1551–1560 (pseudocode).
**Status:** STALE
**Evidence:** `plans` now has a top-level `sessions_by_week` column. `/Users/michaelambp/efforts/supabase/functions/get-week/index.ts:144` selects `id,user_id,status,config,duration_weeks,sessions_by_week` — `sessions_by_week` is no longer nested under `config`. Old config-nested format may still be readable as fallback, but the canonical location moved.

### Claim 5: Frontend has `src/services/workoutAnalysisService.ts` with `getAnalysisFunction(type)` routing run/strength/ride/swim → `analyze-*-workout` functions, plus `analyzeWorkoutWithRetry`.
Lines 938–961, 1163–1183, 2081.
**Status:** MISSING
**Evidence:** No file `src/services/workoutAnalysisService.ts` exists (`ls /Users/michaelambp/efforts/src/services/` lists only bluetoothHR.ts, ExerciseLibrary.ts, GarminDataService.ts, healthkit.ts, LibraryPlans.ts, plans/, StravaDataService.ts, watchConnectivity.ts, workloadService.ts, workout-execution/). Grep for `workoutAnalysisService` and `getAnalysisFunction` across `src/` returns zero results. Routing now lives server-side in `supabase/functions/recompute-workout/index.ts:21–25` and `supabase/functions/ingest-activity/index.ts:1482–1488` and `supabase/functions/bulk-reanalyze-workouts/index.ts:40–50`. Client-side analyzer invocations are essentially gone — only `src/components/WorkloadAdmin.tsx:301` still calls `analyze-running-workout` directly (admin tool).

### Claim 6: Doc references `analyze-swimming-workout` as the swim analyzer.
Line 954 inside the (defunct) workoutAnalysisService example.
**Status:** STALE
**Evidence:** The actual edge function is `analyze-swim-workout` (`/Users/michaelambp/efforts/supabase/functions/analyze-swim-workout/index.ts`). Server routers (recompute-workout, ingest-activity, bulk-reanalyze) all use `analyze-swim-workout`.

### Claim 7: Empty `analyze-workout` function exists as orchestrator.
Implicit from the catalog being "complete" and from the framing "no orchestrator layer" (line 89).
**Status:** UNCERTAIN / red flag
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/analyze-workout/` exists as a directory but is empty (0 entries). Doc says "no orchestrator" — code is consistent with no orchestrator, but the dangling empty dir is dead weight. The "Direct Discipline Routing" claim now happens server-side, not client-side as the doc describes.

### Claim 8: `useWorkoutDetail(id, options)` calls `workout-detail` edge function with include_gps/include_sensors/resolution.
Lines 910–924, 1858–1864.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/src/hooks/useWorkoutDetail.ts:109` invokes `workout-detail`, supports `force_refresh` (line 216), and uses scope-based fetching (`session_detail`).

### Claim 9: `auto-attach-planned` calls `compute-workout-summary` then optionally `analyze-running-workout`.
Lines 808–818, 1019–1042.
**Status:** UNCERTAIN / partially STALE
**Evidence:** `auto-attach-planned` exists at `/Users/michaelambp/efforts/supabase/functions/auto-attach-planned/index.ts`. Today's analyzer routing is centralized in `ingest-activity/index.ts:1475-1488` (post-attach) and `recompute-workout/index.ts:21-25`. The doc's framing that auto-attach itself triggers analyzers may be stale — `ingest-activity` is the orchestrator now.

### Claim 10: Workout schema — sensor_data, gps_track, computed, workout_analysis JSONB columns, and analysis_status text column.
Lines 159–195.
**Status:** VERIFIED
**Evidence:** Migration `/Users/michaelambp/efforts/supabase/migrations/20250906123000_add_workouts_json_columns.sql` adds gps_track + sensor_data jsonb. `/Users/michaelambp/efforts/supabase/migrations/20250128000000_add_analysis_status_columns.sql` adds analysis_status text default 'pending'. Lifecycle pending → analyzing → complete | failed verified in `analyze-running-workout/index.ts:137, 2673, 2788`.

### Claim 11: `user_baselines.performance_numbers` shape uses `fiveK_pace`, `easy_pace`, `ftp`, `squat_1rm`, etc. (snake_case).
Lines 243–257.
**Status:** STALE / inconsistent
**Evidence:** DB comment in `/Users/michaelambp/efforts/supabase/migrations/20250701120003_add_overhead_press_field.sql:19` documents canonical fields as `fiveK, easyPace, ftp, swimPace100, squat, deadlift, bench, overheadPress1RM` (camelCase, no `_1rm` suffix). Code accepts both: `materialize-plan/index.ts:341, 407` reads `b.fiveK_pace ?? b.fiveKPace ?? b.fiveK`, and `src/contexts/AppContext.tsx:336-348` actively writes `fiveK_pace`. Both shapes coexist; doc only shows one of them and uses suffix that doesn't match canonical (`_1rm` vs `1RM`).

### Claim 12: `workouts.computed` has `normalization_version` (e.g. v1) and `intervals[]`, `overall`, `series`, `analysis` sections.
Lines 337–411, 1535 (planned uses v3).
**Status:** VERIFIED
**Evidence:** `materialize-plan/index.ts:2402, 2443` writes `normalization_version: 'v3'` to planned_workouts.computed.steps. The shape with intervals/overall/series/analysis matches workout-detail and analyzer code paths.

### Claim 13: TodaysWorkoutsTab.tsx is the Context-tab analysis trigger; analyzes workouts via `analyzeWorkoutWithRetry`.
Lines 1004–1011, 1923–1980.
**Status:** MISSING
**Evidence:** No file `TodaysWorkoutsTab.tsx` exists (`find` returns nothing). The Context tab is now `src/components/ContextTabs.tsx` which delegates to `src/components/context/StateTab.tsx`, `BlockSummaryTab.tsx`, `CoachWeekTab.tsx`. Polling for analysis completion now happens in `src/components/CompletedTab.tsx:416-428` against `analysis_status`. Client doesn't call `analyzeWorkoutWithRetry` (function does not exist).

### Claim 14: `PlanSelect.tsx` component handles plan activation.
Line 1992.
**Status:** STALE (location moved)
**Evidence:** `src/components/PlanSelect.tsx` does not exist; `/Users/michaelambp/efforts/src/pages/PlanSelect.tsx` exists. Component was promoted to a page.

### Claim 15: Both TodaysEffort and WorkoutCalendar render via `useWeekUnified`; AppLayout composes them.
Lines 1599–1626, 1641–1652, 1773–1782.
**Status:** VERIFIED
**Evidence:** Files exist at `/Users/michaelambp/efforts/src/components/AppLayout.tsx`, `WorkoutCalendar.tsx`, `TodaysEffort.tsx`, `UnifiedWorkoutView.tsx`, `MobileSummary.tsx`, `StrengthLogger.tsx`. `AppLayout.tsx:1479, 1596` mounts `ContextTabs`. The unified view pattern still holds for calendar reads.

### Claim 16: workload formula = duration_hours × intensity² × 100.
Lines 720–727, 1797.
**Status:** VERIFIED (matches CLAUDE.md line 89). `/Users/michaelambp/efforts/supabase/functions/calculate-workload/` exists.

### Claim 17: Edge functions listed: ingest-activity, garmin-webhook-activities, strava-webhook, compute-workout-summary, materialize-plan, get-week, etc.
Lines 591–878.
**Status:** Mostly VERIFIED with omissions
**Evidence:** All listed functions exist. The doc's catalog is heavily incomplete — current count is 98 functions vs the ~25 documented. Notable functions missing from doc that exist now: `coach`, `arc-setup-chat`, `get-arc-context`, `compute-facts`, `compute-snapshot`, `generate-combined-plan`, `generate-training-context`, `course-detail`, `course-strategy`, `complete-race`, `create-goal-and-materialize-plan`, `delete-goal`, `extract-races`, `learn-fitness-profile`, `readiness`, etc. The catalog is roughly a year behind.

### Claim 18: Frontend hooks list — useWorkouts, useWeekUnified, useWorkoutDetail, usePlannedWorkouts, useWorkoutsRange.
Lines 885–933.
**Status:** Partially STALE
**Evidence:** `useWorkoutsRange.ts` does not exist in `/Users/michaelambp/efforts/src/hooks/`. New hooks not listed: `useArcSetupComplete`, `useArcSetupContext`, `useAthleteSnapshot`, `useCoachWeekContext`, `useExerciseLog`, `useGoals`, `useOverallContext`, `usePlannedWorkoutLink`, `useWorkoutData`. The Arc, Coach, Goals stack is entirely missing from the doc.

### Claim 19: Token examples include `5kpace_4x1mi_R2min`, `bike_ss_3x12min_R4min`, `strength_squat_@pct80_5x5`.
Lines 778–782, 1442–1463.
**Status:** UNCERTAIN
**Evidence:** Did not exhaustively trace token grammar in `materialize-plan/index.ts` (file is 2400+ lines). The pattern of token-DSL → resolved steps via materialize-plan is verified; specific token strings cited are illustrative.

### Claim 20: Document treats Arc, Coach, deterministic layer (workout_facts/exercise_log/athlete_snapshot), goals, course strategy as nonexistent.
Whole doc.
**Status:** MISSING
**Evidence:** Major systems shipped after Nov 2025 are completely absent: deterministic layer (`workout_facts`, `exercise_log`, `athlete_snapshot` tables; `compute-facts`, `compute-snapshot` functions), Arc context (`getArcContext`, `_shared/arc-context.ts`), coach (`coach/index.ts` is 4700+ lines), goals/race system (`goals` table, `coach_cache`, `race_readiness_projection`), course strategy (`course-detail`, `course-strategy`), session_detail_v1 (`workout-detail` builds it via `_shared/session-detail/`). This is the doc's biggest gap.

---

## docs/PLAN-CONTRACT.md
Last edited: 2026-05-07. Most recent doc; aspirational/spec-style.

### Claim 1: Athlete declares anchors (long ride, long run, group ride, run club, masters swim) and the system places everything around them.
Sections 1.1, 4.1.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/generate-combined-plan/types.ts:38-66` defines `long_run_day`, `long_ride_day`, `swim_easy_day`, `swim_quality_day`, `bike_quality_day`, etc. as anchor inputs. `index.ts:108-109` and `260-261` thread these into the optimizer.

### Claim 2: Same-day compatibility matrix in §5 specifies pairings; e.g. `long_ride × easy_swim = ✓`, `long_run × easy_swim = ✓`, `long_run × quality_swim = ✓` (with footnote), `long_run × upper_strength = ✓`.
Lines 112–124.
**Status:** STALE
**Evidence:** The code matrix in `/Users/michaelambp/efforts/supabase/functions/_shared/schedule-session-constraints.ts:47-58` disagrees:
- `long_ride: [0,0,0,0,0,0,1,0,0,0]` — long_ride only pairs with itself; `long_ride × easy_swim = ✗` (doc says ✓).
- `long_run: [0,0,0,0,0,0,0,1,0,0]` — long_run pairs with nothing else; `long_run × easy_swim = ✗`, `long_run × quality_swim = ✗`, `long_run × upper_strength = ✗` (doc says all ✓).
- The "After long_run / After long_ride" sequential rules (line 296–297 of constraints file) reinforce that the day after long_ride must be LOW only — but those are sequential, not same-day. Same-day rules in code are stricter than the doc claims.
The other rows (`quality_run × lower_strength` matrix=0 with EXPERIENCE_MODIFIER override allowing AM/PM consolidated for performance + co-equal, `quality_run × quality_swim` matrix=0 with override) match doc footnotes.

### Claim 3: Same-day compatibility matrix matches code on the strength × quality_run consolidated hard day rule (footnote ***).
Line 128.
**Status:** VERIFIED
**Evidence:** `_shared/week-optimizer.ts:287-343, 564` describes "consolidated hard day (performance + co-equal): QR + lower same day (EXPERIENCE_MODIFIER)" with AM run / PM lift. `EXPERIENCE_MODIFIER_TEXT` in constraints file:319-321 codifies this.

### Claim 4: Lower body strength must not fall on the calendar day immediately before non-easy bike + non-easy run combo (§6.3, §6.4).
Lines 158–166.
**Status:** VERIFIED
**Evidence:** `_shared/schedule-session-constraints.ts:298-299`: "After lower_body_strength → 48 hours before the next lower_body_strength, quality_run, or long_run; … Lower_body_strength → not on the calendar day immediately before long_ride or long_run". Plus the .cursor/rules/lower-body-strength-pairing.mdc enforces "easy aerobic only" same-day rule, matching CLAUDE.md line 80.

### Claim 5: Hard-banned: long_ride + any non-swim session.
Line 134.
**Status:** STALE (subtly)
**Evidence:** Doc says long_ride bans non-swim sessions implying `long_ride × easy_swim` is permitted. Code matrix (constraints.ts:54) has long_ride compatible only with itself (none with easy_swim either). The "1 session on long_ride day (long_ride is alone or with easy_swim only)" claim at §5.2 line 140 also conflicts with the code matrix.

### Claim 6: Beginner default: assessment week required OR conservative defaults.
Section 3.1.
**Status:** VERIFIED
**Evidence:** `generate-combined-plan/index.ts:246` checks `scheduleState.assessment_week_preference === 'assessment_first'`. `_shared/arc-setup-prompt.ts` (multiple lines) lays out the assessment-week gate logic.

### Claim 7: Per-week output is `sessions_by_week[weekNum]` containing `PlannedSession` with day, type, discipline, name, description, duration, steps_preset, tags, timing, intensity_class, tss, zone_targets, serves_goal.
Section 11.1.
**Status:** Partially VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/generate-combined-plan/types.ts:272-298` defines PlannedSession with all listed fields plus `weighted_tss`, `session_kind`, `target_yards`, `route_url`, `group_ride_route_snapshot`, `strength_exercises`. The doc's `discipline` field is described as "duplicate field for activate-plan" — `activate-plan/index.ts:430-436` reads either `s.discipline` or `s.type`, so it's accommodated but `discipline` is not on the PlannedSession TypeScript interface — it's tolerated as an alias.

### Claim 8: Plan-level metadata: duration_weeks, phase_by_week, peak_week_tss, average_weekly_tss, generation_trade_offs.
Section 11.2.
**Status:** Partially VERIFIED
**Evidence:** `generate-combined-plan/index.ts:324, 451` writes `duration_weeks`. `generation_trade_offs` is plumbed at line 433/472. `phase_by_week` exists in `generate-training-context/index.ts:2589-2627` (read side; the contract there is `version === 1` with `phase_by_week: string[]`). `peak_week_tss` and `average_weekly_tss` not directly grepped; the GeneratedWeek type tracks `total_raw_tss/total_weighted_tss` per week so plan-level aggregates are derivable.

### Claim 9: Per-athlete adjustments stored: athlete_state.projected_bike_hours, projected_run_hours, assessment_week_preference.
Section 11.3.
**Status:** Partially VERIFIED
**Evidence:** `projected_bike_hours` exists in `generate-combined-plan/types.ts:169` and is read at `week-builder.ts:778`. `assessment_week_preference` exists at `types.ts:176`. `projected_run_hours` is NOT in the codebase (grep returns zero matches). One field of three is absent.

### Claim 10: Strength progression — performance protocol increases weight each build week; mesocycle counter doesn't reset on phase boundaries.
Section 9.4 + ADR 0002 alignment.
**Status:** VERIFIED (consistent with ADR 0002)
**Evidence:** ADR 0002 explicitly addresses this — `weekInPhaseForTimeline` walks the phase timeline backward and is the canonical "week in phase" computation (`week-builder.ts:79`).

### Claim 11: 7-day athletes can have 6 training + 1 rest day; strength can land on quality bike day if upper, never on long_ride day.
Section 7.3.
**Status:** UNCERTAIN
**Evidence:** Not directly grep-confirmed. The matrix in code does support `quality_bike × upper_body_strength = ✓` (constraints.ts:52, col index 9 = 1) so this is consistent with code.

### Claim 12: Course terrain strategy uses same predicted finish as State (race_readiness_projection → coach_cache → resolveGoalTargetTimeSeconds → baseline VDOT).
Implicit and overlaps ADR 0001 §7.
**Status:** VERIFIED
**Evidence:** `course-detail/index.ts:178-234` and `course-strategy/index.ts:262-323` implement that resolution order with `resolveGoalTargetTimeSeconds` and `coach_cache.payload`.

---

## DETERMINISTIC_LAYER_ARCHITECTURE.md
Last edited: 2026-02-24.

### Claim 1: New table `workout_facts` with workout_id PK, user_id, date, discipline, duration_minutes, workload, session_rpe, readiness, plan_id, planned_workout_id, adherence, run_facts/strength_facts/ride_facts/swim_facts JSONB, computed_at, version.
Lines 24–54.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/migrations/20260221_create_deterministic_layer_tables.sql:7-32` creates exactly those columns. Indexes at 34–36 match doc. RLS policies match.

### Claim 2: New table `exercise_log` with workout_id, user_id, date, exercise_name, canonical_name, discipline, sets_completed, best_weight, best_reps, total_volume, avg_rir, estimated_1rm, computed_at.
Lines 132–155.
**Status:** VERIFIED
**Evidence:** Migration lines 53–86 create those columns.

### Claim 3: New table `athlete_snapshot` with weekly aggregates (workload_total, workload_by_discipline, acwr, run_easy_pace_at_hr, etc.).
Lines 168–213.
**Status:** VERIFIED
**Evidence:** Migration lines 91–146 create the table with all listed columns. UNIQUE (user_id, week_start) matches doc.

### Claim 4: `compute-facts` edge function (~500 lines) does discipline-specific math on ingest.
Lines 220–237.
**Status:** STALE on size
**Evidence:** File exists at `/Users/michaelambp/efforts/supabase/functions/compute-facts/index.ts`; current line count is 1724 lines (3.5× the documented "~500 lines" target). Doc's "if it grows past 800 lines, it's doing too much" rule (line 342) is now violated. Function exists and runs; size has drifted.

### Claim 5: `compute-snapshot` edge function (~400 lines) aggregates facts → athlete_snapshot.
Lines 246–253.
**Status:** STALE on size
**Evidence:** File exists at `/Users/michaelambp/efforts/supabase/functions/compute-snapshot/index.ts`; 544 lines (close to but exceeding the 400 target).

### Claim 6: `generate-training-context` reads from `athlete_snapshot` (ACWR, sport breakdown, week comparison).
Phase 2 checklist line 294.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/generate-training-context/index.ts:630, 636, 645` read athlete_snapshot and invoke compute-snapshot when missing. Lines 738, 746, 760, 2690, 2827, 3082 use snapshot for ACWR / sport breakdown / week comparison.

### Claim 7: Coach reads athlete_snapshot for interference, fitness_direction, readiness_state.
Phase 1 checklist line 290.
**Status:** VERIFIED
**Evidence:** `coach/index.ts:2473-2477, 4734` reads `athlete_snapshot`. `marathon_readiness` is integrated at lines 4239/4320/4658/4729 sourced from `_shared/marathon-readiness/index.ts`.

### Claim 8: UI reads `exercise_log` for strength progression charts (BlockSummaryTab + StrengthSummaryView via useExerciseLog).
Phase 2 line 295.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/src/components/StrengthSummaryView.tsx:2, 19` and `/Users/michaelambp/efforts/src/components/context/BlockSummaryTab.tsx:33-34, 187-188` import `useExerciseLog` and `useAthleteSnapshot` hooks (which exist at `/Users/michaelambp/efforts/src/hooks/useExerciseLog.ts` and `useAthleteSnapshot.ts`).

### Claim 9: Marathon readiness checklist queries workout_facts (6–8 week lookback).
Phase 3.5 line 316.
**Status:** VERIFIED
**Evidence:** `_shared/marathon-readiness/index.ts` exists; `coach/index.ts:22, 4239-4320` integrates it.

### Claim 10: Per-workout analyzers slim down — analyze-running-workout reads from facts (Phase 3 final, marked DEPRIORITIZED).
Phase 3 checklist line 313.
**Status:** Doc accurate; remains true.
**Evidence:** Doc explicitly marks this as deprioritized, and code retains `analyze-running-workout` at full size (`/Users/michaelambp/efforts/supabase/functions/analyze-running-workout/index.ts` is 2700+ lines). No drift.

### Claim 11: `workout_facts.user_id REFERENCES auth.users(id) ON DELETE CASCADE`.
Line 28 (in TS DDL example).
**Status:** Minor STALE
**Evidence:** Migration `20260221_create_deterministic_layer_tables.sql:9` declares `user_id uuid NOT NULL` without an explicit FK to auth.users. RLS still enforces ownership. The shape is correct; the FK detail in the doc is illustrative SQL and didn't make it into the actual migration.

---

## docs/adr/0001-performance-attach-and-session-detail-v1.md
Last edited: 2026-05-03.

### Claim 1: `session_detail_v1` is the authoritative payload for the Performance UI; built server-side, returned by `workout-detail`, persisted into `workout_analysis` via atomic RPC.
Lines 23–28, 109.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/workout-detail/index.ts:792` calls `merge_session_detail_v1_into_workout_analysis` RPC. Migration `/Users/michaelambp/efforts/supabase/migrations/20260319000000_merge_session_detail_into_workout_analysis.sql` and `/Users/michaelambp/efforts/supabase/migrations/20260408120000_session_detail_updated_at_merge.sql` define the RPC and its `session_detail_updated_at` sibling. Builder lives at `/Users/michaelambp/efforts/supabase/functions/_shared/session-detail/`.

### Claim 2: Attach is a full-pipeline mutation — link, invalidate, re-enqueue. Stale contract returns `stale: true` or blocks.
Lines 32–43.
**Status:** VERIFIED
**Evidence:** `workout-detail/index.ts:148, 160, 163` returns `stale: true` with `stale_reason`. `useWorkoutDetail.ts:216` passes `force_refresh: true` after invalidation events; `MobileSummary.tsx:82` and `CompletedTab.tsx:258` dispatch `workout-detail:invalidate`. `useWorkoutDetail.ts:252-255` listens.

### Claim 3: Adherence shape — `execution_score`, `timing_offset_days`, `timing_label` are siblings.
Lines 50–56.
**Status:** UNCERTAIN
**Evidence:** Did not grep specific field paths; `_shared/session-detail/build.ts` is the authoritative builder. Worth a deeper check before relying on exact key names.

### Claim 4: `scope=session_detail` may serve persisted blob when not stale (vs row updated_at, optional recomputed_at, 24h TTL); `force_refresh` runs full pipeline.
Lines 110.
**Status:** VERIFIED
**Evidence:** `workout-detail/index.ts:38-44` defines `WorkoutDetailScope = 'workout' | 'session_detail' | 'full'`. Lines 1039-1080 handle force_refresh and the fast-path-vs-full-pipeline logic. Staleness check at lines 85-108 reads `session_detail_updated_at` JSONB sibling.

### Claim 5: `arc_performance` includes narrative_mode, last-race deltas, runs_since_last_race, days_until_next_block_start, next goal refs, coaching_context, plan-week snapshot.
Lines 80–85.
**Status:** Partially VERIFIED
**Evidence:** `workout-detail/index.ts:103` reads `(sessionDetail as any)?.arc_performance`. `arc-context.ts` and `_shared/session-detail/arc-performance-bridge.ts` exist. Spot checks confirm `getArcContext` is called at lines 371, 757. Did not exhaustively verify each subfield name.

### Claim 6: Course strategy resolution order — race_readiness_projection → coach_cache.payload.race_readiness → resolveGoalTargetTimeSeconds → baseline VDOT.
Line 77.
**Status:** VERIFIED
**Evidence:** `course-detail/index.ts:178, 210-234` and `course-strategy/index.ts:262, 270, 309, 323` implement that exact resolution order.

### Claim 7: Cursor rule `.cursor/rules/performance-session-contract.mdc` mirrors ADR 0001.
Lines 107.
**Status:** VERIFIED (file exists)
**Evidence:** `/Users/michaelambp/efforts/.cursor/rules/performance-session-contract.mdc` exists alongside other rules.

### Claim 8: Reference paths — `supabase/functions/_shared/session-detail/`, `supabase/functions/workout-detail/index.ts`, `useWorkoutDetail`, `UnifiedWorkoutView`, `MobileSummary`.
Lines 116–119.
**Status:** VERIFIED
**Evidence:** All five paths exist. `_shared/session-detail/` contains `build.ts`, `index.ts`, `types.ts`, `arc-performance-bridge.ts`, `forward-context.ts`, `race-readiness-llm.ts`, `readiness-load-context.ts`.

---

## docs/adr/0002-phaseblock-one-week-rows.md
Last edited: 2026-04-28.

### Claim 1: `pushBlockRange` emits one PhaseBlock per calendar week with `startWeek === endWeek === w`.
Whole ADR.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/generate-combined-plan/phase-structure.ts:385-410` — the loop `for (let w = startWeek; w <= endWeek; w++)` pushes blocks with `startWeek: w, endWeek: w`. Exactly as the ADR claims.

### Claim 2: `weekInPhaseForTimeline` in `week-builder.ts` walks phase timeline backward.
Whole ADR.
**Status:** VERIFIED
**Evidence:** `/Users/michaelambp/efforts/supabase/functions/generate-combined-plan/week-builder.ts:79` defines `function weekInPhaseForTimeline(phaseBlocks: PhaseBlock[], weekNum: number, block: PhaseBlock): number`.

### Claim 3: Don't use `weekNum - block.startWeek + 1`.
Whole ADR.
**Status:** VERIFIED (consistent with code)
**Evidence:** Since startWeek === endWeek === w, that expression always returns 1, as the ADR warns.

---

## docs/adr/README.md
Last edited: 2026-04-28.

Trivial index of ADRs 0001 and 0002 and pointer to `.cursor/rules/performance-session-contract.mdc`. Both ADRs exist; cursor rule exists. **VERIFIED.**

---

## Summary

### Doc-by-doc tally
- **APP_ARCHITECTURE.md** (20 claims sampled): ~10 verified, ~5 stale, ~3 missing, ~2 uncertain.
- **docs/PLAN-CONTRACT.md** (12 claims): ~7 verified, ~3 stale, ~2 partial/uncertain.
- **DETERMINISTIC_LAYER_ARCHITECTURE.md** (11 claims): ~9 verified, ~2 stale (file-size drift), no missing.
- **ADR 0001** (8 claims): 7 verified, 1 uncertain.
- **ADR 0002** (3 claims): 3 verified.
- **ADR README**: verified.

Aggregate: ~36 verified / ~10 stale / ~3 missing / ~5 uncertain across ~54 sampled claims.

### Most stale doc
**APP_ARCHITECTURE.md.** Last touched in November 2025, six months stale. Major systems shipped after that point are completely absent (Arc, Coach, deterministic layer, goals, course strategy, session_detail_v1). The most concrete falsifiers:
- `src/services/workoutAnalysisService.ts` no longer exists (analyzer routing moved server-side to `recompute-workout`, `ingest-activity`, `bulk-reanalyze-workouts`).
- `src/components/TodaysWorkoutsTab.tsx` no longer exists.
- `src/components/PlanSelect.tsx` is now `src/pages/PlanSelect.tsx`.
- The doc cites `analyze-swimming-workout`; actual is `analyze-swim-workout`.
- `analyze-workout/` directory is empty (dead).
- Edge-function catalog covers ~25 of 98 functions.
- `plans.config.sessions_by_week` is now a top-level column.

### Most reliable doc
**ADRs 0001 / 0002.** Recent (Apr/May 2026), narrowly scoped, every load-bearing claim has clear code evidence. ADR 0002 in particular is exact.

### Biggest red flags
1. APP_ARCHITECTURE.md as the named "comprehensive" reference (CLAUDE.md line 120) — it's misleading on routing, file paths, and edge-function inventory. A fresh agent following its file pointers will hit dead links.
2. PLAN-CONTRACT same-day matrix (§5) disagrees with the code matrix on every long-session × easy-swim or long_run × upper_strength cell. The code is stricter than the spec. Either the spec needs to relax to match code, or code needs the doc's relaxations — currently the spec lies about what the system does.
3. DETERMINISTIC_LAYER_ARCHITECTURE.md's "compute-facts ≤800 lines" budget is broken (1724 lines today). Not a correctness bug, but a quiet drift from the doc's stated discipline.

---

## Implications for CLAUDE.md

Re-read `/Users/michaelambp/efforts/CLAUDE.md`. Specific sections that need attention:

### "### Smart server, dumb client" (lines 45–49)
The framing in CLAUDE.md is already correct: "must not re-derive planned-vs-executed adherence" rather than the absolute "client never queries planned_workouts" from APP_ARCHITECTURE.md. Keep CLAUDE.md as-is; consider noting that APP_ARCHITECTURE.md overstates this.

### "### The unified week view" (lines 51–53)
Accurate. `useWeekUnified.ts` and `fetchWeekUnified.ts` paths verified. No change needed.

### "### Performance / session contract" (lines 55–59)
Accurate; ADR 0001 verified. No change needed.

### "### The Arc — deterministic intelligence layer" (lines 61–70)
Accurate — `getArcContext` exists, is loaded by `workout-detail` and others. No change needed beyond noting that APP_ARCHITECTURE.md predates this section's existence.

### "### Plan system (token DSL → materialize)" (lines 72–76)
Mostly accurate, but the line "the same-day compatibility matrix… in `docs/PLAN-CONTRACT.md` are load-bearing" is misleading because that matrix differs from the code matrix on at least four cells (long_ride×easy_swim, long_run×easy_swim, long_run×quality_swim, long_run×upper_strength). **Action:** either fix PLAN-CONTRACT §5 to match `_shared/schedule-session-constraints.ts:47-58`, or note in CLAUDE.md that the contract is aspirational on those cells. The "load-bearing" claim is risky as written.

### "### Lower-body strength placement" (lines 78–85)
Accurate — verified against `.cursor/rules/lower-body-strength-pairing.mdc` and code constraints. No change needed.

### "### JSONB everywhere" (line 93)
Pointer to `APP_ARCHITECTURE.md` for "full structure reference" is dangerous given how stale that doc is. **Action:** either freshen APP_ARCHITECTURE.md or qualify the reference (e.g. "JSONB shape examples in APP_ARCHITECTURE.md may be partially stale").

### "## Code structure" → "supabase/functions/ — ~98 edge functions" (line 105)
Accurate count (98 confirmed). No change.

### "## Reference docs" (lines 119–125)
- `APP_ARCHITECTURE.md` description "full system overview, JSONB shapes, edge-function catalog, frontend patterns" oversells it — the catalog is ~25% of current functions and the frontend-patterns section names files that no longer exist (workoutAnalysisService.ts, TodaysWorkoutsTab.tsx, PlanSelect.tsx-as-component). **Action:** add a "(stale Nov 2025; verify before relying)" qualifier, or schedule a refresh.
- `docs/PLAN-CONTRACT.md` is correctly described as the spec, but the §5 matrix needs reconciling with code.
- `DETERMINISTIC_LAYER_ARCHITECTURE.md` description is accurate; the file-size budget drift is a code-discipline issue, not a doc accuracy one.
- `EDGE_FUNCTIONS_REFERENCE.md` not audited here (out of scope) but probably worth a similar check given the catalog gap in APP_ARCHITECTURE.md.

### Net recommendation
CLAUDE.md itself is in good shape — it's the new entry doc and is largely accurate. The risk is its pointers to APP_ARCHITECTURE.md and PLAN-CONTRACT.md as authoritative references. The cleanest fix is two-step: (1) refresh APP_ARCHITECTURE.md (or replace with a thinner index doc that defers to ADRs and per-area specs); (2) reconcile PLAN-CONTRACT §5 same-day matrix with the code matrix in `_shared/schedule-session-constraints.ts`.
