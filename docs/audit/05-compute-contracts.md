# AREA — Compute & contracts

> Read-only reverse-documentation. Describes what the code *does*, not what it *should* do.
> File:line citations are to the state of the repo at audit time (2026-06-16). Where a
> behavior could not be determined from code, it is marked "unclear from code".

## What this area does (plain-language overview)

This area is the **contract layer between raw sensor/analyzer output and the client**. Four
deterministic edge functions write the canonical per-workout/per-week shapes (`compute-workout-summary`
→ `workouts.computed`; `compute-facts` → `workout_facts` + `exercise_log` + `session_load`;
`compute-adaptation-metrics` → `workouts.computed.adaptation`; `compute-snapshot` → `athlete_snapshot`).
On top of those, a set of small **scalar resolvers** (`resolveRunScalars`, `resolveSwimScalars`,
`rideComputedNp`, `resolveRunGap`, `resolveRunDecoupling`) exist to enforce *single-sourcing*: every
surface that shows a workout's pace/HR/NP reads the same guarded value instead of re-deriving it.
The headline product of the area is **`session_detail_v1`** — a ~30-field, fully pre-formatted display
contract assembled server-side by `workout-detail` and rendered verbatim by the client (the "smart
server / dumb client" invariant). The **fact packet** (`FactPacketV1`, persisted at
`workout_analysis.fact_packet_v1`) is the deterministic input contract that feeds both the narrative
LLM and `session_detail_v1`. Area 2 documents the *science* inside these packets; this doc documents
their *shapes* and *who produces vs. consumes each field*.

## Features / flows

### compute-workout-summary → `workouts.computed`
- **What it does:** Turns raw sensor samples / laps into the canonical per-workout `computed` JSONB
  (intervals, overall rollups, quality flags). The sensor-derived layer.
- **How it works:** HTTP handler `{ workout_id }` (`compute-workout-summary/index.ts:627`). Takes an
  advisory lock `compute-summary:<id>` (`:637`); if already held, skips (`:641-646`). Sets
  `summary_status='processing'` (`:650`), normalizes samples (falling back to `garmin_activities`
  samples_data if `workouts.sensor_data` empty, `:704-730`), windows intervals from `laps` or
  auto-splits (1 km for run/swim, 60 s for ride/walk, continuous otherwise, `:1264-1307`), computes
  adherence + aerobic-decoupling execution score, then writes via RPC `merge_computed`
  (`:918-923`, version int `1003`).
- **Inputs / outputs:** Reads `workouts` (sensor_data, laps, swim_data, pool fields, scalars,
  weather_data; `:656-659`), `planned_workouts` (`:678-682`), `garmin_activities` fallback
  (`:706-710`). Writes `workouts.computed` (shape below), `workouts.summary_status` /
  `summary_updated_at` / `summary_error` / `normalization_version='v1'`.
- **Triggers:** Called by `ingest-phone-workout`, `save-imported-workout`, `auto-attach-planned`,
  `ingest-activity`, `ensure-planned-ready`, `recompute-workout`.

`computed` shape (`:2160-2176`): `{ version: "v1.0.4", intervals[], planned_steps_light[], overall{
duration_s_moving, distance_m, avg_pace_s_per_mi, gap_pace_s_per_mi, max_speed_mps, execution_score,
avg_cadence_spm, max_cadence_spm, avg_vam, hot_conditions? }, quality{ mode, steps_confident,
steps_total }, analysis? (preserved from compute-workout-analysis, `:2180-2183`) }`. Each interval:
`{ index, label, planned_label?, type, subtype, duration_s, distance_m, avg_pace_s_per_mi,
gap_pace_s_per_mi, avg_hr_bpm, avg_cadence_spm, avg_power_w, moving_time_s, elapsed_time_s,
stride_length_m, + conditional efficiency_factor / intensity_factor / pace_per_100m / adherence_pct /
power_adherence_pct / pass / pass_state / stepIdx }`.

