# Running → Cycling Delta Map

Date: 2026-05-13. Read-only audit. Diff of running's implementation against cycling's across 10 app surfaces, produced via 5 parallel Explore agents tracing each surface independently. No code edits.

**Output shape:** one table per surface (Feature | Running | Cycling | Gap), then a prioritized porting order + direct-port-vs-net-new classification.

**Methodology limit:** static reads only. File:line citations are accurate as of this commit but won't auto-update if files move. "Missing" verdicts mean no symbol found via grep + agent read; doesn't preclude the concept existing under a name not searched.

---

## Surface 1 — `arc-context.ts`

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Threshold metric (learned_fitness) | `run_threshold_pace_sec_per_km` (arc-context.ts:365) | `learned_fitness.ride_ftp_estimated` (raw key, not extracted to a wrapper) | partial |
| Easy metric (learned_fitness) | `run_easy_pace_sec_per_km` (arc-context.ts:366) | missing | missing |
| Coach-prompt formatting wrapper | `run_pace_for_coach.threshold` (86-94, dual units /km + /mi) | missing | missing |
| Coach-prompt easy formatting | `run_pace_for_coach.easy` (86-94) | missing | missing |
| Race anchor (performance_numbers) | `fiveK` / `fiveK_pace` (~298) | `performance_numbers.ftp` (raw key) | partial |
| Manual-vs-learned divergence detection | `five_k_nudge` (100-110, 177) | missing | missing |
| Unit-note warning | `_unit_note` in run_pace_for_coach (91) | missing | missing |
| Snapshot avg power (cycling) | missing (no run analog) | `latest_snapshot.ride_avg_power` (via snapshot, line 184) | n/a |
| Snapshot efficiency factor (cycling) | missing (running has efficiency_index instead) | `latest_snapshot.ride_efficiency_factor` (via snapshot, line 184) | n/a |
| Gear summary | missing (running gear inferred from shoes) | `gear.bikes` (123-126, 194) | n/a |

---

## Surface 2 — `compute-snapshot` + `athlete-snapshot.ts`

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Easy effort baseline (weekly) | `run_easy_pace_at_hr` (compute-snapshot:119, 182, 502) | missing | missing |
| Easy effort trend (week-over-week) | `run_easy_hr_trend` (compute-snapshot:346-348, 503) | missing | missing |
| Long-session duration (weekly max) | `run_long_run_duration` (compute-snapshot:89, 183, 504) | missing | missing |
| Interval adherence | `run_interval_adherence` (compute-snapshot:91, 123-126, 184-186, 505) | missing | missing |
| Efficiency marker | `run_efficiency_index` (compute-snapshot:92, 120, 187) | `ride_efficiency_factor` (compute-snapshot:96, 139-140, 189, 512) | partial (different formula: pace/HR vs NP/HR) |
| Avg power | missing (no run power) | `ride_avg_power` (compute-snapshot:95, 136-137, 188, 511) | n/a (sport-specific) |
| Time-in-zone | `zoneSeconds` per run (compute-snapshot:127-131) | `zoneSeconds` per ride (compute-snapshot:142-146) | present |
| Intensity distribution (z1-2 vs z3+) | `intensityDistribution` (compute-snapshot:158-167) | `intensityDistribution` (same) | present |
| Workload-by-discipline | `workloadByDisc['run']` (compute-snapshot:79, 107, 496) | `workloadByDisc['ride']` / `['bike']` (compute-snapshot:79, 107, 496) | present |
| Longitudinal — easy-pace drift | `detectEasyPaceDrift` (longitudinal-signals.ts:100) | missing | missing |
| Longitudinal — efficiency trend | fallback path (longitudinal-signals.ts:386-390) | `ride_efficiency_downtrend` signal (longitudinal-signals.ts:81, 452-474) | partial (cycling has explicit signal; running has fallback only) |
| Longitudinal — HR drift trend | missing | `detectRidePhysiologyTrends` (longitudinal-signals.ts:101, 428-451) | running missing |
| Readiness aggregation | `avg_readiness` (compute-snapshot:81-82, 109-112, 175-180) | same | present |
| RPE trend | `rpeTrend` (compute-snapshot:341-343, 516) | same | present |

**Cross-cutting note (Surfaces 1+2):** Running gets pace + threshold + adherence + duration + efficiency + drift detection. Cycling gets avg power + efficiency factor only. Cycling has one signal running lacks — explicit HR-drift longitudinal trend (`detectRidePhysiologyTrends`). Otherwise running is consistently richer.

---

