# AREA — Planning engine

## What this area does (plain-language overview)

This area turns an athlete's goals + capacity into a concrete, dated training calendar and then keeps that calendar alive. It is responsible for: deciding the macrocycle (phases, taper, recovery weeks), prescribing each session's content (intervals, paces, power, swim drills, strength loads), enforcing training-science constraints (a global TSS budget, hard/easy spacing, brick caps, long-day floors, ACWR-aware load), deciding what day each session lands on (the week-optimizer), expanding tokens into materialized `planned_workouts` rows, and managing the plan lifecycle (activate / adapt / pause / resume / end / delete / reschedule). Plan generation is deliberately **fragmented across four separate edge functions** that share only the `PlanContractV1` contract; the multi-sport `generate-combined-plan` is the most active and most science-heavy surface. Day-placement was consolidated on 2026-05-09 so that `_shared/week-optimizer.ts` is the sole authority for "what day does X go on" — but only `generate-combined-plan` routes through it; the other three generators have their own pipelines.

Note on coverage honesty: the four generators total ~270 KB of code (`week-builder.ts` 119 KB, `session-factory.ts` 108 KB, `science.ts` 42 KB are not read line-by-line); this audit maps the orchestration, the science formulas, the lifecycle, and the scheduling authority exhaustively, and maps the non-combined generators and materialization at the function/branch level. Session-content internals inside `week-builder.ts`/`session-factory.ts` (exact interval prescriptions per phase) are summarized, not enumerated.

## Features / flows

### Combined (multi-sport) plan generation — `generate-combined-plan`
- **What it does:** Generates one unified plan integrating two or more concurrent events (e.g. a 70.3 + a tune-up race) under a single TSS budget, with globally-enforced hard/easy, brick placement, and multi-event taper.
- **How it works:** `generate-combined-plan/index.ts` (`@ts-nocheck`, 41 KB) is the orchestrator. Pipeline: (1) input validation (`user_id`, ≥1 goal, `current_ctl`, `weekly_hours_available` all required, else 400); (2) derive loading pattern from `training_intent` via `loadingPatternForIntent`; (3) D-033 run-easy-pace reconciler mutates `state.learned_fitness` in-place (best-effort, swallows exceptions); (4) read longest run/ride in last 30 days from `workouts` for history-aware long-day floors (`effectiveFloor = max(specFloor, recent × 0.5)`); (5) `promote703SwimIntentForCutoffRisk`; (6) **`reconcileAthleteStateWithWeekOptimizer`** populates day-assignment fields on `AthleteState` (self-short-circuits if `long_run_day` missing); (7) `buildPhaseTimeline` → `applyLoadingPattern`; (8) `generateAllWeeks` loops `buildWeek` per week, threading prev-week weighted TSS and a 1-week drill-token memory set (`harvestSwimDrillTokensFromWeek`, Q-015); (9) **physiological-floor rebuild loop** (up to 12 `'normal'` passes via `tightenPhaseBlocksForFloorRebuild`, then one `'deep'` pass; `enforceLongDayFloors` runs unconditionally each pass); (10) §8.4 race-day hard invariant (`findMissingRaceDaySessions` → 500 if breached); (11) soft `validatePlan`; (12) serialize `sessions_by_week`, build `plan_contract_v1`, optionally prepend an assessment week; (13) preview returns without DB write (runs `resolveWeekConflicts` server-side for UI), else inserts `plans` row with `status:'active'`.
- **Inputs / outputs:** IN — `CombinedPlanRequest` (`user_id`, `goals[]`, `athlete_state`, `athlete_memory`, `start_date`, `generation_trade_offs`, `arc`, `preview`). Reads `workouts` (30-day longest). OUT — `plans` row (`sessions_by_week` top-level column, `config` = `plan_contract_v1` + `athlete_snapshot` + `user_selected_start_date`), plus `week_trade_offs` / `conflict_events` / `validation`. Preview writes nothing.
- **Triggers:** Called by `create-goal-and-materialize-plan` (combined mode) and the Arc/goal wizard (preview loop).