### compute-facts → `workout_facts` (+ `exercise_log`, `session_load`, terrain/route tables)
- **What it does:** Produces the deterministic, AI-free per-workout fact row plus the strength
  exercise ledger and (for runs) terrain/route intelligence.
- **How it works:** HTTP handler `{ workout_id }` (`compute-facts/index.ts:1503`). Reads the workout +
  baselines + planned row, branches by discipline into `buildRunFacts` / `buildRideFacts` /
  `buildSwimFacts` / `buildStrengthFacts`, upserts `workout_facts` (`:1632-1634`, `version:1`),
  DELETE+INSERT `exercise_log` (`:1685`,`:1729`), and calls `rewriteSessionLoad()` (`:1765`).
- **Inputs / outputs:** Reads `workouts`, `user_baselines.{performance_numbers,learned_fitness,age}`,
  `planned_workouts`, `exercises` registry. Writes `workout_facts`, `exercise_log`,
  `user_baselines.learned_fitness.strength_1rms` (fire-and-forget, `:1749-1751`), `session_load`, and
  for runs: `workout_terrain_profile`, `terrain_segments`, `workout_segment_match`,
  `segment_progress_metrics`, `route_clusters`, `workout_route_match`, `route_progress_metrics`.
- **Triggers:** `ingest-activity:1431`, `backfill-facts`, `recompute-workout`, `ensure-planned-ready`.

`workout_facts` shape: top-level `{ workout_id, user_id, date, discipline, duration_minutes, workload,
session_rpe, readiness, plan_id, planned_workout_id, adherence, run_facts, strength_facts, ride_facts,
swim_facts, computed_at, version:1 }`. `run_facts` (`:1082-1171`): distance_m, pace_avg_s_per_km, hr_avg,
elevation_gain_m, time_in_zone{z1..z5}, hr_drift_pct, pace_at_easy_hr, efficiency_index, intervals_hit,
intervals_total, terrain_context. `ride_facts` (`:1174-1257`): adds normalized_power, intensity_factor,
efficiency_factor, power_curve. `swim_facts` (`:1260-1279`): distance_m, pace_per_100m (moving_time
preferred over analysis). `strength_facts` (`:1376-1397`): total_volume_lbs, total_sets, total_reps,
exercises[{name, canonical, sets_completed, best_weight, best_reps, avg_rir, volume, estimated_1rm,
planned_*}], muscle_groups{}, density_lbs_per_min.

### compute-adaptation-metrics → `workouts.computed.adaptation`
- **What it does:** Cheap per-workout adaptation classification (long-run efficiency, easy-Z2 aerobic
  efficiency, strength anchor e1RMs).
- **How it works:** Reads `workouts` row + `user_baselines`, classifies, merges
  `computed.adaptation` via `merge_computed` (`compute-adaptation-metrics/index.ts:462-467`,
  `COMPUTED_VERSION_INT=1003`). All errors caught non-fatal (`:481-490`).
- **Inputs / outputs:** Reads `workouts` (`:321-325`), `user_baselines` (`:339-347`). Writes nested
  `computed.adaptation { data_quality, confidence, computed_at, + discipline-specific }`.
- **Triggers:** `ingest-activity:1557-1576` (fire-and-forget HTTP fetch).

### compute-snapshot → `athlete_snapshot`
- **What it does:** The weekly aggregate substrate. Rolls 5 weeks of facts + exercise_log into one
  `athlete_snapshot` row keyed by `user_id`+`week_start`; carries `state_trends_v1` (the spine verdict).
- **How it works:** Reads `workout_facts` (5 wk, `:308-320`), `exercise_log` (5 wk, `:325-334`),
  `planned_workouts`, `readiness_checkins`. Computes per-discipline aggregates + trends, assembles
  `state_trends_v1` (current week only), single UPSERT (`:651-691`). CTL/ATL/TSB written separately
  via non-fatal UPDATE (`:706-744`).
- **Inputs / outputs:** see above. Writes ~30 columns incl. `state_trends_v1` (version 1),
  `workload_by_discipline`, `strength_top_lifts`, `interference`, `intensity_distribution`, etc.