## Surface 3 — `learn-fitness-profile` estimation hierarchies

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Rejection rule | <3 runs returns all-null (420-430) | <3 rides returns all-null (659-666) | present |
| Max HR observation | ≥5 sample = high confidence (435-446) | ≥5 sample = high confidence (671-682) | present |
| Easy effort baseline tier | Tier 1: median pace from ≥3 easy runs <75% maxHR ≥20 min, ≥5 = high (614-634); Tier 2: 70% maxHR estimate (544-549) | Tier 1: median HR from ≥3 easy rides 65-75% maxHR power-filtered ≥30 min, ≥5 = high (792-825); Tier 2: 70% maxHR estimate (828-833) | partial (cycling estimates HR only, no easy-power baseline) |
| Threshold tier 1 | Median HR from ≥2 efforts at 85-92% maxHR (467-488) | Median HR from ≥2 hard efforts (power ≥85% P75 AND HR 85-95% maxHR), ≥4 = high (722-747) | present (different filters) |
| Threshold tier 2 | 95th pct of sustained efforts ≥3 (491-501) | Single hard effort fallback (748-758) | partial |
| Threshold tier 3 | 88% of maxHR estimate (504-511) | 90% of maxHR estimate (760-768) | present |
| Threshold pace extraction | Median pace from runs within ±5 bpm threshold HR, ≥2 runs (589-610) | missing (cycling has no pace-equivalent extraction; FTP is power-only) | missing |
| Primary fitness output | `run_easy_pace_sec_per_km` + `run_threshold_pace_sec_per_km` (259) | `ride_ftp_estimated` only (265) | partial (running has 2 outputs, cycling has 1) |
| FTP-equivalent hierarchy | n/a (pace via threshold-HR matching) | Tier 1: best 20-min × 0.95 ≥2 efforts (861-881); Tier 2: best NP from hard × 0.95 ≥1 (886-920); Tier 3: best avg from hard × 1.05 × 0.95 ≥1 (924-950); Tier 4: best overall NP × 0.95 ≥1 (954-970) | partial (cycling has 4-tier numeric, running has 2-tier with HR matching) |
| Confidence semantics | low/medium/high gated on effort count + HR match (485, 538, 606) | low/medium/high gated on power quartile + HR filtering + count (744, 754, 764) | present (different gating logic) |

---

## Surface 4 — `materialize-plan` + snapshot pinning

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Snapshot pin field | `run: null` hardcoded (athlete-snapshot.ts:165) | `bike: null` hardcoded (athlete-snapshot.ts:163) | **missing for both** |
| Baseline fields pinned | None | None | **missing for both** |
| Materialization baseline read | Reads `user_baselines.{effort_paces, performance_numbers}` live (materialize-plan:2290) | Reads `user_baselines.ftp` live (2290) → `baselines.ftp` (2458-2459) | partial (both bypass non-existent snapshot pin) |
| Snapshot override application | Strength only: `readAthleteSnapshotOrLive()` for 1RMs (2417-2443) | Strength only: same path (2417-2443) | strength reference; missing for run + bike |
| %-baseline expansion | `secPerMiFromBaseline(baselines, 'fivek'/'easy'/'marathon'/'threshold')` (930-1250 expandRunToken) | `pctRange(lo, hi) = Math.round(lo*baselines.ftp)` (1254-1324 expandBikeToken) | partial (both read live, neither uses snapshot) |
| Strength snapshot integration (reference pattern) | Pinned at gen, read at materialization with snapshot > live preference (2417-2439) | Same | strength is the working reference; running + cycling never landed |

**Cross-cutting note (Surfaces 3+4):** The cycling FTP fragmentation traced in `docs/CYCLING-INGEST-AUDIT.md` is **structurally similar to running's**. Running has the same snapshot-pinning gap (`run: null` at line 165 vs `bike: null` at line 163) — both fields exist in the schema but the populator code was never written. Strength is the only sport with proper snapshot pinning today. The estimation-hierarchy asymmetry (running 2-tier pace vs cycling 4-tier FTP) is orthogonal to the pinning gap; both fields exist in `learned_fitness` regardless.

---

## Surface 5 — `AthleticRecordPage.tsx` (Performance screen)

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| 5K pace record | 299 (`pn.fiveK_pace ?? pn.fiveK`) | missing | missing |
| 10K pace record | 316 (static "—" placeholder) | missing | missing for both (running placeholder only) |
| Half marathon record | 320 (static "—" placeholder) | missing | missing for both (running placeholder only) |
| Marathon PR | 300-305 (`marathonPrDisplay` from goals + race results) | missing | missing |
| FTP best | missing | 64, 114-118, 298, 512-513 | n/a (cycling-only metric concept) |
| Longest ride duration | missing | 65-66, 121-132, 515-527 | n/a (cycling-only metric concept) |
| Swim 100yd pace | 534 (`pn.swimPace100`) | 534 | present (shared) |
| Strength records (Deadlift/Squat/Bench/OHP) | 541-552 | 541-552 | present (shared) |
| Recent training volume | missing | missing | missing for both |
| Power records (peak 1min/5min/20min) | n/a | missing | net-new for cycling |
| Pace zone display | missing on this screen | missing | gap-for-both |

