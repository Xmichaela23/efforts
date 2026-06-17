# AREA — Analyzers (per discipline)

> Reverse-documentation of what the per-discipline workout analyzers actually do, derived from code (read-only audit, 2026-06-16). Describes behavior; does not judge or fix. Citations are `file:line` against the repo at audit time. Where a trigger or reachability could not be determined from code, it says so explicitly.

## What this area does (plain-language overview)

After a workout is ingested, the engine fans out to one of four discipline analyzers — `analyze-running-workout`, `analyze-cycling-workout`, `analyze-swim-workout`, `analyze-strength-workout`. Each reads the workout's sensor/series data plus the linked plan (if any) and the athlete's baselines, computes a deterministic set of facts for that discipline (pace/GAP/HR-drift for run; NP/IF/VI/TSS for ride; pace-per-100/pool-length for swim; e1RM/RIR/volume for strength), grades the session against the plan, generates an LLM coaching narrative through a shared reasoning scaffold + validator suite, and writes one large `workout_analysis` JSONB blob (plus a discipline fact packet and a pre-formatted `session_state_v1` display contract) back onto the `workouts` row. `analyze-workout/` and `analyze-workout-ai/` are **empty directories** — no code (confirmed: both directories contain no files). The actual fan-out lives in `ingest-activity` (per CLAUDE.md topology) with the same routing duplicated in `recompute-workout` and `bulk-reanalyze-workouts`.

## Features / flows

### Routing / dispatch (shared across all disciplines)

- **What it does:** Maps a workout `type` string to the correct analyzer edge function.
- **How it works:** Three independent copies of the same switch exist:
  - `recompute-workout/index.ts:28-37` (`resolveAnalyzeEdgeFn`): `run`/`running` → running; `ride` → cycling; `strength`/`strength_training` → strength; `swim`/`swimming` → swim; **default → `analyze-running-workout`** (mobility/unknown types fall to the run analyzer).
  - `bulk-reanalyze-workouts/index.ts:36-57` (`getAnalysisFunctionName`): same mapping but **default → `null`** (skips, marks `'skipped'`). Note it also has a separate `getWorkoutTypesForFilter` (lines 59-78) that intentionally retains `cycling`/`bike` synonyms for the historical-row query filter, even though dispatch only fires on `ride`.
  - Ingest fan-out (per CLAUDE.md `ingest-activity/index.ts:~1430-1580`) routes to `analyze-{running,cycling,strength,swim}-workout`.
- **Inputs / outputs:** Reads `workouts.type`; invokes the analyzer with `{ workout_id }` (+ `force_regenerate_ai_summary` from recompute).
- **Triggers:** `recompute-workout` is user-JWT-gated (`recompute-workout/index.ts:48-83`); ingest fan-out is webhook/service-role; `bulk-reanalyze-workouts` is user-JWT-gated and dry-run-by-default (`bulk-reanalyze-workouts/index.ts:108`). `process-workouts-batch` only invokes `compute-workout-analysis`, NOT the analyzers (`process-workouts-batch/index.ts:69`).

### Running analyzer

- **What it does:** Computes pace/GAP/HR-drift/elevation/interval facts, grades pace+duration adherence, builds `fact_packet_v1`, generates an LLM narrative, and (for goal races) a race debrief.
- **How it works:** `analyze-running-workout/index.ts` (4642 lines). POST `{ workout_id, force_weather_refresh?, force_regenerate_ai_summary? }` (index.ts:74-120). Reads `workouts` (sparse then lazy series), `user_baselines` (`performance_numbers, units, effort_paces, learned_fitness, configured_hr_zones`, index.ts:283-300), `planned_workouts` (index.ts:462-474), `plans` (index.ts:491-508), historical 90-day drift rows, goal-race + `race_courses`/`course_segments`. Pace unit is **sec/mi** throughout. GAP via `_shared/gap.ts` (Minetti 2002 metabolic-cost model). Pace facts come from the single-source resolver `_shared/run/run-scalars.ts` (`resolveRunScalars`, D-185), which delegates to `fact-packet/pace-resolution.ts` + `queries.ts`. Narrative is built in `_shared/fact-packet/ai-summary.ts` (`generateAISummaryV1`, index.ts:2172) which injects `buildReasoningScaffold(runAdapter, …)` + `validateNarrative` (ai-summary.ts:1182-1221).
- **Inputs / outputs:** Reads the above; writes `workouts.workout_analysis` (replaced wholesale, index.ts:2814-2844), `analysis_status`, `analyzed_at`. Uses RPC `merge_computed` to preserve `analysis.series` (index.ts:2497).
- **Triggers:** ingest fan-out for `type='run'`; `recompute-workout`; `bulk-reanalyze-workouts`.