- **Triggers:** `recompute-workout:137`, `generate-training-context:645`. (Area 3 owns the spine in
  full; here it is documented only as a contract producer.)

### The scalar resolvers (single-source enforcement)
- **resolveRunScalars** (`_shared/run/run-scalars.ts:53`): the ONE entry for a run's pace+HR. Returns
  `{ paceSecPerMi, paceSecPerKm (derived, not independent), avgHr, distanceMeters, movingSeconds }`.
  Delegates to `resolveOverallPaceSecPerMi` / `getOverallAvgHr` / `resolveOverallDistanceMi` /
  `resolveMovingDurationMinutes` in `_shared/fact-packet/` — guards live there. Authoritative layer is
  `computed.overall` (D-182 keeps non-swims on computed). 0 HR → null (Q-054/D-112). Also exports
  `resolveRunGap` (read-through only; NEVER recomputes GAP — honest null, `:72-79`, D-185) and
  `resolveRunDecoupling` (reads `workout_analysis.heart_rate_summary`, D-036, `:86-94`).
- **resolveSwimScalars** (`_shared/swim/swim-scalars.ts:33`): the ONE entry for a swim's
  moving/elapsed/distance/HR. Reads RAW `workouts` columns, NOT `computed.overall` (D-182 — sample
  layer produced moving>elapsed). `minutesOrSecondsToSeconds`: values <1000 treated as MINUTES, else
  seconds (`:27-31`). Returns `{ movingSeconds, elapsedSeconds, distanceMeters, avgHr }`.
- **rideComputedNp** (`_shared/cycling-v1/np-trend.ts:26`): resolves a ride's NP for the np_trend
  series. Candidate order mirrors `compute-facts:1124` (`normalized_power` column →
  `computed.analysis.power.normalized_power` → defensive fallbacks). Returns rounded watts or null.

### session_detail_v1 (the display contract)
- **What it does:** A ~30-field, server-computed, render-ready Performance-tab payload. Client renders
  verbatim with no local math.
- **How it works:** Type at `_shared/session-detail/types.ts:63`. Built by `buildSessionDetailV1(input)`
  (`_shared/session-detail/build.ts:153`), invoked from `workout-detail/index.ts:623` inside
  `runSessionDetailPipelineAndPersist`. Post-build enrichments (`race_readiness`, `forward_context`,
  `previous_strength_by_exercise`) are added in `workout-detail` after build, then persisted via RPC
  `merge_session_detail_v1_into_workout_analysis` (`:940`). The builder is synchronous; LLM blocks are
  attached afterward.
- **Inputs / outputs:** 23-field `SessionDetailInput` — ledger/snapshot slice (ledgerDay, actualSession,
  match, plannedSession, plannedRowRaw), `workoutAnalysis` (perf, session_state_v1, fact_packet_v1,
  granular_analysis, detailed_analysis, adherence_summary), `narrativeText`, `completedComputed`,
  `completedSwimScalars` (D-182), `completedRunScalars` (D-185), readiness, arcPerformance, weatherTempF,
  disciplineTrend. Output: `SessionDetailV1`.
- **Triggers:** Performance-tab fetch (`scope='session_detail'`) from `useWorkoutDetail.ts:198-231`.
  Also persisted-and-served on recompute / attach. Top-level fields and their producers:
  `version/generated_at/workout_id/date/type/name` (`build.ts:617-622`); `plan_context` (`:624-646`);
  `execution` (`:648-657`); `observations`, `narrative_text`, `coaching_note`, `arc_performance`,
  `race_debrief_text`, `race`, `summary` (`:659-669`); `completed_totals` (`:671`, D-182/D-185);
  `planned_totals` (`:672`); `weather` (`:673-675`); `analysis_details` (`:677`); `adherence`
  (`:679-683`); `intervals` / `intervals_display` (`:685-689`); `classification` (`:691-730`);
  `splits_mi`, `pacing`, `trend` (`:732-894`); `discipline_trend` (`:896`, pass-through);
  `next_session` (`:898`); `terrain` (`:900-926`); `display` (`:928-932`); strength_* (`:934-948`);
  `readiness` (`:949-952`); `session_interpretation` (`:953-966`, deterministic);
  `race_readiness` (null in builder; populated in `workout-detail:766-776`).