---

## Surface 6 — Coach LLM prompt context (`coach/index.ts`)

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Threshold/FTP baseline injection | "Run threshold pace: X min/mi" (3951-3952, from effort_paces) | "Bike FTP: XXW" (3943-3944, from `perfNums.ftp`) | present (sport-equivalent) |
| 5K/race anchor injection | "5K pace: X min/mi" (3953-3954) | missing | missing |
| Swim CSS injection | "Swim CSS: M:SS/100yd" (3945-3949) | n/a (sport-specific) | n/a |
| 7-day session-type breakdown | `runSessionTypes7d` array (1637-1659): easy/z2/long/tempo/progressive/fartlek/intervals/hills with execution + HR drift + decoupling + Z2% | missing | missing |
| Effort-paces injection (merged from baseline + plan) | `mergedEffortPacesForCoach()` (109-126, 2570-2571, 2642, 2792, 2846) | missing | missing |
| HR drift / decoupling marker | `easyRunType.avg_decoupling_pct` (2656-2657, 1651, 1929-1932) | available in `disciplineProfiles` (1950-1979) but not surfaced as discrete field | partial |
| Long-session context | `peakLongRunMi`, `nextLongRunMi`, `nextLongRunDate`, `longRunStillScheduled` (4248-4315; gated ≥10 mi) | missing | missing |
| ACWR (load ratio, sport-weighted) | `runningAcwr` (2007-2015, 748-786, 801-825, 863-865, 3077, 4366) | available in disciplineProfiles (1934-1936, 1977-1979) but not surfaced as `cyclingAcwr` | partial |
| Easy / Z2 context extraction | `easyRunType` derived from 7d aggregates (2627-2628, 2830-2831) | missing | missing |
| Brick acknowledgment | LLM instruction (4205); session routing (2284-2289) | same code path (4205, 2284-2289) | present (shared) |
| Race-readiness projection (VDOT) | `computeRaceReadiness()` (2576-2668), gated on `sport === 'run'` | missing | missing |
| Interval adherence (per-rep) | execution score for intervals/hills (1642-1645); early-week run adherence detection (3257-3277) | missing for bike | missing |
| Pace/power unit note | sec/km vs sec/mi branching (3952, 3954); `_unit_note` in arc-context | missing | missing |
| Efficiency index label | `runEfficiency(decouple)` label + tone (1629-1635, 1655) | missing (HR drift collected but no label) | missing |
| Weekly intensity distribution | `zone1_2_pct`, `zone3_plus_pct` (3927-3934) | same | present (shared) |
| Per-discipline ACWR + load | disciplineProfiles (1934-1936, 1977-1979) | same | present (shared) |

**Cross-cutting note (Surfaces 5+6):** Performance screen is roughly symmetric in shape (both sports get a few headline metrics + shared strength/swim) — cycling lacks distance-distance pace tiers (5K/10K/Half) but those are running-natural concepts. Coach prompt is **heavily running-biased**: 6 running-specific computations (session types 7d, VDOT readiness, long-run context, running ACWR, race readiness projection, efficiency labeling) vs 1 cycling baseline (FTP). The asymmetry on the user-facing screen is mild; the asymmetry in the LLM context is substantial.

---

## Surface 7 — `workout_facts` (run_facts vs ride_facts)

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Distance | `distance_m` (compute-facts:1032) | `distance_m` (compute-facts:1118) | present |
| Duration | implicit (computed from distance + pace) | `duration_minutes` (compute-facts:1119) | partial (running lacks explicit field) |
| Primary effort metric | `pace_avg_s_per_km` (compute-facts:1025-1029) | `avg_power` + `normalized_power` (compute-facts:1120-1121) | n/a (sport-specific) |
| Intensity factor | `efficiency_index` (pace/HR ratio) (compute-facts:1089) | `intensity_factor` (NP/FTP) (compute-facts:1126) | partial (different math, different semantics) |
| Effort efficiency | `pace_at_easy_hr` (compute-facts:1082) | `efficiency_factor` (NP/HR) (compute-facts:1130) | partial (different denominator) |
| HR average | `hr_avg` (compute-facts:1034) | `avg_hr` (compute-facts:1122) | present (naming differs) |
| Elevation gain | `elevation_gain_m` (compute-facts:1035) | missing | missing |
| Time-in-zone | z1-z5 (compute-facts:1040-1051) | z1-z5 (compute-facts:1133-1146) | present |
| HR drift | `hr_drift_pct` (compute-facts:1065) | `hr_drift_pct` (compute-facts:1158) | present |
| Power distribution | n/a (no run power) | `power_curve` (compute-facts:1165) | n/a (sport-specific) |
| Interval adherence count | `intervals_hit` / `intervals_total` (compute-facts:1102-1103) | missing | missing |
| Cadence | (not explicitly computed in run_facts per agent) | (not explicitly computed in ride_facts per agent) | missing for both |
| Stride/rep breakdown | not in run_facts (lives in workout_analysis layer) | not in ride_facts (lives in workout_analysis layer) | both deferred to analyzer |