### Cycling analyzer

- **What it does:** Computes NP/IF/VI/TSS/CTL-ATL-TSB/power-zones/power-adherence, classifies analysis mode (plan-linked vs unplanned-with/without-segments), writes a fact packet, generates LLM narrative, and persists segment efforts.
- **How it works:** `analyze-cycling-workout/index.ts` (2741 lines) + `_shared/cycling-v1/*`. POST `{ workout_id, force_regenerate_ai_summary? }` (index.ts:1466-1488). Reads `workouts`, `user_baselines` (`performance_numbers, units, weight`), `planned_workouts` (D-075 corrected columns `type`/`name`, index.ts:1573-1582), `goals`, 90-day history. **NP** is read canonical-first via `cycling-v1/np-trend.ts:26-46` (top-level `normalized_power` → `computed.analysis.power.normalized_power` → fallbacks); local recompute only as fallback (index.ts:486-505): 30s rolling avg → 4th-power mean → ^0.25. IF = NP/FTP, VI = NP/AP (`cycling-v1/build.ts:239-246`, with `compute-workout-analysis` overrides preferred). TSS = `(dur_s/3600)·IF²·100` (`ride-physiology.ts:56-70`). CTL/ATL = 42/7-day EMA (`ride-physiology.ts:91-108`). Narrative in `cycling-v1/ai-summary.ts` (`callLLM`, temp 0.2, maxTokens 220; injects `rideAdapter` scaffold + `validateNarrative` D-188, plus cycling-only validators: `ledeOpensWithArcFrame`, `summaryHasJargon`, `validateClaimsGrounded`, `validateNoNewNumbers`).
- **Inputs / outputs:** Writes `workouts.workout_analysis.{fact_packet_v1, flags_v1, session_state_v1, ai_summary, …}` (index.ts:2674-2705); DELETE+INSERT `cycling_segment_history` (non-fatal, index.ts:2411-2414).
- **Triggers:** ingest fan-out for `type='ride'`; recompute; bulk-reanalyze.

### Swim analyzer

- **What it does:** Resolves pool length, computes pace-per-100 (display-unit aware), duration/interval/execution adherence, HR-zone anchoring, equipment direction flags, and an LLM narrative with swim-specific post-checks.
- **How it works:** `analyze-swim-workout/index.ts` (820 lines). POST `{ workout_id }` (index.ts:97-111). Reads `workouts` (incl. `pool_length, pool_length_m, plan_pool_length_m, user_corrected_pool_length_m, pool_unit, swim_data`), `planned_workouts`, `user_baselines` (`configured_hr_zones, learned_fitness`), `plans`. Scalars via `_shared/swim/swim-scalars.ts` (`resolveSwimScalars`, D-182 — uses raw `moving_time`, NOT `computed.overall`). Pace via `_shared/swim/swim-pace.ts` (`swimPacePer100Seconds`: `per100 = unit==='yd' ? (d/0.9144)/100 : d/100`). Pool length via `_shared/swim/resolve-pool-length.ts` 4-tier cascade (user_corrected → device → planned → 25yd/25m default, `YARD_M=0.9144`). Narrative uses `swimAdapter` scaffold + `validateNarrative` + **swim-only `swimPostChecks`** (equipment-subset + rest-cause boundary; only swim has these), `callLLM` maxTokens 500 temp 0.3.
- **Inputs / outputs:** Writes `workouts.workout_analysis.{performance, detailed_analysis, session_state_v1}` (index.ts:770-773).
- **Triggers:** ingest fan-out for `type='swim'` (function is `analyze-swim-workout`, NOT `analyze-swimming-workout`); recompute; bulk-reanalyze.

### Strength analyzer