### The fact packet as a contract
- **What it does:** `FactPacketV1` (`_shared/fact-packet/types.ts:176`, `version:1`) is the
  deterministic per-workout fact contract — the input both to the narrative LLM and to
  `session_detail_v1`.
- **How it works:** Built by `buildWorkoutFactPacketV1()` (`_shared/fact-packet/build.ts:246`).
  `analyze-running-workout:2033` and `analyze-cycling-workout:1927` (a cycling variant) call it and
  persist to `workout_analysis.fact_packet_v1`. Consumed by `session-detail/build.ts:185` (70+ reads),
  `session-detail/race-readiness-llm.ts`, and `coach/index.ts`.
- **Inputs / outputs:** `facts{}` (distance/duration/pace/HR/terrain/segments/weather/plan/athlete_reported)
  + `derived{}` (drift family, decoupling, training_load, comparisons.vs_similar/trend/achievements,
  stimulus, primary_limiter, terrain_context). Version field is the literal `1`.

### Exercise-name canonicalization (cross-cutting contract)
- **What it does:** Maps free-form exercise names to stable canonical keys used in `exercise_log` and
  `workout_facts` so trend queries group consistently. Two copies, deliberately mirrored.
- **How it works:** Server `_shared/canonicalize.ts:119` (full table, ~100 entries) + client
  `src/lib/canonicalize.ts:32` (~25-entry subset). Server also exports `bigAnchorLift`
  (7 strength anchors, `:164`), `STRENGTH_ANCHOR_KEYS` (`:149`), `muscleGroup` (`:210`).

### Client min-version gates
- **COACH_CLIENT_MIN_PAYLOAD_VERSION = 35** (`src/lib/coach-contract.ts:5`) — must match
  `COACH_PAYLOAD_VERSION` in `coach/index.ts`; bump both when the coach JSON contract changes.
- **coach-payload.ts** (`src/lib/coach-payload.ts`) — root-wins pickers
  (`pickRaceFinishProjectionV1FromCoachData`, `pickRaceReadinessFromCoachData`) that prefer top-level
  fields over nested `weekly_state_v1` for partial/old rows.

## Edge cases & conditional handling

**compute-workout-summary**
- <2 sensor samples (pool swims) → falls back to workout-level scalars (`index.ts:943-952`).
- No samples in `sensor_data` → loads from `garmin_activities` (`:704-730`).
- `normalizeSamples` throws → catches, writes minimal computed from scalars, returns (`:753-776`).
- Sport `mobility` → remapped to `strength` for compute (`:674`).
- Decoupling guards: >2 work intervals skips (`:449-456`); HR samples <20 skips (`:463`); moving
  time <40 min skips (`:469-471`); no HR → score null + execution_score null (`:492`).
- Hot conditions (>27°C) flagged but score not lowered (`:498`).
- Continuous vs interval adherence differs: continuous uses all samples incl. zeros; interval uses
  only work-time (`:519-566`); no power → pace then duration adherence fallback (`:576-601`).
- Swim duration inflate (Q-038): scalar moving_time authoritative at write, sample duration ignored
  (`:906-912`).
- Existing `computed.analysis` merged on write to avoid clobbering analyzer output (`:2180-2183`).
- On error: writes minimal computed, `summary_status='complete'` (data was written, `:2244`); only
  unrecoverable errors set `summary_status='failed'` (`:2253`). `normalization_version='v1'` write is
  non-critical (column may not exist, `:934`).