---

## Surface 8 — `analyze-running-workout` vs `analyze-cycling-workout`

| Category | Running (file:line) | Cycling (file:line) | Gap / Depth |
|---|---|---|---|
| Classified type taxonomy | 4 categories: `intervals \| threshold \| long_run \| easy` (fact-packet/build.ts:219-222) | 12 categories: `recovery / endurance / endurance_long / tempo / sweet_spot / threshold / vo2 / anaerobic / neuromuscular / race_prep / brick / unknown` (cycling-v1/types.ts:3-15) | **cycling has finer taxonomy** |
| Fact packet (v1) | FactPacketV1: facts (distance, pace, HR, elevation, segments, weather, plan) + derived (drift, comparisons, stimulus, limiter, terrain_context) (fact-packet/build.ts:831-890) | CyclingFactPacketV1: facts (distance, duration, power metrics, HR, FTP) + derived (executed_intensity, ftp_bins, plan_context, confidence) (cycling-v1/build.ts:160-197) | partial (running has cross-workout queries; cycling self-contained) |
| Flags (v1) | AI-flagged insights, ~7-10/session, multi-category (fact-packet/flags.ts) | Simpler heuristics (cycling-v1/flags.ts:2-35) | partial |
| AI summary | LLM narrative + arc_narrative_for_summary (analyze-running:2027) | LLM narrative (analyze-cycling:1671) | partial (running adds arc narrative) |
| Session state (v1) | glance + narrative + summary + details (with adherence_summary structured) + guards + race-specific (analyze-running:2565-2642) | glance + narrative + summary + details (without adherence_summary) + guards (analyze-cycling:1774-1802) | partial (cycling missing adherence_summary structure) |
| Granular analysis | overall_adherence + time_in_range + interval_breakdown + heart_rate_analysis (drift_bpm) + pacing_analysis (variability/smoothness/CV) + duration_adherence (analyze-running:1814) | interval_breakdown (power) + power_variability + heart_rate_analysis + time_in_range (power ranges) + overall_adherence (analyze-cycling:1709-1717) | partial (running has pacing_analysis; cycling has power_variability — different but parallel) |
| Performance scoring | execution_score + pace_adherence + duration_adherence + completed_steps / total_steps (analyze-running:2581) | execution_score + power_adherence + duration_adherence (analyze-cycling:1745) | partial (running tracks rep completion) |
| Detailed analysis | mile_by_mile_terrain (splits + terrain_type + grade + pace + HR) + interval_breakdown + race debrief (analyze-running:1605, 2650-2661) | workout_summary + interval_breakdown + heart_rate_analysis + power_variability (analyze-cycling:1720-1731) | partial (running has terrain attribution; cycling has variability) |
| Adherence verdict structure | `verdict` (label) + `technical_insights` (structured array) + `plan_impact` (note) (analyze-running:2654) | `power_adherence` + `duration_adherence` + `time_in_range` (analyze-cycling:1744-1749) | missing (cycling has flat percentages; no structured verdict) |
| Race-specific debrief | `is_goal_race` + `race_debrief_text` + `course_strategy_zones` snapshot + projections (analyze-running:2663-2671) | missing | missing |
| Shared utilities | `_shared/fact-packet/` (38KB; build.ts ~1028 lines doing cross-workout queries, trend, achievements, limiter analysis) | `_shared/cycling-v1/` (7.7KB; build.ts ~200 lines, self-contained) | **5x size difference** |

**Cross-cutting note (Surfaces 7+8):** Workout-level analysis depth is asymmetric. Running's analyzer does cross-workout historical queries (trend, achievements vs prior similar, limiter) and surfaces a structured adherence verdict + race debrief. Cycling's analyzer is self-contained (FTP bins from current workout only), has no cross-workout queries, no race debrief, and flat (not structured) adherence. Cycling's classified-type taxonomy is RICHER than running's (12 categories vs 4) — that's the one place cycling out-features running.

---

## Surface 9 — Plan generation (periodization + workout taxonomy)

