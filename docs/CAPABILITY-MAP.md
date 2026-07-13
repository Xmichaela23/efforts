# CAPABILITY MAP — "does X exist, and where?"

## 🔴 THE LIVING DOCS — read these, and UPDATE these every session

These 5 docs are ALIVE — updated basically every working session. If you touch the app, you update them (see the end-of-session protocol in `CLAUDE.md`). **Everything else in `docs/` is reference and mostly stale — verify before trusting.**

| Doc | What it is | Update when |
|---|---|---|
| `DECISIONS-LOG.md` | WHY things are the way they are (numbered D-NNN) | you make a non-obvious design choice |
| `OPEN-QUESTIONS.md` | things noticed + left on purpose, or deferred bugs (numbered Q-NNN) | you notice something and choose to leave it, or resolve a Q |
| `ENGINE-STATE.md` | current state: what's Solid / Known-broken / Questioned right now | anything ships, breaks, or becomes suspect |
| `POLISH-PUNCH-LIST.md` | the work queue | items close or get added |
| `CAPABILITY-MAP.md` (this) | what exists + where + built/broken status | you discover a capability's real status, or ship something that changes it |

---


**Purpose:** the lookup that stops us re-inventing shipped infrastructure. Before proposing to build ANYTHING, find the capability here, then grep its entry point and read it (see the `CLAUDE.md` top banner: **trace-before-build**). This app is BUILT — the job is wiring/continuity, not features.

**How to use:** Ctrl-F the capability. If it's `BUILT`, don't rebuild it — wire into it. If `PARTIAL`/`SEAM`/`STUB`, that's the real edge. Entry points are `file:approx-line` (lines drift — grep the symbol).

**Status legend:** `BUILT` = works end-to-end · `PARTIAL` = works but fragile/incomplete/known-caveat · `SEAM` = documented extension point, not built · `STUB` = placeholder/provisional numbers · `DEAD` = exists, zero callers.

**Keep it alive:** update a row when you discover its real status or ship something that changes it. One line per capability. First cut swept 2026-07-11 (5 parallel readers, verified by code-read).

---

## ⚠️ Read first — the "I almost rebuilt this" list + cross-cutting risks

- **FTP is learned from riding AND proactively suggested AND user-adoptable — fully wired.** `learn-fitness-profile` → `learned_fitness.ride_ftp_estimated` → proactive suggest in **`adapt-plan:396/966`** (≥5% delta, writes `performance_numbers.ftp`) → adopt UI in `TrainingBaselines.tsx:1268`. (Corrects an earlier mis-trace: the proactive path is NOT strength-only; it lives in `adapt-plan`, not `capacity-resolver`.) **Caveat:** the proactive path sits inside `adapt-plan`, which is flagged "never really worked" (Q-155) — built in code, reliability questioned.
- **Bike aerobic decoupling IS computed** (`analyze-cycling-workout:2601`) but **NOT stored** as a field → it's a persist job, not a compute build, if ever wanted. (Run stores its decoupling; bike drops it.)
- **`bulk-reanalyze-workouts` only re-runs the analyzer — NOT compute-facts/compute-snapshot** → workout_facts + athlete_snapshot go **stale** on a bulk backfill. Use `recompute-workout` (full ordered pipeline) for a correct single-workout backfill.
- **Continuity risks (surfaces that hold/derive their own copy of a spine fact):**
  - `useStateTrends.ts:231` — client keeps a **full copy** of the spine's State assembly (live-fallback); only inert while the S2 display contract is present.
  - `GoalsScreen.tsx:530-621` — computes fitness/volume labels **locally**, not from a spine fact.
  - `per-domain-load.ts` — cross-sport % **uncalibrated** (attribution keys on composition share, not per-slice ACWR).
  - `fitness-fatigue.ts` — CTL/ATL is a **STUB** ("uncalibrated — drives no verdict").
- **Single-sport plans:** only **get-stronger** and **run non-race** build real plans; bike-only/swim-only/hybrid + all single-sport frequency numbers are **STUB** below the F-9 seam. Swim-only product deliberately removed.

---

## Baselines & fitness-learning