**compute-facts**
- GPS points <8 → all terrain/route intelligence skipped (`:497`).
- Workout status ≠ "completed" → terrain/route skipped (`:494`,`:764`).
- Distance <1000 m → route intelligence skipped (`:767`).
- Exercise with no registry match → `exercise_id=null`, warning logged (`:1708`).
- HR ≤ 0 treated as missing/null, never 0 (Q-054, `:905`); pace out of [150,750] s/km clamped to null
  at write (`:899-900`).
- Brzycki 1RM with weight ≤ 0 → returns 0 (`:117`).
- Terrain fingerprint collision → upsert reuses existing segment (`:619`); match score <0.58 → create
  new segment (`:588`).
- `segment_progress_metrics` written via 3 fallback variants (composite-key upsert → insert → minimal
  canonical, `:437-486`) — relic of the D-059/Q-022 column-name bug (`:427-435`).
- `learned_fitness.strength_1rms` confidence: ≥3 RIR≤4 sessions → medium, ≥6 → high, only RIR≥5 → low,
  all missing RIR → treated as RIR≤4 (D-118/Q-039-040, `:1003-1044`).
- No advisory lock here (unlike compute-workout-summary) — see Discrepancies.

**compute-snapshot**
- Empty week → numeric aggregates null. Missing 4-week history → trend nulls. `readiness_checkins`
  table absent → falls back to facts-based avg_readiness (D-140/D-141, `:545-572`). Missing
  `planned_workouts` → adherence_pct/plan_week_number null. CTL/ATL/TSB non-fatal if columns
  unmigrated (`:706-744`). `state_trends_v1` only populated for current week; historical snapshots
  leave it null (`:584-649`). `plan_phase` always null currently (`:685`).

**session_detail_v1 / build.ts**
- execution_score multi-source fallback: actualSession → perf.execution_adherence → glance →
  average of (pace/power/duration adherence); all zero → `show_adherence_chips=false`
  (`build.ts:200-235`).
- Goal race (`is_goal_race`): summary bullets suppressed (`:381`); `narrative_text` forced null so
  structured technical_insights render (`:426`); analysisDetailRows suppressed (`:504`); planImpactText
  null (`:525`); `race` populated from `session_state_v1.race`.
- Swim: `completed_totals.avg_pace_s_per_mi` and `avg_gap_s_per_mi` forced null (swim card never
  renders pace-per-mile; `:470-471`); elapsed from swim scalar, not computed.overall (D-182).
- Run GAP: `completedRunGap` only from `workout_analysis`, never cached in `computed.overall` (D-185
  honest-null, `run-scalars.ts:72`).
- Unplanned (`is_unplanned = !match?.planned_id`, `build.ts:712`): client hides adherence chips,
  narrative enters UNPLANNED mode.
- Interval resolution: granular.interval_breakdown → sessionState.details.interval_rows → `[]`
  (`:325-366`); explicit null pace/power adherence → "ungraded", returned null (`:316-317`).
- Sport guards (2026-05-14): pacing/mile-split rows fire only when `sport==='run'` (`:1285`);
  cycling-only HR/efficiency/power-zone/terrain blocks (`:1404-1468`); cycling race debrief NOT
  generated (run-only guard in `workout-detail:785-894`).
- Null resolver paths: `readiness=null` when unavailable or `no_load_data` or strength fast-path
  (`:347`,`:949`); `trend=null` when <3 points or suppressed cycling fallback (`:743-894`);
  `terrain=null` when route history <2 (`:900-926`); `race=null` when not a goal race;
  `race_readiness=null` always in builder.

**workout-detail freshness gate** (`isSessionDetailStale`, `index.ts:92-132`): missing
`session_detail_v1` → stale; goal race missing `forward_context` or `forward_context.copy_version <
FORWARD_CONTEXT_COPY_VERSION` → stale (`:99-105`); `arc_performance.version < ARC_PERFORMANCE_BRIDGE_VERSION`
→ stale (`:107-109`); `recomputed_at > session_detail_updated_at` → stale (`:116-120`); workout
`updated_at` newer than written → stale (`:122-126`); age >24 h → stale (`:128-129`).
Response-only `stale`/`stale_reason` injected by `enrichSessionDetailForResponse` (`:147-178`) for
attach-pending mismatch; these keys MUST be stripped before persist (`stripResponseOnlySessionDetailFields`,
`:135-139`; client also strips in `useWorkoutDetail.ts:36-42`). `race_readiness` budget gate 42 s —
omitted if LLM/DB runs long (`:259-264`).