### Run-only plan generation — `generate-run-plan`
- **What it does:** Generates run-focused plans in two flavors: `sustainable` (Hal Higdon-style completion) and `performance_build` (Jack Daniels VDOT-style).
- **How it works:** `index.ts:44-429` validates → selects `SustainableGenerator` or `PerformanceBuildGenerator` → `overlayStrengthLegacy()` places strength → `timing-logic.ts` adds AM/PM annotations → inserts plan with `plan_contract_v1`. `effort-score.ts` holds the **only VDOT table** (34 entries, VDOT 30–85) and converts race time→VDOT→paces (sec/mi). Does NOT route through the week-optimizer.
- **Inputs / outputs:** IN — `GeneratePlanRequest` (distance 5k/10k/half/marathon, fitness, approach, days_per_week, strength_frequency/protocol, effort_score/effort_paces, recent_long_run_miles, acwr). OUT — `plans` row + preview; upserts `user_baselines.effort_score`/`effort_paces` for performance_build (non-fatal).
- **Triggers:** `create-goal-and-materialize-plan` (run mode).

### Triathlon plan generation — `generate-triathlon-plan`
- **What it does:** Multi-sport plan generation independent of the combined engine; `base_first` vs `race_peak` approaches.
- **How it works:** `index.ts:31-200` validates → resolves approach (from `goal`: complete→base_first, performance→race_peak) → `TriathlonGenerator` → saves with `plan_contract_v1`. Pins athlete snapshot at generation. Does NOT route through the week-optimizer.
- **Inputs / outputs:** IN — `GenerateTriPlanRequest` (sprint/olympic/70.3/ironman, ftp, swim_pace_per_100_sec, limiter_sport, swim_equipment, preferred_days, existing_run_days). OUT — `plans` row + `TriPlanPreview`.
- **Triggers:** `create-goal-and-materialize-plan` (tri mode).

### Validation-only stub — `generate-plan`
- **What it does:** 71-line endpoint that validates 5 required fields (`distance`, `disciplineFocus`, `strengthTraining`, `trainingFrequency`, `weeklyHours`) and returns 200/400. No DB writes, no routing to the real generators. Appears orphaned (see Discrepancies).

### Orchestration wrapper — `create-goal-and-materialize-plan`
- **What it does:** Top-level wrapper (3039 lines). Creates or links a goal, dispatches to the correct generator, optionally materializes, recomputes race projections.
- **How it works:** Three modes — `create` (new goal + plan), `build_existing` (update + replace), `link_existing` (attach). Resolves Arc context, infers run/bike/swim fitness, computes post-race recovery, resolves week-optimizer anchors, then dispatches to `generate-combined-plan` / `generate-run-plan` / `generate-triathlon-plan`. Supports `preview` (no writes) and `ephemeral_conflict_preferences` (in-memory conflict loop). Day-count gates are delegated to each generator — no wrapper-level enforcement.
- **Triggers:** Goal wizard submit.

### Token expansion / materialization — `materialize-plan`
- **What it does:** Expands `planned_workouts.steps_preset` tokens into `computed.steps` with concrete paces/power/swim targets + duration. (2888 lines, `@ts-nocheck`.)
- **How it works:** For each row: load baselines + athlete_snapshot → resolve run paces via a **5-tier hierarchy** (snapshot-pinned → `effort_paces` → `learned_fitness` → `performance_numbers` → hardcoded defaults: easy 10:00/mi, threshold 7:00/mi, fiveK 6:00/mi) → expand each token (regex parse reps/distance/pace_ref/rest) → apply tolerance ranges → for strength resolve 1RM + protocol progression → for swim apply equipment gates. Plan adjustments from `plan_adjustments` apply by date window (priority: `weight_offset` > `absolute_weight` > `adjustment_factor`).
- **Inputs / outputs:** IN — plan_id or single workout_id; `user_baselines`, `athlete_snapshot`, `plan_adjustments`. OUT — writes `computed.steps` + duration to `planned_workouts`.
- **Triggers:** `activate-plan` (blocking), `adapt-plan` (after adaptations), `ensure-planned-ready` (on-demand).

### Activation (template → calendar) — `activate-plan`
- **What it does:** Materializes `sessions_by_week` into dated `planned_workouts` rows.
- **How it works:** Idempotent (deletes existing rows first). Start date priority: override → `config.user_selected_start_date` → next Monday; anchored to `mondayOf(startDate)`. Splits `brick` discipline into ride + run rows (half duration each). Estimates workload (TRIMP if maxHR, else duration×intensity). Applies coaching notes once at activation (adjacency / density / no-mid-week-rest detection). Calls `materialize-plan` (blocking, rolls back inserts on failure), then fire-and-forget `auto-attach-planned` over a −30..+365 day lookback.
- **State transition:** any → `active` (implicit; status not set here); planned_workouts: none → inserted (`workout_status:'planned'`).