| Feature | Running (file:line) | Cycling (file:line or "missing") | Gap |
|---|---|---|---|
| Easy / Z2 | `easyRun()` (session-factory:190) | `easyBike()` (session-factory:485) | present |
| Tempo / Z3 | `tempoRun()` (session-factory:203) | `tempoBike()` (session-factory:472) | present |
| Threshold / Z4 | `tempoRun()` (uses tempo function for threshold too, session-factory:203) | `thresholdBike()` (session-factory:367) | present (different naming) |
| VO2max / Z5 | `vo2Run()` (session-factory:220) | `vo2Bike()` (session-factory:380) | present |
| Long steady | `longRun()` (session-factory:165) | `longRide()` (session-factory:354) | present |
| Intervals | `intervalRun()` (session-factory:232) | bundled into thresholdBike/vo2Bike/sweetSpotBike (367, 380, 393) | partial (no dedicated cycling interval function) |
| Sweet spot | missing | `sweetSpotBike()` (session-factory:393) | running missing |
| Sprint / openers | missing | `bikeOpeners()` (session-factory:514) | running missing |
| Phase-aware intensity selection | base_first vs race_peak conditional (week-builder:1368-1402) | single dispatch in `groupRideQualityBikeSession()` (week-builder:1249) | partial (cycling lacks tri-vs-run-only branching) |
| Base-phase quality default | `intervalRun()` (week-builder:1378-1380) | `sweetSpotBike()` (session-factory:509) | **asymmetric** (run = intervals, bike = sweet spot — intentional?) |
| Build-phase quality default | `tempoRun()` (1383-1384) or `vo2Run()` (1396-1397, conditional on tri) | `thresholdBike()` (session-factory:507) | partial |
| Race-spec quality default | `racePaceRun()` (1371-1377 or 1389-1394) | `vo2Bike()` (session-factory:505) | **asymmetric** (run = race-pace, bike = VO2 — intensity logic inverts) |
| Taper protocol | `easyRun()` downgrade (week-builder:1361-1363) | `bikeOpeners()` sharpener (week-builder:1249) | partial (run drops, bike sharpens) |
| Long-session progression | `longRunFloorMiles()` (science:159, distance × phase table) | `longRideFloorHours()` (science:200, parallel structure) | present |
| Peak weekly TSS targeting | `scaledWeeklyTSS()` (science:64) | same shared function | present |
| %-baseline pacing | `longRunRaceSpecificPaceCopy()` (session-factory:144-157, Z2 + race % copy) | `pctRange(lo, hi)` (session-factory:376/385/398, hardcoded FTP percentages) | partial (different shape: copy vs structured pct) |
| Brick-leg target | `brickRunTargetMiles()` (science:129, race × phase) | uses same function for bike duration | partial (run gets dedicated phase logic; bike doesn't) |
| Race-distance-aware targets | `racePaceRun()` (session-factory:295, distance → zone copy) | generic phase → vo2 (week-builder:1249, no distance awareness in bike intensity) | partial |
| Race-week run/ride taper | run becomes easy (week-builder:1361-1363) | bike gets openers (week-builder:1249) | partial (different taper philosophies) |

**Surface 9 takeaway:** Cycling has MORE intensity variety in some dimensions (sweet spot, openers — running has neither) but LESS periodization conditional logic (no tri-vs-run-only split, no distance-aware intensity selection). The "race-spec quality" choice INVERTS between sports (run = race-pace, bike = VO2) — this could be intentional or a missed alignment. Worth flagging to product.

---

## Surface 10 — Test coverage

| Feature | Running (file) | Cycling (file or "missing") | Gap |
|---|---|---|---|
| Long-session floor by distance × phase | `long-day-volume-floors.test.ts` ("longRunFloorMiles") | `long-day-volume-floors.test.ts` ("longRideFloorHours") | present (shared test file) |
| Effective floor capped by recent | `long-day-volume-floors.test.ts` ("run base capped at build peak") | `long-day-volume-floors.test.ts` ("ride base capped at build peak") | present |
| Floor enforcement (raise low session) | `long-day-volume-floors.test.ts` ("long_run below floor bumped") | `long-day-volume-floors.test.ts` ("long_ride below floor bumped") | present |
| Phase → intensity selection | `week-in-phase.test.ts` (phase-agnostic, no run-specific assertions) | same | **missing for both** (sport-specific selection logic untested) |
| Periodization approach (base_first vs race_peak) | missing (week-builder:1368-1402 untested) | missing | **missing for both** |
| Brick-leg length calculation | missing | missing | **missing for both** |
| Brick pairing validation | `same-day-pairing.test.ts` (brick tag) | same | present (shared) |
| Quality-session placement | `scheduler-anchor.contract.test.ts` (anchor placement) | same | present (shared) |
| Same-day run+bike matrix | `stack-tagging-validator.test.ts` | same | present (shared) |
| Pace ranges (Z2/Z3/Z4) | missing | missing | **missing for both** |
| Power zones (% FTP) | n/a | missing | **missing for cycling** |
| Long-session race-pace blending | missing | missing | **missing for both** |
| Strength frequency by phase | `str-freq.test.ts` | same | present (shared) |
| Run+strength stacking | `stack-tagging-validator.test.ts` | same | present (shared) |
| Workout-content unit tests for `session-factory.ts` functions | missing | missing | **missing for both — no direct unit tests** |
| Analyzer-level tests (`analyze-running-workout` / `analyze-cycling-workout`) | not enumerated | not located | gap likely for both |

**Surface 10 takeaway:** Tests are overwhelmingly **sport-agnostic** — scheduling, frequency, floors, strength integration. The sport-specific content-generation logic in `session-factory.ts` and the periodization-conditional logic in `week-builder.ts` is **uncovered for both running and cycling**. Cycling under-implementation is paired with similar under-testing; running's richer implementation is similarly untested. The test gap mirrors the implementation gap *symmetrically*.

---

## Cross-cutting porting order

Ordered by **dependency** (items that block others go first). For each item, **D = direct port** (running has a working reference implementation; cycling can adopt the same shape) or **N = net-new design** (no running reference; needs product/eng decision).

### Tier 1 — Foundational (block multiple downstream items)

1. **Snapshot pinning for both run AND bike** *(D — strength is the working reference at materialize-plan:2417-2443)*
   - Fix `athlete-snapshot.ts:163` (`bike: null`) AND `:165` (`run: null`) — same code-path gap.
   - Pin `bike.ftp_w` from current learned/manual FTP at plan-creation.
   - Pin `run.threshold_pace_sec_per_km` + `run.easy_pace_sec_per_km` similarly.
   - Wire `materialize-plan` consumers to prefer pinned values via `readAthleteSnapshotOrLive()` (existing helper, used today only by strength).
   - Unblocks: stable cycling/running plan targets across baseline drift; precondition for any "current FTP/pace" source-of-truth resolver.

2. **FTP precedence resolver** *(D — same pattern as `useStrengthOrderingPreference` consolidation)*
   - Single helper `resolveCurrentFtp(baselines)` returning `{value, source}`. Probably learned (≥medium confidence) > manual > null.
   - Replace 8 ad-hoc fallbacks across `compute-facts`, `calculate-workload`, `send-workout-to-garmin`, `race-projections`, `infer-training-fitness`, `AthleticRecordPage`, `enrichArcGoalTrainingPrefs`, `materialize-plan`.
   - Unblocks: every downstream FTP read converges. Removes the dead `learned_fitness.cycling.ftp` fallback at `compute-facts:1115`.
   - Cross-ref: `docs/CYCLING-INGEST-AUDIT.md` §6.

### Tier 2 — Snapshot aggregation parity (depends on Tier 1)

3. **`ride_long_ride_duration` weekly aggregate** *(D — port from `run_long_run_duration` at compute-snapshot:89, 183, 504)*
4. **`ride_interval_adherence` weekly aggregate** *(D — port from `run_interval_adherence` at compute-snapshot:91, 123-126, 184-186, 505)*. Requires `analyze-cycling-workout` to emit per-interval adherence first (depends on Tier 4 item 7 below).
5. **`ride_easy_power` baseline + trend** *(D — derived from FTP per D-009; reclassified from N → D 2026-05-14)*. Per `docs/DECISIONS-LOG.md` D-009, easy-power baseline is the lower half of Coggan Zone 2 (56-65% of FTP). No new estimation pipeline — derived directly from `resolveCurrentFtp()` output. Implementation: ~1 helper function returning `{lower_w: ftp * 0.56, upper_w: ftp * 0.65}` + snapshot wiring + (optional) week-over-week trend on observed Z2 power if needed for coaching context. Field renamed from `ride_easy_power_at_hr` (the original net-new framing inferred from HR-gated samples) to `ride_easy_power` (FTP-derived band) to reflect the simpler design.
6. **Migrate strength-style snapshot pinning pattern to bike + run** *(D — already-solved pattern at strength)*. Subsumed by Tier 1 item 1.

### Tier 3 — Workout analyzer parity (depends on Tier 1)

7. **Cycling adherence verdict structure** *(D — port from running's `verdict + technical_insights + plan_impact` at analyze-running:2654 to analyze-cycling:1744-1749)*. Cycling has the data (power_adherence, duration_adherence, time_in_range); needs the structured wrapper.
8. **Cycling per-interval adherence count** *(D — port from `intervals_hit / intervals_total` at compute-facts:1102-1103 to ride_facts)*. Required for Tier 2 item 4.
9. **Cycling race-specific debrief structure** *(D — port from `race_debrief_text` + `course_strategy_zones` at analyze-running:2663-2671)*. Cycling needs `is_goal_race` gating + similar narrative generation.
10. **Cycling cross-workout queries (trend, achievements, limiter)** *(D — design questions resolved per D-010 on 2026-05-14; reclassified N → D)*. Achievements: power-curve PRs from existing `computed.power_curve` (best 20-min FTP proxy, best 5-min VO2 proxy, best 1-min neuromuscular) on 90-day rolling + all-time windows. `vs_similar_v1`: match on `classified_type` + duration ±20%, compare against last 3 matching workouts. Limiter: W/kg-vs-age-group-norms by race distance for triathletes; power-trend-vs-90d-mean for non-tri cyclists. All four anchor to data the cycling pipeline already computes — no new estimation infrastructure needed. Implementation becomes a rolling-window aggregation port (running's `_shared/fact-packet/` is 38KB / ~1028 lines but most of it is running-specific concepts; cycling-equivalent will be smaller — estimated ~400-500 lines + tests).

### Tier 4 — Coach prompt parity (depends on Tier 2 + Tier 3)

11. **`cyclingAcwr` exposure to coach** *(D — already in disciplineProfiles at coach:1934-1936; just needs surfacing as a discrete field like `runningAcwr` at coach:2007-2015)*
12. **Cycling 7-day session-type breakdown** *(D — port `runSessionTypes7d` at coach:1637-1659 to a `rideSessionTypes7d` reading from ride_facts. Will use the classified_type taxonomy at cycling-v1/types.ts — which is RICHER than running's, so the port is a structural simplification not a complication)*
13. **Cycling effort-paces injection equivalent** *(N — running has merged effort_paces from baseline + plan at coach:109-126; cycling equivalent would inject %-FTP power ranges per zone. Needs schema for "bike effort powers" parallel to `effort_paces`)*
14. **Cycling efficiency label** *(D — port `runEfficiency(decouple)` at coach:1629-1635; cycling has efficiency_factor available but no label)*
15. **Cycling long-session context** *(D — port `peakLongRunMi` / `nextLongRunMi` at coach:4248-4315 to cycling — distance-gated query for upcoming long rides ≥X hr)*
16. **Cycling race-readiness projection** *(N — running uses VDOT-based `computeRaceReadiness()` at coach:2576-2668. Cycling-equivalent needs critical-power or W'-based model — real product decision)*

### Tier 5 — Performance screen parity (depends on Tier 1)

17. **Cycling power records (peak 1min/5min/20min)** *(N — no running analog directly; running shows distance-time records. Cycling-equivalent is power-duration. Needs product decision on which durations matter.)*
18. **Cycling recent training volume display** *(D — same shape as missing running-recent-volume; both gap-for-both items in Performance screen)*
19. **Coach-style FTP injection on Performance screen** *(D — already done; cycling renders FTP best while running renders 5K. Symmetric.)*
20. **Snapshot-aware client normalizer (`src/services/plans/normalizer.ts`)** *(D — same precedence pattern as the server-side resolver shipped in Tier 1)*. Display-layer rendering issue: the client normalizer expands `%FTP → watts` and `%pace → range` independently of the server-side `materialize-plan`. It reads `baselines.performanceNumbers.ftp` directly (line 308, 898, 935) and `baselines.performanceNumbers.{fiveK_pace, easyPace, ...}` from whatever the caller passes — typically the live `user_baselines` row. After Tier 1 snapshot pinning shipped (commit `e18b3d56`), server-side materialized targets in `planned_workouts` are frozen at plan-creation time, but **client-side display via this normalizer still re-expands using live baselines** — so an athlete who updates FTP mid-plan sees the same description ↔ delivered drift class on rendering surfaces (TodaysEffort, AllPlansInterface, PlannedWorkoutSummary, PlanSelect, AppContext) that was just closed on the server. Fix: thread `plan.config.athlete_snapshot.bike.ftp_w` (and run pace equivalents) into the `Baselines` object the normalizer accepts; fall back to live `performance_numbers.ftp` for legacy plans without snapshot pins. Same shape as the server-side `readAthleteSnapshotOrLive()` precedence rule. Affects 5+ caller sites; centralized fix in `normalizer.ts`. Same architectural pattern as the multi-surface "Run — Tempo vs Run Intervals" label divergence already filed in `docs/ENGINE-STATE.md` "Known broken" — multiple display surfaces deriving the same render from different upstream paths, closed by routing through a snapshot-aware resolver.

### Tier 6 — Test coverage parity (depends on Tier 2-5)

21. **Sport-specific session-factory unit tests** *(D — both sports lack these today. Pattern: pick `easyRun()`/`tempoRun()`/etc, write per-function expectations. Same shape per sport.)*
22. **Periodization-approach tests** *(D — `base_first` vs `race_peak` running logic at week-builder:1368-1402 untested today; add tests for both sports' phase-quality selection.)*
23. **Cycling analyzer test file** *(D — running's likely has one per analyze-running-workout patterns; cycling needs equivalent.)*
24. **Pace + power range emission tests** *(N — needs sport-spec layer that defines what "correct" Z2/Z3/Z4 pace and what "correct" 88% sweet-spot watts look like. Probably builds on existing protocol docs.)*

### Tier 7 — Longitudinal + Arc parity (depends on Tier 2)

25. **Cycling FTP-trend longitudinal signal** *(D — port `detectEasyPaceDrift` at longitudinal-signals.ts:100 to a `detectFtpDrift`)*. Cycling has efficiency-downtrend; lacks FTP-progression trend.
26. **Cycling bike-volume trend signal** *(D — port `run_easy_hr_trend` shape at compute-snapshot:346-348 to a bike-volume trend)*
27. **Arc `ride_pace_for_coach` equivalent** *(D — port the dual-units coach formatting at arc-context.ts:86-94 to a `ride_power_for_coach` exposing FTP and zone watts with a `_unit_note`)*

### Tier 8 — Cross-sport asymmetries to resolve via product decision (no clear D/N)

28. **TSS computation for cycling** *(N — currently absent from the cycling pipeline per `docs/CYCLING-INGEST-AUDIT.md`. Workload uses TRIMP/IF; explicit TSS would align with cycling-coach mental model. Product call.)*
29. **Race-spec quality intensity inversion** *(N — Surface 9 finding: run race-spec = race-pace, bike race-spec = VO2. Intentional or inconsistency? Product/coaching call.)*
30. **Cycling sweet-spot for running** *(N — cycling has `sweetSpotBike()`; running has no sub-threshold sustained workout type. Probably intentional given run injury risk; worth confirming.)*
31. **Sprint/openers for running** *(N — cycling has `bikeOpeners()`; running has no race-week sharpener equivalent. Probably intentional; worth confirming.)*

---

## Direct-port vs net-new summary

**Direct ports (running has working reference implementation OR design resolved):** items 1-12, 14-15, 18-23, 25-27 → **23 items** that can be ported with running as the template (items 5 + 10 reclassified N → D per D-009 + D-010 on 2026-05-14). Bulk of the work; well-scoped per item.

**Net-new design (no running reference; needs product/eng decision):** items 13, 16-17, 24, 28-31 → **8 items** that need a design call before code. Cluster around: coach prompt schema for cycling effort-paces (item 13), CP/W' race-readiness model (items 16, 17), and the four cross-sport asymmetries (items 28-31).

**Recommended pickup sequence:**

- **Weeks 1-2:** Tier 1 (foundational) — snapshot pinning + FTP precedence. Unblocks downstream.
- **Weeks 3-4:** Tier 2 + Tier 3 — snapshot aggregation parity + analyzer parity (direct ports, ~6 items).
- **Weeks 5-6:** Tier 4 + Tier 5 — coach prompt + Performance screen surfacing.
- **Ongoing:** Tier 6 (tests) added incrementally per item shipped.
- **Separate track:** Tier 7-8 net-new design items go through product review before implementation.

---

## When this doc becomes stale

This is a snapshot of the running/cycling delta as of 2026-05-13. File line numbers will drift; the structural verdicts (cycling thinner than running everywhere except classified-type taxonomy and HR-drift longitudinal signal; both sports missing snapshot pinning) should hold until those fixes ship. Re-run a similar 5-agent dispatch after Tier 1-2 work lands to update the table.

---

## Maintenance debt (off-topic to delta map, parked here for tracking)

Items not part of the running→cycling delta but surfaced during this work — recorded here until a dedicated maintenance-debt doc warrants creation.

### Migration tracking divergence — `supabase/migrations/` vs `schema_migrations`

**Status:** open, not blocking. Surfaced 2026-05-14 during Tier 2 items 3+4 deploy.

**Problem:** Local `supabase/migrations/` has 35+ migration files going back to 2026-01-06 that the remote `schema_migrations` tracking shows as unapplied — but the schema is clearly in production (e.g., `athlete_snapshot.run_long_run_duration` lives in `20260221_create_deterministic_layer_tables.sql:107` and is actively read/written). The migrations were applied via the Supabase SQL editor or another path that bypassed `supabase migration up`, so the CLI-tracked state diverged from reality.

**Why it bites:** `supabase db push` walks the unapplied list. If anyone runs it (especially in CI or a fresh environment seed), it will attempt to re-run all 35+ — many will no-op via `IF NOT EXISTS` guards but several `CREATE TABLE` / `CREATE FUNCTION` statements without those guards will throw, leaving the migration in a partial-applied state. Caught this session by inspecting `supabase migration list` before running `db push`; pivoted to applying the new ALTER TABLE statements directly via SQL editor.

**Fix:** for each of the 35+ historical timestamps, run `supabase migration repair --status applied <timestamp>` to mark them as applied without re-running. After reconciliation, future `supabase db push` would only apply genuinely-new migrations.

**Why deferred:** the workaround (apply new migrations via SQL editor when adding them) works fine for human-driven deploys. The pain point only arrives if/when someone wires migrations into CI or stands up a non-prod replica. Worth doing before either of those happen, but not blocking current development. Estimated time: 30-60 min to script the 35 repair commands and run them.

**Cross-ref:** `docs/ENGINE-STATE.md` "Known broken" could be a better long-term home if a `MAINTENANCE-DEBT.md` is never created — same "filed, not blocking, here so it's not forgotten" semantics.