## Redundancies / duplication (observed, not judged)

- **Pace / HR / avg_cadence / execution_score computed in compute-workout-summary, then read back in
  compute-facts.** compute-workout-summary writes `computed.overall.{avg_pace_s_per_mi, distance_m,
  execution_score, avg_cadence_spm}`; compute-facts re-reads (via `resolveRunScalars`-style derivation)
  into `workout_facts.run_facts.{pace_avg_s_per_km, hr_avg, ...}` and `adherence.execution_score`.
  Same scalar, two storage layers. (CLAUDE.md "four storage layers" describes this intentional split.)
- **Three canonical readers of run pace pre-D-185.** The D-185 resolver header (`run-scalars.ts:6-19`)
  documents that the card read raw `computed.overall.avg_pace_s_per_mi`, the narrative used
  `resolveOverallPaceSecPerMi`, and compute-facts used a third derivation — now unified through the
  resolver. The unification is *recent*; older persisted rows may still reflect the pre-unification
  divergence.
- **Two canonicalize tables** (`_shared/canonicalize.ts` full vs `src/lib/canonicalize.ts` subset) —
  intentional mirror, but the client subset is ~25 entries vs ~100 server-side (drift risk).
- **rideComputedNp candidate list duplicates compute-facts:1124** by design (header says "mirror"), so
  NP is resolved from the same precedence in two files.
- **`avg_readiness` / readiness** computed in compute-snapshot (week rollup) and also referenced inside
  `session_detail_v1.readiness` via a separate readiness builder — different granularity, partial
  overlap of source fields.
- **`COMPUTED_VERSION_INT=1003`** appears in both compute-workout-summary (`:373`) and
  compute-adaptation-metrics (`:26`) as the merge_computed version param — two writers share one
  version constant by copy, not import (unclear from code whether they import a shared const).
- **decoupling** surfaces in `computed.overall.execution_score` (summary), `fact_packet.derived.cardiac_decoupling_pct`
  (analyzer), and `workout_analysis.heart_rate_summary.decouplingPct` (read by `resolveRunDecoupling`).
  Three storage locations for related decoupling signals.

## Discrepancies & flags (for human review)

1. **No advisory lock in compute-facts** while compute-workout-summary takes one (`:637`). If both are
   triggered concurrently for the same workout, compute-facts has no concurrency guard (race possible).
   Whether this is reachable in practice is unclear from code.
2. **Ordering dependency unguarded.** compute-facts reads `w.computed` (written by
   compute-workout-summary). If compute-facts runs first, it reads stale/missing computed. The fan-out
   ordering in `ingest-activity` presumably enforces sequence, but compute-facts itself has no guard or
   assertion that computed is present/fresh — flagged for human review.
3. **`session_detail_v1.discipline_trend` and `.trend` overlap conceptually.** `discipline_trend` is a
   pass-through from `athlete_snapshot.state_trends_v1` (`build.ts:896`); `trend` is per-session
   sparkline. Two trend concepts on one contract — confirm intended.
4. **`arc_performance` documented twice** in the agent map of the builder return; code audit found only
   one canonical assignment at `build.ts:662`. No second assignment confirmed — flagged only as
   something to verify if a future change appears to set it twice.
5. **Run GAP honest-null (D-185)** means older runs and all-non-run sessions return null GAP; the
   resolver explicitly refuses to fabricate GAP from total elevation (`run-scalars.ts:70`). The
   `CompletedTab` elevation-based GAP approximation it warns against is a flagged prior bug — verify the
   client no longer does this (Area 6).