### Adaptation — `adapt-plan`
- **What it does:** Generates strength/endurance adaptation suggestions and applies safe auto-adaptations. Actions: `suggest`, `accept`, `dismiss`, `auto`, `auto_batch`.
- **How it works:** `auto` is the fire-and-forget from ingest and is **safe by design** (index.ts:16-20): logging a workout doesn't mutate `sessions_by_week`/run shape, so the schedule signature is unchanged → `persistStrengthRelayoutIfNeeded` is a no-op. Auto adaptations: strength progression (needs 3+ sessions, 1RM gain ≥ protocol min, RIR deviation, `phase.allowProgress`), strength deload (factor 0.9), endurance pace/FTP auto-update (only when learned confidence='high' and delta ≥7%). `auto_batch` (cron, `cron_secret`) iterates active-plan users capped at 250 (max 5000). Strength relayout rebuilds one week's strength only when the run-schedule fingerprint changed.
- **State transition:** `plan_adjustments` none→active / active→expired; `plans.config` (sig + relayout meta); `plans.sessions_by_week[week]` replaced on relayout; `user_baselines.performance_numbers` (pace/FTP) on accept.

### Pause / Resume / End / Delete — `pause-plan`, `resume-plan`, `end-plan`(+`end-plan-core`), `delete-plan`
- **What it does:** Lifecycle transitions on `plans.status` (`active`/`paused`/`ended`/`completed`).
- **How it works:** **Pause** → status='paused', `paused_at=now`, DELETE future `planned_workouts` (date ≥ today). **End** → status='ended', writes a `config.tombstone` (weeks_completed, completion_pct, peak_long_run_miles, peak_weekly_miles, peak_acwr from last 8 snapshot weeks), DELETE future rows; idempotent if already ended/completed. **Resume** → recalculates `new_start_date = mondayOf(today) − (resume_from_week−1)×7` so the current week aligns; clears tombstone, appends `resume_history`, reactivates linked goal; resume week priority: request → tombstone.weeks_completed → latest completed week → 1; clamped [1, totalWeeks]. **Delete** → hard DELETE of `plans` + `planned_workouts` (by `training_plan_id` OR `template_id`), nulls `goals.race_readiness_projection`, invalidates caches, recomputes race projections.

### Reschedule validation — `validate-reschedule`
- **What it does:** Read-only validation when a user drags a session to a new date; returns severity (green/yellow/red) + reasons + suggestions + coach options.
- **How it works:** Classifies workout (intensity, long, strength focus, purpose), estimates workload (`durationHours × IF² × 100`; strength fixed 50-80), then checks a rule battery: `read_only` (completed/in_progress → RED), plan-structure conflict, same-type conflict, plan-date-drift (>7 days), hard-consecutive / hard-within-2-days, long-adjacent, long+lower-strength same day, lower-strength 48-72h spacing, upper-strength consecutive, workload cap (120 normal / 140 peak) and high-watermark (80/100). Recovery/taper weeks relax hard/long spacing. Generates up to 3 scored alternative dates. Writes nothing.

### Readiness assessments — `marathon-readiness`, `race-readiness` (+`projection-facts`)
- **What it does:** `marathon-readiness` is a 6-8 week-lookback checklist (long-run distance ≥85% peak, weekly volume ≥75%/60% taper, quality work, ACWR durability). `race-readiness` projects finish time (threshold pace → VDOT → race distance), compares to goal, flags durability (HR drift / decoupling). Consumed via Arc context / goal projections.

### Workload calculation — `calculate-workload`, `weekly-workload`, `batch-recalculate-workloads`, `backfill-planned-workload`
- **What it does:** Compute per-workout / per-week training load. `_shared/workload.ts` holds the intensity-factor tables and the planned-workload estimator; `_shared/session-load.ts` builds the per-domain decaying load model (aerobic / muscular / glycolytic / neuromuscular). `_shared/acwr-state.ts` interprets ACWR ratios into status labels.

## Edge cases & conditional handling