| Capability | Entry point | Status | Notes |
|---|---|---|---|
| `user_baselines` store (performance_numbers=typed anchor, learned_fitness=auto, athlete_identity, dismissed_suggestions) | migrations `_create_user_baselines` etc. | BUILT | One-row-per-user JSONB |
| Learn FTP/paces/HR/swim from 90d activity → learned_fitness | `learn-fitness-profile/index.ts:131` | BUILT | Fans out runs/rides/swims + CSS + identity; auto after milestone ingest + post-race; manual button `TrainingBaselines:414` |
| FTP learned from riding (ride_ftp_estimated, 4-tier, conf+samples) | `learn-fitness-profile/index.ts:743` | BUILT | 20-min×.95 → NP-hard×.95 → avg×1.05×.95 → fallback; ratchet floor guard |
| resolveCurrentFtp (learned med/high → manual → learned-low → null) | `src/lib/resolve-current-ftp.ts:62` | BUILT | Pure, client+edge; used in Baselines, cycling analyzer, coach, garmin sync |
| Proactive FTP suggest + apply | `adapt-plan/index.ts:396` (gen), `:966` (apply) | BUILT | ≥5% delta + conf≥med → suggestion; apply writes performance_numbers.ftp; surfaced `useCoachWeekContext:601`. ⚠ inside questioned adapt-plan (Q-155) |
| Proactive easy-run-pace suggest + apply | `adapt-plan/index.ts:353/935` | BUILT | Same 5% gate; learned sec/km→sec/mi |
| suggestBaselineUpdate (generic gated suggest engine) | `_shared/state-trend/reconcile.ts:46` | BUILT | ≥3 samples, ≥med conf, ≤42d, ≥5% divergence; used by capacity-resolver (strength) |
| resolveStrengthCapacity (1RM: typed wins, learned gap-fills+suggests) | `_shared/state-trend/capacity-resolver.ts:125` | BUILT | Owns lift-key canon; coach reads it (prescribe+judge) |
| Learned-FTP adopt UI ("Clear to use auto-learned {W}") | `src/components/TrainingBaselines.tsx:1268` | BUILT | Zones render off resolveCurrentFtp |
| Strength/swim adopt-in-UI (confirm→writes performance_numbers) | `src/components/AthleticRecordPage.tsx:397` | BUILT | Confirm-only; acted keys session-local (no cross-session cooldown) |
| 5K-time adopt nudge (Yes writes fiveK / No → dismissed_suggestions) | `TrainingBaselines.tsx:1176`; `arc-context.ts:579` | BUILT | — |
| Run pace learning (threshold/easy pace-at-HR, sec/km) | `learn-fitness-profile/index.ts:505` | BUILT | HR-anchored ±5bpm of learned threshold HR |
| HR-zone learning (easy/threshold/race/max observed) | `learn-fitness-profile/index.ts:536/772` | BUILT | Anchors threshold not max; ride threshold needs power>P75 |
| Swim pace + CSS learning | `learn-fitness-profile/index.ts:267` | PARTIAL | Median s/100m BUILT; learned CSS staged OFF-precedence (SWIM_CSS_LIVE gate) |
| athlete_identity inference | `_shared/athlete-identity-inference.ts` | BUILT | Skipped once confirmed_by_user |
| dismissed_suggestions cooldown persistence | `TrainingBaselines.tsx:486` | PARTIAL | Persisted only for five_k_nudge; strength/swim use in-memory actedKeys |
| resolvePaceCapacity (unified pace/FTP capacity resolver) | `capacity-resolver.ts:182` | SEAM | Documented D-231 seam; pace suggest currently ad-hoc in adapt-plan/arc-context |

## Ingest → analysis pipeline