6. **Reconciliation vs `docs/AUDIT-truth-reconciliation-2026-06-14.md`:** that audit found strength
   anchors triple-sourced (typed vs learned vs computed e1RM) with the plan reading typed baselines.
   compute-facts writes `learned_fitness.strength_1rms` and `workout_facts.strength_facts.*.estimated_1rm`;
   the divergence is a known unreconciled loop (their ❌ rows), not a bug in this layer's writes.
7. **Swim learned-fitness never populated** (AUDIT row: swim /100 learned EMPTY). compute-facts writes
   `swim_facts.pace_per_100m` but does not appear to populate a learned swim aggregate — confirm whether
   that is intended (swim learned-fitness population may live elsewhere or be unimplemented; unclear from
   code in this area).
8. **`plan_phase` always null in compute-snapshot (`:685`).** Whether this is a stub awaiting wiring or
   intentionally dropped is unclear from code.
9. **`normalization_version` / `summary_error` columns are written defensively** (may not exist).
   compute-workout-summary tolerates their absence; if the columns were dropped, writes silently no-op —
   flagged as a silent-failure surface.
10. **Two `COMPUTED_VERSION` representations:** string `"v1.0.4"` (in the computed object) and int
    `1003` (RPC param). They must move together; nothing in code enforces they agree — flagged.
11. **`vs. SMART_SERVER_DUMB_CLIENT_AUDIT.md`:** that doc lists several client-side build sites as
    "✅ Fixed (workout-detail)". This audit confirms `session_detail_v1` is rendered verbatim, consistent
    with the doc, but `useWorkoutDetail` still merges base(cache)+remote (`:119-173`) — the doc itself
    marks that merge "Acceptable – not building from raw". No contradiction, noted for completeness.

## Cross-references

- **Existing docs:** `docs/SMART_SERVER_DUMB_CLIENT_AUDIT.md` (verbatim-render invariant; this contract
  is the canonical example), `docs/AUDIT-truth-reconciliation-2026-06-14.md` (strength/swim multi-source
  divergence — flags 6–7), `docs/SPEC-per-session-performance-engine.md`,
  `docs/PERF-INTERVAL-INTERPRETATION-SPEC.md`, `docs/SPEC-adherence-performance-bridge.md`,
  `DETERMINISTIC_LAYER_ARCHITECTURE.md` (workout_facts model), `docs/ENGINE-STATE.md`,
  `docs/DECISIONS-LOG.md`.
- **Decisions:** D-036 (decoupling basis gap/raw), D-038 (vs_similar pool-intensity context), D-041
  (trend pool race boundary), D-059/Q-022 (segment_progress_metrics column-name bug), D-060 (run easy
  pace trend rename), D-112/Q-054 (0-not-null HR/pace class), D-118/Q-039-040 (strength 1RM confidence),
  D-140/D-141 (readiness_checkins fallback), D-156 (swim moving>elapsed lesson), D-182 (swim scalars
  from raw columns), D-185 (run scalars single-source). ADR 0001 (attach + session_detail_v1).
- **Other audit areas:** Area 2 (analyzers — the *science* inside the fact packet), Area 3 (spine /
  state_trends_v1 / snapshot consumption), Area 6 (client screens — verbatim rendering, the CompletedTab
  GAP flag), Area 7 (baselines — learned_fitness divergence).
- **Code anchors:** `compute-workout-summary/index.ts`, `compute-facts/index.ts`,
  `compute-adaptation-metrics/index.ts`, `compute-snapshot/index.ts`,
  `_shared/session-detail/{types.ts,build.ts}`, `_shared/fact-packet/{types.ts,build.ts}`,
  `_shared/run/run-scalars.ts`, `_shared/swim/swim-scalars.ts`, `_shared/cycling-v1/np-trend.ts`,
  `_shared/canonicalize.ts`, `workout-detail/index.ts`, `src/hooks/useWorkoutDetail.ts`,
  `src/lib/{coach-contract.ts,coach-payload.ts,canonicalize.ts}`.
```