**Plan generation (combined):**
- `totalWeeks < 2` → 400 "Not enough time" (index.ts:233). `totalWeeks >= 1` gate guards the debug log only.
- Physiological-floor rebuild: up to 12 `'normal'` passes, then one `'deep'` pass; if still failing → 400 with `physiological_floor_violations` + bust cache (index.ts:346-390). Hints differ for `LONG_RUN_TSS_SHARE` vs `WEEK_OVER_WEEK_TSS_RAMP`.
- §8.4 race-day invariant breach → 500 (engine bug, not athlete-actionable) (index.ts:441-452).
- D-033 run-pace reconciler is wrapped in try/catch and **falls through with the baseline value on any exception** (index.ts:145-149); no-op when both inputs absent.
- 30-day longest read failure (no service role / network) → `recent_longest_*` = 0, spec floor wins (index.ts:156-199).
- Assessment week: when `assessment_week_preference === 'assessment_first'`, all weeks shift +1 and week 1 is replaced with `buildAssessmentWeekSessions` (tri → swim/bike/run; run-only → run) (index.ts:513-545).
- Quality-run rescue: optimizer can report "quality_run not placed" while the builder still lands structured quality from Arc defaults → a fallback trade-off is surfaced and the `quality_run_unplaced` persisted trade-off is filtered out (index.ts:518-549).
- `plans.start_date` column does **not exist** (D-074): the canonical anchor lives only at `config.user_selected_start_date` (index.ts:758-765).

**Day placement / scheduling (week-optimizer):**
- Reconciler self-short-circuits and returns state unchanged when `long_run_day` is missing (`reconcile-athlete-state-week-optimizer.ts:232-235`) → week-builder's legacy strength fallback fires.
- `bikes_per_week < 3` → easy_bike dropped entirely (not a conflict); `runs_per_week < 3` → easy_run dropped (`week-optimizer.ts:1320,1371`).
- Co-equal 2× strength that can't fit → `deriveOptimalWeekWithCoEqualRecovery` retries at 1×, sets `strength_sessions_cap=1`, emits a transparent recovery line (`week-optimizer.ts:2083-2139`).
- §4.7 strength spacing tier ladder (CLEAN→SOFT→SANDWICH, each at 3-day then 2-day) — first passing tier wins (`week-optimizer.ts:1604-1627`).
- Masters-swim anchor refused on a rest day (D-064) → falls through to preference loop so swim count doesn't silently drop (`week-optimizer.ts:1142-1150`).
- Load balancer never moves a session INTO a rest day (D-066); never moves anchors.
- Swim placement enforces ≥2 calendar-day separation (`violatesMinimumSwimSpread`); if a swim can't place it reduces frequency rather than fatal-erroring.
- No `quality_bike` anchor (D-086) → no hardcoded Wednesday fallback; optimizer places algorithmically (Tue/Wed/Thu).
- Collision resolver (`resolve-schedule-collisions.ts`) is distance-tuned (sprint/olympic allow long-stack + 2 sessions/day; 70.3/140.6 forbid long-stack, 3/day); throws `SCHEDULE_GRIDLOCK_*` when no day exists; fallback drops one easy_swim and retries once.

**Training science (science.ts):**
- ACWR cold-start: `chronicLoad ≤ 0` → ACWR `null` (compute-snapshot:366-368; same for running/cycling discipline ACWR).
- CTL ramp ceiling scales by current CTL (≤45/≤70/≤100/>100 tiers); CTL is a 42-day EMA (`ALPHA_CTL ≈ 0.0235`).
- Taper weeks by distance × priority (A/B/C), default 2 weeks if distance unknown (`taperWeeks`, science.ts:842-850). Taper long-run floor 0.45× peak; taper zone dist 83/7/10; 1 brick/week in taper.
- Post-race mandatory recovery days by distance × priority (e.g. 70.3-A = 14 days), min 1 week.
- Brick run miles = `raceRunMiles[distance] × phaseMultiplier`, clamped [1.5, 8] mi, 0.5-mi rounding; within-phase lerp ramp (base 15→20%, build 25→30%, race_specific 36→42%). D-031 rebuild throttle floors at peak-of-base.
- Brick caps 0 in base/recovery/rebuild (no concurrent bricks while rebuilding).
- Run-pace reconciliation (D-033) requires BOTH a streak gate (2 wk worsening / 4 wk improving) AND a median gate, plus an ACWR ≤ 1.3 gate on worsening only; baseline unusable if `confidence='low'` or `sample_count < 2`.
- Loading patterns: `loadingPatternForIntent` overrides athlete pin — completion→2:1, first_race/comeback→1:1, performance→pin or 3:1. Recovery week ratio 0.65 across all patterns. Phase `tssMultiplier`: taper 0.65 (ramped down 0.10/wk, floor 0.45), recovery 0.45, rebuild 0.85, else 1.0.