| Capability | Entry point | Status | Notes |
|---|---|---|---|
| Ingest fan-out (orchestrator) | `ingest-activity/index.ts:1433` | BUILT | Per import: summary, analysis, workload, adaptation-metrics, facts, cache-invalidate, sport analyzer, adapt-plan auto, milestone post-import pipeline |
| compute-facts (deterministic layer) | `compute-facts/index.ts:1615` | BUILT | workout_facts + exercise_log + session_load; tail invokes match-cores + compute-snapshot |
| analyze-running-workout (reference analyzer) | `analyze-running-workout/index.ts:2981` | BUILT | Richest; decoupling (GAP), hr_drift, efficiency, heart_rate_summary, ai_summary, fact_packet |
| analyze-cycling-workout | `analyze-cycling-workout/index.ts:2682` | PARTIAL | bike_fitness_v1 (HR-at-band+w20), fitness_v1 (CTL/ATL). decoupPct computed @2601 but NOT stored; race_debrief always null |
| analyze-strength-workout | `analyze-strength-workout/index.ts:2922` | BUILT | execution_summary, test_result_v1 (tests suppress framing, D-208) |
| analyze-swim-workout | `analyze-swim-workout/index.ts:815` | PARTIAL | Thinnest; efficiency signal "rarely fires" (no reliable swim-efficiency yet). NOTE: fn is analyze-swim not analyze-swimming |
| compute-workout-summary → workouts.computed | `compute-workout-summary/index.ts:2160` | BUILT | intervals/series/overall; preserves analysis.series |
| compute-workout-analysis (series/charts) | `compute-workout-analysis/index.ts` | BUILT | Separate fan-out target; series preserved into computed |
| compute-snapshot → athlete_snapshot | `compute-snapshot/index.ts:756` | BUILT | Per user+week: state_trends_v1, workload, acwr, aggregates, interference, intensity_distribution |
| recompute-workout (user backfill — CORRECT path) | `recompute-workout/index.ts:88` | BUILT | Full ordered: analysis→facts→analyzer→snapshot+cache-invalidate (D-178) |
| bulk-reanalyze-workouts (bulk backfill) | `bulk-reanalyze-workouts/index.ts:208` | PARTIAL | ⚠ Only re-runs analyzer — NOT facts/snapshot → those go stale |
| Storage layers (computed / workout_analysis / workout_facts / athlete_snapshot) | (above writers) | BUILT | 4 non-interchangeable layers; cycling key-scrub avoids stale run keys |

## Fitness verdicts (State spine) & load

| Capability | Entry point | Status | Notes |
|---|---|---|---|
| State spine assembly (ONE code path, client+server) | `_shared/state-trend/assemble.ts:104` | BUILT | Both useStateTrends + compute-snapshot call it → structural single-source; → state_trends_v1 incl. `display` (S2) |
| Shared trend classifier (window/staleness/provisional/dead-band) | `_shared/state-trend/classify.ts:40` | BUILT | Every discipline routes through it; stale verdict→needs_data |
| Cadence-scaled thresholds (Q-052) | `_shared/state-trend/thresholds.ts:46` | BUILT | ⚠ run/swim %-thresholds flagged PROVISIONAL |
| Run decoupling (durability LEAD) | `run.ts:194` `computeRunDecouplingState` | BUILT | Excludes raw-basis, heat/RPE-confounded, non-steady, <20min (D-275) |
| Run efficiency_index (SECONDARY) | `run.ts:86` | PARTIAL | Secondary only; GAP-pace verdict dropped (Q-110) |
| frielBand / decouplingBandDisplay (ONE band vocab) | `run.ts:110/137` | BUILT | D-276: TWO states at the 5% science line — `sound`(<5%)/`needs_work`(≥5%); dropped the `<0 excellent`+`>10 gap` convention tiers. Shared by PERFORMANCE + AERO + coach + workout card so surfaces can't diverge |
| Bike terrain-binned power (LEAD) | `bike-fitness.ts:111` | BUILT | climbing vs flat_sustained bins |
| Bike HR-at-power efficiency (SECONDARY) | `bike-fitness.ts:128` + eligibility `:50` | PARTIAL | ⚠ was artifact-prone (fake −5.5%, Q-117); now gated steady-aerobic + ≥10min dwell + <90% FTP (D-275). Fundamentally window-fragile — fitness truth is FTP, not this |
| Swim pace/100 + rest-fraction | `swim.ts:42/97` | PARTIAL | ⚠ Q-038 ingest bug → pace unreliable, mostly needs_data |
| Strength volume (LEAD) + per-lift e1RM (SECONDARY) | `strength.ts:105/60` | BUILT | Per-lift direction serialized to spine (D-270); coach reads, no re-derive |
| fitnessDirection rollup (`rollupFitness`) | `assemble.ts:319` | BUILT | D-276/Q-162: SOLID verdicts decide the direction; a provisional/thin discipline can't ASSERT it — `thinHeldOut` names the held-out mover so the narrative flags the gap. `rollupFitnessDirection` now a thin wrapper |
| BODY holistic Heart-rate response (`rollupHrResponse`) | `assemble.ts` (rollupHrResponse) → coach inject | BUILT | D-279: ONE BODY signal from the SPINE — run aerobic decoupling + bike HR-at-power, swim excluded (in-water HR unreliable, named in provenance). Provisional-aware; "as of" = OLDEST contributor. Replaced the coach's run-only re-derived drift |
| Cardio vs strength load formulas | `_shared/workload.ts:189/324` | BUILT | Output-first ladder power/FTP→HR→sRPE→duration (D-238) |
| Workload provenance / low-trust methods | `_shared/workload.ts:340` | BUILT | Estimated vs measured; feeds ACWR disclosure |
| ACWR core + status classifier | `_shared/acwr.ts:155`, `acwr-state.ts:31` | BUILT | Sole authority (D-236); thin-base→null |
| Two-key load verdict reconcile (sole load verdict) | `_shared/load-status-reconcile.ts:64` | BUILT | ACWR describes, never decides (D-260/264/266). D-280: adds a `productive` state (real elevation absorbed — Garmin/COROS field-std) + `acwrProvisional` flag (thin-base ratio, keyed on `spikeOnEmptyBase`). ⚠ Q-166 (UNPROVEN — filed on one WK-1 screen, where the ratio is contaminated): a cross-training-heavy real total-load spike may under-read to on_target/"balanced". **The fix it prescribes is UNLAWFUL — attempted as D-281, shipped a false "pull back", REVERTED. The ratio may never `raise()`; only the descriptive `productive` relabel is available. Read D-281 first.** |
| LoadBar composition bar | `src/components/LoadBar.tsx:63` | BUILT | Verdict leads, by-discipline strip, ACWR demoted |
| Per-domain load slices | `_shared/per-domain-load.ts:137` | PARTIAL | ⚠ cross-sport % uncalibrated; keys on composition share; coach-only (D-263) |
| Fitness-fatigue (CTL/ATL/TSB) | `_shared/fitness-fatigue.ts:73` | STUB | "uncalibrated — drives no verdict"; per-domain scaffolded not built |