- **What it does:** Matches executed vs planned exercises, computes set/volume/weight/RIR adherence, reads canonical e1RM trend from `exercise_log`, builds a fact packet, generates LLM narrative.
- **How it works:** `analyze-strength-workout/index.ts` (2805 lines) + `enhanced-plan-context.ts`. POST `{ workout_id }` (index.ts:2370-2412). Reads `workouts` (`strength_exercises, workout_metadata, session_rpe, readiness`), `planned_workouts`, `user_baselines` (`units, performance_numbers, athlete_identity, learned_fitness`), `plans`, and **`exercise_log`** (`canonical_name, estimated_1rm, date`) for the e1RM trend (D-189). e1RM itself is NOT computed here — it is computed by `compute-facts` (Brzycki: `weight·(36/(37-effectiveReps))`, `effectiveReps=reps+rir`, capped at 30, rounded to 5 lb — `compute-facts/index.ts:116-125`) and only READ here via `getE1rmTrend` (index.ts:807-843), with a 2.5 lb dead-band for trend direction. Narrative via `callLLM` model `'sonnet'` (index.ts:2329), maxTokens 240, temp 0.3; injects `strengthAdapter` scaffold + `validateNarrative` (D-189).
- **Inputs / outputs:** Writes `workouts.workout_analysis.{performance, detailed_analysis, session_state_v1, strength_facts, ai_summary, strength_fact_packet_v1, recomputed_at}` (index.ts:2702-2725).
- **Triggers:** ingest fan-out for `type='strength'`; recompute; bulk-reanalyze.

### Narrative generation (shared reasoning core + per-discipline assembly)