**Run-plan generator:**
- `performance_build` with no effort_score/paces → 400 hard-reject (index.ts:96-106); `sustainable` uses descriptive text, no effort tokens.
- Duration minimums per distance/fitness (validation.ts:136-158): marathon 6 wk (with base) / 14 wk (beginner no base); half 4/8; 10k/5k 4. Compressed durations warn (non-blocking).
- Legacy strength-protocol IDs auto-normalize to canonical at request time (validation.ts:104-116; TODO to remove after 2025-03-01, still present).
- `MARATHON_DURATION_REQUIREMENTS` table (types.ts:450-542) exists but is NOT consumed at generation time (see Discrepancies).

**Materialization:**
- No baselines → 5-tier fallback ends at hardcoded conservative paces; missing `swim_pace_per_100_sec` → `DEFAULT_SWIM_PER100_SEC = 120` (2:00/100yd); strength 1RM falls back to hardcoded anchors (e.g. 185 lb squat); learned 1RM ignored if confidence < 0.7.
- Plan adjustment date outside window → skipped; fuzzy exercise-name match fail → unadjusted weight; deload week 4n × 0.9 (performance only, not durability).
- Swim drill tokens gated by `filterSwimDrillTokensByGear`; materializer does NOT re-gate (assumes tokens pre-vetted).

**Lifecycle:**
- Pause/end on a plan with no future workouts → deleted_count 0, success. End already-ended/completed → success, tombstone null. Resume on active → 400; resume_from_week clamped. `end-plan-core.ts:75-77` divides `run_long_run_duration` by `easyPaceSec` with no zero-guard (potential NaN — see Discrepancies).
- `delete-plan` resolves goal IDs from `config.plan_contract_v1.goals_served` (all) or `plans.goal_id`.

**Reschedule:** workout not 'planned' → RED; recovery/taper relaxes hard/long spacing; coach-brain integration non-fatal.

## Redundancies / duplication (observed, not judged)

- **Four plan generators with overlapping logic** (`generate-plan`, `generate-run-plan`, `generate-triathlon-plan`, `generate-combined-plan`). Each re-implements phase calculation, day-count gates, strength integration, and (run vs tri) pacing. Only the combined engine uses the week-optimizer.
- **VDOT table lives only in `generate-run-plan/effort-score.ts`** — `race-readiness` does its own threshold-pace→VDOT reverse lookup; no shared VDOT service.
- **Pace resolution is implemented at least 4 times**: `effort-score.ts` (race→VDOT→paces), `materialize-plan` (5-tier hierarchy), client `normalizer.ts` (parse mm:ss strings), `race-readiness` (learned→effort→perf). All independently.
- **ACWR computed in ≥3 places**: overall in `compute-snapshot`, discipline-weighted (running/cycling) in `coach/index.ts` using `body-response.ts` fatigue weights, and interpreted in `_shared/acwr-state.ts`. Thresholds also restated across these.
- **Planned-workload estimator** (`estimatePlannedWorkload`) duplicated between `activate-plan/index.ts:18-37` and `_shared/workload.ts` (same TRIMP-or-duration×intensity formula).
- **TSS impact multipliers** (run 1.3 / bike 1.0 / swim 0.8 / strength 0.5) appear both in `science.ts` constants and hardcoded again in `plan_contract_v1.tss_science` (index.ts:622-628) and in `buildDescription` prose.
- **Same-day compatibility logic** exists as the matrix in `schedule-session-constraints.ts` (used by the optimizer) AND as distance-tuned coarse rules in `resolve-schedule-collisions.ts` (used by tri collision path) — overlapping but not identical rule sets.
- **`plan-week.ts`, `planning-context.ts`, `plan-context.ts`** are three separate planning-context shapes (not consolidated).

## Discrepancies & flags (for human review)