## Plan generation & scheduling

| Capability | Entry point | Status | Notes |
|---|---|---|---|
| Goal→engine ROUTER (mode/sport/goal_type dispatch) | `create-goal-and-materialize-plan/index.ts:2180` | BUILT | Non-race short-circuit → event tri/run split |
| week-optimizer (sole scheduling authority) | `_shared/week-optimizer.ts:1075` | BUILT | Owns every day-assignment; same-day matrix in schedule-session-constraints.ts |
| reconcile-athlete-state-week-optimizer (plumbing) | `generate-combined-plan/reconcile-...ts:237` | BUILT | Runs unconditionally; self-short-circuits if long_run_day missing |
| generate-combined-plan (multi-sport, triathlon-shaped) | `generate-combined-plan/index.ts` | BUILT | Only engine reading optimizer; returns NO plan for single-sport (F-9/F-12) |
| materialize-plan (token expansion → computed.steps) | `materialize-plan/index.ts` | BUILT | Resolves paces/FTP/1RM; applies plan_adjustments |
| generate-run-plan (single-sport run) | `generate-run-plan/index.ts` | BUILT | Event run + non-race retest head; NOT via optimizer |
| generate-strength-plan (Get Stronger, strength-primary) | `generate-strength-plan/index.ts` | BUILT | 4-day U/L/U/L + maintenance endurance |
| generate-triathlon-plan (event tri, standalone) | `generate-triathlon-plan/index.ts` | BUILT | Superseded for multi-goal by combine flag → buildCombinedPlan |
| Non-race routing: get-stronger → generate-strength-plan | `create-goal.../index.ts:2383` | BUILT | Gate: strength develops, no endurance develops, commercial_gym |
| Non-race routing: run non-race → generate-run-plan | `create-goal.../index.ts:2452` | BUILT | D-218; combined can't build single-sport run |
| Non-race routing: tri non-race → buildCombinedPlan | `create-goal.../index.ts:2552` | BUILT | Only non-race shape combined handles |
| session-frequency-defaults: TRIATHLON matrix | `src/lib/session-frequency-defaults.ts:151` | BUILT | Real hours×days cells |
| session-frequency-defaults: RUNNING/CYCLING matrix | `session-frequency-defaults.ts:184/193` | STUB | "PROVISIONAL — NOT SCIENCE-FINAL" (F-9 gate #2 pending) |
| Non-race: bike-only / swim-only / hybrid | (no live branch) | STUB | 0/16 non-race combos materialize on combined; swim-only removed |
| combine flag (event goals → unified combined) | `create-goal.../index.ts:2639/3095` | BUILT | Multi-goal events → combined engine |
| generate-plan (legacy) | `generate-plan/index.ts` | DEAD | Validation-only; zero callers |

## Coach & display surfaces

| Capability | Entry point | Status | Reads-from |
|---|---|---|---|
| Coach week payload (weekly_state_v1) + serve | `coach/index.ts:949` | BUILT | spine state_trends_v1, plans, workouts → weekly_state_v1 incl trends.display |
| coach_cache stale-while-revalidate (version-gated) | `coach/index.ts:977/5443`; VERSION=79 | BUILT | coach_cache |
| S2 State display contract (trends.display) | `assemble.ts:272`; fwd `coach:5278` | BUILT | server assembleStateTrends → client renders verbatim |
| State screen (StateTab) | `src/components/context/StateTab.tsx:940` | BUILT | weekly_state_v1 + trends.display |
| useStateTrends (contract-first, live fallback) | `src/hooks/useStateTrends.ts:54/231` | PARTIAL | ⚠ fallback = full client copy of spine assembly |
| LOAD row | `StateTab.tsx:1454` | BUILT | coach reconciled load_status (7d, not spine) |
| BODY row (RPE/readiness) | `StateTab.tsx:1518` | BUILT | coach readiness_* (7d vs 28d) |
| STRENGTH row + per-lift | `StateTab.tsx:1151` | BUILT | spine strength.per_lift (D-270) |
| RUN + BIKE exec rows (7d) | `StateTab.tsx:1212/1213` | BUILT | coach run/ride_session_types_7d (run row relabeled AERO→RUN) |
| SWIM sessions row (7d) | `coach swim_sessions_7d` (v81) + `StateTab.tsx swimExecRow` | BUILT | Q-038-safe: planned → % achieved, unplanned → distance (yd/m by units); NEVER pace. Was hidden; now shows when you swam |
| AERO durability verdict | `coach:2209` (v78) | BUILT | now SPINE decoupling band via decouplingBandDisplay (was coach 7d avg) |
| BIKE efficiency verdict | `coach` (v80) `bikeEfficiencyDisplay` | BUILT | steady-aerobic types now render SPINE bike.efficiency (was coach's own HR-drift bands) → BIKE row ≡ PERFORMANCE; last run↔bike continuity gap closed |
| PERFORMANCE section | `StatePerformanceSection.tsx:288` | PARTIAL | stateDisplay contract; "under review, not yet shipped" per StateTab:1627 |
| LLM week narrative | `coach/index.ts:3319` | BUILT | coachAdapter + spine fitness_direction |
| Honesty guard (narrative-core) | `_shared/narrative-core/validate.ts:82` | BUILT | validates narrative vs spine; 1 retry then drop |
| Coach honesty net (headline vs sliding spine) | `coach/index.ts` (v77) | BUILT | feeds concerning spine verdicts to rule 2 (D-274) |
| session_detail_v1 builder | `_shared/session-detail/build.ts:269` | BUILT | analyzer computed/raw + spine (single-sourced totals) |
| Workout Performance/Details (workout-detail) | `workout-detail/index.ts:687` | BUILT | persisted session_detail_v1 or rebuild; maps spine verdict |
| Goals screen | `src/components/GoalsScreen.tsx:355` | BUILT | coach race_readiness + useGoals |
| Goal prefill fitness/volume strings | `GoalsScreen.tsx:530-621` | PARTIAL | ⚠ derives labels client-side, not spine |
| Race-readiness projection | `coach/index.ts:62` computeRaceReadiness | BUILT | _shared/race-readiness + session_detail_v1.race_readiness |

| Run easy-HR band (the ONE definition of "easy") | `_shared/easy-hr.ts` | BUILT (D-282) | Threshold-anchored (Friel Z2 ≤89% LTHR); %max 65-80% bootstrap; null when neither. Bike NOT routed through it (its own band works — running HR sits 5-10 bpm higher at the same effort). |
| Run easy-pace learner | `learn-fitness-profile:699` | BUILT, was STARVED (D-282) | Old gate `hr <= maxHR*0.75` passed 0-of-22 runs. Now threshold-anchored → fires. |
| Run pace RECONCILER (notices detraining) | `generate-combined-plan/science.ts:110` (D-033) | BUILT, **HAS NEVER RUN** | Streak + median + ACWR gates. Both inputs were null (Q-169). Baseline side fixed by D-282; observed side needs a recompute to backfill `pace_at_easy_hr`. **Do not rebuild it.** |
| HR zone schema (per workout) | `compute-workout-analysis:1548` | BUILT (D-282 fix) | Now reads learned LTHR → Friel. Previously fell to %HRmax for every Strava/Garmin athlete. ⚠ bins stored per workout — history needs recompute. |
| Heat handling (run durability) | `_shared/state-trend/run.ts:172` | **EXCLUSION STANDS (D-275)** | ⚠ Q-170: the exclusion is NOT field-standard (no app drops a session for heat). Right fix = athlete-selectable ADJUST toggle. Attempted + reverted. Read Q-170 first. |

| Run easy-pace RESOLVER (choice → learned → manual → effort_paces → **null**) | `src/lib/resolve-current-run-pace.ts:62` | **BUILT** | D-285/D-287. The run twin of `resolveCurrentFtp`. Owns the sec/km→sec/mi conversion ONCE. **Server-universal (9 callers). CLIENT still re-derives — Q-175.** |
| Athlete's explicit pace choice (`easy_pace_source`) | `performance_numbers.easy_pace_source`; UI `TrainingBaselines.tsx` | **BUILT** | Q-174. 'manual' outranks even a high-confidence learned pace. Absent = old behavior. **Bike/FTP half NOT done — a naive flip kills bike race projections.** |
| ONE Friel run HR zone model (client + edge) | `src/lib/friel-zones.ts:60` | **BUILT** | D-286. `easy ≡ Z1 or Z2` by construction. Was THREE hardcoded copies that disagreed by 2 bpm. |
| Learned-metric FRESHNESS (`as_of` = newest contributing SESSION) | `learn-fitness-profile/index.ts` (`newestDate`); rendered `TrainingBaselines.tsx` | **BUILT** | Q-173. NOT `last_updated` (which is "when the profile was rebuilt"). Exposed that his LTHR is 53 days old, n=2. |
| Declared per-discipline intent (`develop`/`maintain`/`out`) | `goals.training_prefs.per_discipline_posture`; `non-race-goal-seeds.ts:198` | **WRITE-ONLY** ⚠ | Read once at plan-build. **ZERO runtime surfaces read it.** The app never checks if you did what you said. See ENGINE-STATE §3. |
| Posture-vs-behavior check ("you said maintain running; you've run once") | — | **MISSING** ⚠ | Every part exists (posture + `adherence.ts:49` counts + the off-plan sentence). Never introduced. **`off-plan-banner.ts:66-71` actively says "On plan" to a Get-Stronger athlete who stopped running.** |
| Cross-domain **FATIGUE** carryover ("Monday's lift is why Thursday's ride felt hard") | `_shared/cross-domain-carryover.ts:115` | **BUILT** | ⚠ **Name is misleading** — 72h ACUTE fatigue only. It does NOT model whether bike/swim aerobic work preserves RUN fitness. No such model exists anywhere. |
| Run-SPECIFICITY model (what does NOT carry over from bike/swim to run) | — | **MISSING** | The app's only maintenance theory is *"aerobic detrains slower → low volume holds it"* (`SPEC-getstronger-contract-row.md:49`), which is **discipline-blind**. The engine carries over; the legs don't. |
| Easy-run VERDICT = the HR band (not pace) | `analyze-running-workout` (D-288) | **BUILT, not deployed** | steady_state → HR band; intervals/tempo → keep pace. Pace becomes a receipt. Garmin ships this split ("HR for slow steps, otherwise speed"). |
| ONE LTHR resolver | — | **MISSING** ⚠ | **FOUR chains, two inverted** (`easy-hr.ts` learned-first vs `compute-workout-analysis:1578` manual-first). The ROOT of the run stack. Spec: `SPEC-lthr-one-anchor.md`, Q-176. |
| ONE threshold-PACE resolver | — | **MISSING** | No resolver at all; read directly in ~15 files. Do it in the LTHR pass. |