- **What it does:** Single-sources the *reasoning logic* (7 universal rules + a validator suite) while keeping prompt *assembly* per-discipline (work-order guardrail #1, `narrative-core/index.ts:1-5`).
- **How it works:** `_shared/narrative-core/`. `buildReasoningScaffold(adapter, packet)` (`scaffold.ts:10-37`) emits the same 7-rule block for every discipline, parameterized by a `DisciplineAdapter` (`adapters/{run,ride,swim,strength,coach}.ts`). `validateNarrative` (`validate.ts:38-110`) runs lexical-deterministic checks (Rule 1 dropped-lead-signal, Rule 2 unreconciled-atypical, Rule 3 anchorless-HR, Rule 4 cause/state-diagnosis, Rule 5a/b/c readiness/fitness/direction verdicts). Each analyzer reaches this differently:
  - **Run:** via `fact-packet/ai-summary.ts` (imports `runAdapter`, `buildReasoningScaffold`, `validateNarrative`; ai-summary.ts:6). `index.ts` itself imports neither directly.
  - **Ride:** via `cycling-v1/ai-summary.ts` (imports `rideAdapter`/narrative-core). `index.ts` itself imports neither directly.
  - **Swim:** `index.ts` imports narrative-core directly (4 references) and adds `swimPostChecks`.
  - **Strength:** `index.ts` imports narrative-core directly (5 references).
- **Model:** `_shared/llm.ts` centralizes model choice. **Default model is `haiku`** (`claude-haiku-4-5-20251001`, llm.ts:35,41). `sonnet`=`claude-sonnet-4-6`, `opus`=`claude-opus-4-6`. Strength explicitly requests `'sonnet'`; run/ride/swim call `callLLM` without an explicit model → **default haiku** (verify per call site). Temperatures: run 0.2 (retry 0), ride 0.2, swim 0.3, strength 0.3. MaxTokens: run 350, ride 220, swim 500, strength 240.
- **Triggers:** runs inside each analyzer's narrative block, gated on `ANTHROPIC_API_KEY` presence; soft-accepts after one corrective retry (never regresses to empty).

### Cross-discipline divergence & duplication

- **Fact-packet substrate diverges by discipline.** Run uses `_shared/fact-packet/` (`FactPacketV1`, `version: "2.0"` meta / `version: 1` packet). Ride uses `_shared/cycling-v1/` (`CyclingFactPacketV1`, `version: 1`). Swim and strength build their packets **inline in their own index.ts** (swim has `strength_facts`-style `stroke_analysis`; strength has `strength_fact_packet_v1`). There is no unified fact-packet type across the four.
- **`response-model/` is NOT used by any discipline analyzer.** It is consumed by the week/block coach surfaces (`response-model/index.ts:5-11`; importers are `strength-profiles.ts`, `race-readiness/projection-facts.ts`, coach/context generators) — not the per-workout analyzers.
- **Single-source resolvers, one per discipline, all introduced to fix the same class of bug** (each surface re-deriving its own scalar): run `resolveRunScalars` (run-scalars.ts), swim `resolveSwimScalars` (swim-scalars.ts), ride `rideComputedNp` (np-trend.ts). The run-scalars header (run-scalars.ts:9) explicitly names this as "Mirrors swim's resolveSwimScalars and ride's rideComputedNp." Strength has no scalar resolver — its single-source is `exercise_log` (the e1RM table).
- **Adherence math is independently implemented per discipline** (different formulas, different weightings — see matrix in Redundancies below).

## Edge cases & conditional handling

### Running (`analyze-running-workout/`)
- **No sensor data:** early return `{ adherence_percentage: 0, performance_assessment: 'Unable to assess' }` (index.ts:572-589).
- **No HR data:** filter to valid HR samples; skip drift if <1 min (index.ts:60-78, 1180-1182).
- **No elevation:** GAP reverts to raw pace; `basis:'raw'` (`gap.ts:170-172`). `hasUsableElevation` requires ≥60 samples, >50% elevation coverage, ≥5m range (`gap.ts:126-147`).
- **GAP negligible-grade / extreme-downhill guards:** no adjust for |grade|<0.3% (`gap.ts:41`); skip if cost≤0.5 (`gap.ts:44`). Idempotent via `raw_pace_s_per_mi` marker (`gap.ts:166-169`).
- **No planned link (`planned_id` null):** D-035 nulls adherence fields (index.ts:1505-1514); intervals=[] (index.ts:515-525).
- **No baselines:** hardcoded defaults `{fiveK_pace:450, easyPace:540,…}` (index.ts:449-454).
- **Pace adherence is ASYMMETRIC by interval type** (work/recovery/easy/warmup) — separate slow-vs-fast penalty curves (`lib/adherence/pace-adherence.ts:17-130`). Recovery slower-than-target is always 100%.
- **Variance gate** (`lib/variance-gate.ts:90-142`): `is_mixed_effort` via plan steps ≥2 / interval-like type / detected intervals / pace CV≥8% (GAP basis). Pace CV uses outlier cap `PACE_OUTLIER_MAX_SEC_PER_MI=1800` (D-039).
- **Fast-finish detection:** last segment ≥5% faster → base/finish split (index.ts:877-986).
- **Drift windows:** skip first 10 min warmup; ≥15 min minimum; tempo-finish/progressive exclude trailing portion; terrain adj 4 bpm/1% grade; weather adj (>82°F +8, 75-82 +4, <50 −2) (`lib/heart-rate/drift.ts:22-327, 445-493`).
- **Goal-race path:** marathon race narrative + course strategy + AI summary suppressed for race (index.ts:2548-2754).
- **Duration-unit repair (non-fatal, mutates state):** legacy `duration_s_moving` 60× bug backfill (index.ts:1959-1993).
- **Treadmill/indoor:** not explicitly gated; absence of elevation → raw pace.
- **Manual entry:** no sensor data → early return.

### Cycling (`analyze-cycling-workout/`)
- **No power meter:** try 5 series sources then empty (index.ts:1101-1184); NP→null ⇒ IF/VI null; `fallbackClassifyIntent` returns 'unknown' (build.ts:97).
- **No FTP:** IF null, `ftp_quality='missing'`, conservative classification on VI/duration/elevation (build.ts:283-293).
- **No HR:** `analyzeHeartRate` returns `{available:false}` (index.ts:1037-1046).
- **No weight:** W/kg path unavailable; limiter falls to NP-trend (index.ts:1544, cross-workout-queries.ts:497-502).
- **No planned link:** performance fields nulled (D-035, index.ts:1805-1828) but cross-workout history STAYS populated (honest history).
- **Short ride:** decoupling omitted if pedaling span <20 min; VAM null if gain<30m or time<120s (`ride-physiology.ts:141-152, 177`).
- **Indoor/trainer:** NOT detected — power treated identically outdoor vs trainer (CYCLING-PROTOCOL.md §9 known gap).
- **VI/IF terrain gate (D-084):** VI≥1.10 + IF≥0.85 ⇒ classify climbing (elev≥40 ft/mi) else tempo (index.ts:99-114).
- **Cross-workout queries all non-fatal** (PRs, vs_similar, goals, 90-day NP/TSS, segment upsert, arc context, spine verdict) — try/catch + warn (index.ts:2063-2365).
- **Duration 60× unit repair** (index.ts:1958-1985); **HR-series scoping** + **HR average 3-stage fallback** (Q-007, index.ts:2250-2261).
- **Variance gate:** VI≥1.05 & CV≥12 ⇒ mixed-effort ⇒ drop cross_workout, use interval_summary.

### Swim (`analyze-swim-workout/`)
- **Wrong sport / no workout:** 400 (index.ts:185-204).
- **Pool-length 4-tier cascade + yd/m display heuristic** (resolve-pool-length.ts:30-41; display: 22-24m or 44-47m range shown as yards, index.ts:338-343).
- **Open water:** `isPool=false`, no pool-length display (index.ts:329).
- **No moving/elapsed time:** scalars null (index.ts:334, 387-390); `minutesOrSecondsToSeconds` heuristic `<1000⇒minutes` (swim-scalars.ts).
- **No planned intervals:** per-interval adherence → null (D-035, index.ts:347, 370-373).
- **HR-zone anchoring:** `configured_hr_zones` else Friel %LTHR from `learned_fitness.run_threshold_hr` else null (index.ts:419-447) — **uses RUN threshold for swim** (see Discrepancies).
- **Equipment direction flags:** optimistic `/fin|buoy|pull|paddle/`, pessimistic `/kick|board|drill|catch.?up|single.?arm|scull/` (index.ts:468-472); `swimPostChecks` enforces equipment-subset + no rest-cause diagnosis (index.ts:605-619, D-192).
- **No `ANTHROPIC_API_KEY`:** fallback templated insights (index.ts:719-723).
- **Strava swims:** `swim_data=NULL` ⇒ SWOLF/stroke_rate null, stroke_type defaults 'Freestyle' (index.ts:715-716).
- **Markdown stripping** drops short/header-only lines (index.ts:636-654).

### Strength (`analyze-strength-workout/`)
- **Bodyweight / time-based (plank, wall sit, hold):** weight forced 0 if <10 lb; excluded from volume (index.ts:873-877, 916-925).
- **Set "completed" if** `completed===true || reps>0 || weight>0 || duration_seconds>0` (index.ts:612-616) — a weight-only set with no reps counts as completed.
- **Missing RIR:** set excluded from RIR aggregate; data-quality flag (index.ts:652, 1150-1158).
- **Unknown exercise (no plan match):** `matched:false`; still volume-counted; canonicalized for `exercise_log` (index.ts:539-545).
- **Unilateral exercises:** no per-leg correction (volume halved vs bilateral).
- **AMRAP:** `Number("max")=NaN`; comparisons fail silently, no crash.
- **Supersets:** no grouping logic; treated as separate exercises.
- **No planned link:** freestyle mode, all `matched:false` (index.ts:2200-2205).
- **Missing session RPE / readiness:** null, prompt notes "Not provided" (index.ts:1881-1940).
- **Mixed units (plan vs user):** `convertWeight` kg↔lb factor 0.453592 (index.ts:253-270).
- **Transition window:** `is_transition_window`/`suppress_deviation_language` guards (index.ts:2584-2616).
- **RIR verdict thresholds ±1.5** (index.ts:669-674) — differs from strength-profiles ±1.0 (see Discrepancies).

## Redundancies / duplication (observed, not judged)

**Cross-discipline duplication matrix — same computation, implemented separately per discipline:**

| Concern | Run | Ride | Swim | Strength |
|---|---|---|---|---|
| Routing switch | duplicated 3× (recompute, bulk-reanalyze, ingest) — default differs (run vs null) | same | same | same |
| Single-source scalar resolver | `resolveRunScalars` (run-scalars.ts) | `rideComputedNp` (np-trend.ts) | `resolveSwimScalars` (swim-scalars.ts) | none (uses `exercise_log`) |
| Pace/speed primary metric | pace sec/**mi** | NP watts | pace-per-100 (display unit) | n/a (load) |
| Grade/effort adjustment | GAP via `_shared/gap.ts` | VI/elevation-density gate | n/a | n/a |
| Effort anchor | HR zones (Friel from run threshold) | FTP + HR-at-power | HR zones (Friel from **run** threshold) | RIR (no HR) |
| Duration adherence | `(actual/planned)·100` ±10% band, ×0.5 in exec (index.ts) | `max(0,100−|Δ|/planned·100)`, 30% of exec (index.ts:868-908) | elapsed vs planned, uncapped, 50% blend (index.ts:386-399) | not a session-level scalar |
| Execution score weighting | pace 0.5 + duration 0.5 | power 0.7 + duration 0.3 | pace 0.5 + duration 0.5 (clamped) | exercise 0.3 + set 0.2 + load 0.3 + RIR 0.2 |
| HR drift | full windowed/terrain/weather-adjusted (drift.ts) | first-half vs second-half (index.ts:1052-1061) | not computed | not computed |
| Adherence-null on no-plan | D-035 | D-035 | D-035 | freestyle mode |
| Fact packet type | `FactPacketV1` (`fact-packet/`) | `CyclingFactPacketV1` (`cycling-v1/`) | inline in index.ts | `strength_fact_packet_v1` inline |
| LLM model | default (haiku) | default (haiku) | default (haiku) | explicit `'sonnet'` |
| Narrative scaffold reach | via `fact-packet/ai-summary.ts` | via `cycling-v1/ai-summary.ts` | direct in index.ts | direct in index.ts |
| Validators beyond shared core | none | 4 cycling-only (jargon/lede/grounded/no-new-numbers) | `swimPostChecks` (equipment, rest-cause) | none |

**Other observed duplication:**
- **e1RM dead-band vs RIR-verdict dead-band vs trend dead-band** are three different magic numbers (2.5 lb e1RM trend, ±1.5 RIR verdict in analyzer, ±1.0 in strength-profiles).
- **`getWorkoutTypesForFilter` retains `cycling`/`bike`** synonyms (bulk-reanalyze) that the dispatch switch no longer fires on — query-side vs dispatch-side type lists are deliberately out of sync (commented, index.ts:44-48).
- **Duration 60× unit-bug repair** is implemented separately in both run (index.ts:1959-1993) and ride (index.ts:1958-1985).
- **HR-zone Friel %LTHR construction** (z1 0.75 / z2 0.85 / z3 0.92 / z4 0.98) appears in both run (index.ts:992-1018) and swim (index.ts:419-447).

## Discrepancies & flags (for human review)

1. **Swim HR zones derive from the RUN threshold.** `analyze-swim-workout/index.ts:432` reads `learned_fitness.run_threshold_hr` to anchor swim HR zones. SPEC-honest-swim-inference.md (line ~50) cautions swim HR runs ~10-15 bpm below run HR for the same effort; the prompt is told to stay neutral, but the zone numbers themselves use a run anchor. Intentional fallback or latent mislabel — for human review.
2. **Strength e1RM formula: code uses Brzycki, docs/STRENGTH-ANALYSIS.md §2.2 says Epley.** `compute-facts/index.ts:116-125` is Brzycki (`weight·36/(37−effectiveReps)`). Doc/code drift — flag, do not change.
3. **RIR-verdict threshold mismatch:** analyzer uses ±1.5 (`analyze-strength-workout/index.ts:669-674`); `strength-profiles.ts:126-129` (`VERDICT_DEVIATION ADD_WEIGHT 1.0 / BACK_OFF −1.0`) uses ±1.0. A 0.5-1.0 RIR delta reads "on_target" in analysis but "ADD_WEIGHT/BACK_OFF" in adapt logic.
4. **e1RM read-before-write ordering assumption.** The strength analyzer READS `exercise_log.estimated_1rm` (index.ts:807-843) but does NOT write it — `compute-facts` writes it. If the analyzer runs before compute-facts, the e1RM trend is stale/empty. Verify ingest fan-out order (CLAUDE.md says compute-facts is in the fan-out; ordering vs analyze-* not confirmed from this area's code).
5. **Default-route footgun.** `recompute-workout` routes unknown/mobility types to `analyze-running-workout` (index.ts:36); `bulk-reanalyze` routes unknown to null (skip). Same intent, divergent default — a non-run mobility workout recomputed manually gets run-analyzed.
6. **Empty analyzer directories.** `analyze-workout/` and `analyze-workout-ai/` contain no files (confirmed). Referenced by name in older docs; reachable trigger unclear from code — appear dead.
7. **Cycling deferred-but-implemented helpers (dead-for-analysis):** `computeRideEfficiency` (HR@power), `aerobic_decoupling_pct`, `computeRideVam` exist in `ride-physiology.ts:112-182` but are **never called** by the analyzer (Cycling-Analysis-Design Build Orders #4/#5 deferred). Narrative cannot cite them.
8. **Strength protocols/placement (`shared/strength-system/protocols/`, `placement/`) are NOT imported by the analyzer** — they are plan-generation code. Dead-for-analysis; a reader might assume they shape analysis (they don't).
9. **Cadence prescribed in CYCLING-PROTOCOL.md §8 is not implemented** — no cadence field reaches the analyzer or narrative (documented gap).
10. **Cross-sport key scrub (D-077):** `runOnlyKeyScrub` (cycling index.ts:2585) exists to null run-only keys left when a ride is mis-routed to the run analyzer — implies the router can mis-classify `type='run'` on bike data; analyzer can't prevent, only clean the render.
11. **Swim duration precision loss:** integer-minute storage (`<1000⇒minutes`) means durations like 18:12 round to 18:00 (swim-scalars.ts:10-11; AUDIT-swim-2026-06-14 line 39).
12. **`process-workouts-batch` does NOT call any analyzer** — only `compute-workout-analysis` (index.ts:69). A batch "process" leaves `workout_analysis` un-regenerated; trigger/intended use of this function vs bulk-reanalyze is unclear from code.
13. **Client `src/lib/effort-score.ts` is a separate pace/projection surface** (VDOT-table fitness score → training paces, Riegel-like projections via `getProjectedFinishTime`). It is NOT a mirror of analyzer execution math, but it is a second, client-side place where pace/distance/time projections are computed (table-interpolation vs the server's `_shared/riegel.ts` power-law). Two different projection methods coexist — flag for the human (no shared source).

## Cross-references

- **DECISIONS-LOG:** D-035 (no adherence without prescription), D-036 (GAP enrichment), D-039 (pace outlier cap), D-046/D-076 (lede/jargon narrative rules), D-075 (cycling planned-column fix), D-077 (cross-sport key scrub), D-078 (force_regenerate_ai_summary), D-084 (VI/IF terrain gate), D-102/D-103 (auth), D-112/Q-054 (zero-not-null), D-163/D-167/D-179/D-182/D-183/D-190/D-192 (swim), D-178/D-185 (run-scalars single-source), D-187/D-188/D-189 (narrative-core legs), D-084 cycling.
- **SPECs/Protocols:** docs/RUN-PROTOCOL.md, docs/PHASE-1-RUN-PACE-SPEC.md, docs/RUN-HR-DRIFT-SPEC.md, docs/CYCLING-PROTOCOL.md, docs/CYCLING-ANALYSIS-DESIGN.md, docs/SWIM-PROTOCOL.md, docs/AUDIT-swim-2026-06-14.md, docs/SPEC-honest-swim-inference.md, docs/STRENGTH-PROTOCOL.md, docs/STRENGTH-ANALYSIS.md, docs/SPEC-universal-narrative-inference.md, docs/WORK-ORDER-narrative-core.md, docs/RUNNING-CYCLING-DELTA.md.
- **Other audit areas:** 01-ingestion (fan-out order, routing), 03-spine-snapshot (cross_workout trend/spine verdicts consumed by ride/run narrative), 05-compute-contracts (`compute-facts` e1RM/Brzycki, `compute-workout-analysis`, `session_detail_v1`, resolvers), 06-screens (client `effort-score.ts`, where client re-derives vs reads server).