1. **`generate-plan` appears orphaned.** 71-line validation-only stub that returns 200/400 but never routes to a generator and has no caller wired to it in this area. Trigger/consumer unclear from code. (generate-plan/index.ts)
2. **`MARATHON_DURATION_REQUIREMENTS` table is defined but not consumed at generation time** (generate-run-plan/types.ts:450-542). The min-weekly-miles / peak-long-run / taper-weeks values are not enforced when the plan is built; only the simpler per-distance duration minimums in `validation.ts` gate generation. Looks dead or deferred.
3. **Day-count gates are fragmented and partly aspirational.** `docs/DAY-COUNT-GATES.md` describes a wizard-side gate (`computeSessionFrequencyDefaults` in `src/lib/session-frequency-defaults.ts`) marked SPEC DRAFT, blocked on Theme B. Each generator independently validates minimum weeks; no central enforcer. The work order's named `_shared/session-frequency-defaults.ts` does **not exist** — only the `.test.ts`; the real implementation is client-side at `src/lib/session-frequency-defaults.ts`.
4. **Possible NaN in end-plan tombstone.** `end-plan-core.ts:75-77` computes peak long-run miles as `run_long_run_duration × 60 / easyPaceSec` with no guard for `easyPaceSec` 0/missing. Could write NaN into the tombstone. (Describing what is; not a fix.)
5. **No race-date vs duration cross-check in run/tri generators.** Validation confirms `race_date` is in the future but doesn't compare it to `duration_weeks`; a 16-week plan can be requested with only days to the race (generate-run-plan).
6. **Legacy strength-protocol normalization carries a stale removal TODO** ("remove after 2025-03-01", date already past) and only `generate-run-plan` is confirmed to normalize legacy IDs — whether tri/combined normalize legacy protocol IDs before strength lookup is unverified from code (validation.ts:103).
7. **`materialize-plan` and `create-goal-and-materialize-plan` are `@ts-nocheck` + very large** (2888 / 3039 lines). Type errors surface only at runtime; the 5-tier pace fallback can silently land on `learned_fitness` (possibly stale) when snapshot is absent — intentional vs bug is unclear from code.
8. **Cursor-rule drift (already known):** `.cursor/rules/lower-body-strength-pairing.mdc` vs the code matrix on `lower_body_strength × easy_run` (now ✓ in code per the May 12 flip). Reconciled in SCHEDULING-RULES.md §8 conditional; cursor rule itself not reconciled.
9. **`PLAN-CONTRACT.md` superseded** (per CLAUDE.md): its §5 same-day matrix disagrees with the code matrix on 4 cells. The current authority is `schedule-session-constraints.ts` ROWS (lines ~123-134) + `SCHEDULING-RULES.md`/`-EXTRACTED.md`.
10. **`PlanContractV1` is defined in `generate-run-plan/types.ts:184`** despite being the shared contract for all four generators — a naming/location surprise, not a bug.
11. **Validation is soft in the combined engine** (index.ts:472-476): `validatePlan` failures are logged but generation proceeds; a comment notes "Future: return 400 for critical failures once the engine is battle-tested." Hard fails are left to the type system + the separate floor/race-day invariants.

## Cross-references

- **Decisions:** D-006 (AM/PM ordering), D-017 (strength provenance split), D-018 (QR+lower trade-off owner), D-019 (race-week protocol), D-021/Q-005 (endurance-hours TSS budget), D-027 (within-phase long-run floor), D-031 (rebuild-mode throttle), D-033 (run-pace reconciler), D-043 (beginner swim substitution), D-044/Q-015 (drill repeat memory), D-048 (trade-off threading), D-061 (loading pattern from intent), D-064/D-066 (rest-day collision/balancer), D-068 (full-IM ramp ceiling), D-072 (per-week trade-off filter), D-074 (plan start_date anchor), D-086 (no Wednesday fallback), D-087 (validator endurance hours), Q-011 (no hard long-ride floor), Q-012 (easy-run+lower recovery flush), Q-020 (swim ankle-band pairing).
- **Specs:** `SCHEDULING-RULES.md` (prescriptive placement) + `SCHEDULING-RULES-EXTRACTED.md` (descriptive); `BRICK-PROTOCOL.md`; `RACE-WEEK-PROTOCOL.md` §8 (implemented); `SESSION-FREQUENCY-DEFAULTS.md`; `CONSOLIDATED-MODE.md` (Theme B, draft); `DAY-COUNT-GATES.md` (Theme C, draft, blocked); `FTP-COLD-START-SPEC.md` (draft); `STRENGTH-PROTOCOL.md` §3.7/§7.4; `SWIM-PROTOCOL.md`.
- **Other audit areas:** 03-spine-snapshot (athlete_snapshot, ACWR substrate, arc-context), 05-compute-contracts (`session_detail_v1`, resolvers, compute-facts), 07-baselines (`user_baselines` pace-unit footgun, FTP cold-start), 01-ingestion (the `adapt-plan action=auto` fire-and-forget from ingest fan-out).
- **Superseded:** `PLAN-CONTRACT.md` (do not use for placement). `APP_ARCHITECTURE.md` stale.
