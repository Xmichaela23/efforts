# Phase 1 — Run Pace Feedback Loop Spec

**Status:** spec for review. Implementation gated on user approval.

**Companion:** `docs/FEEDBACK-LOOP-WORKORDER.md` (Phase 1 section). Anti-volatility pattern locked at work-order level: **threshold-triggered displacement + trailing window + asymmetric ratchet.** This spec tunes the numbers within that shape; it does not re-pick the architecture.

**Decision:** D-033 (proposed).

**Prerequisite:** D-032 / Phase 0 (Arc channel) shipped at `ad4102f8`. This spec extends `ArcChannelPayload` with a new field consumed by the engine.

---

## 1. Goal restatement

Let the engine's run pace prescriptions consider observed pace data from completed workouts alongside the manual baseline. **Anti-volatility** is the load-bearing constraint: a single anomalous week (one PR, one bad day) cannot swing prescribed pace.

---

## 2. Investigation findings (code reality vs. work-order phrasing)

### 2.1 The signal data we actually have

The work order phrasing was "observed threshold pace." The data reality:

- `compute-snapshot/index.ts:123-138` aggregates `run_facts.pace_at_easy_hr` (per workout, sec/km) into `snapshot.run_easy_pace_at_hr` — the weekly median easy pace at sub-threshold HR.
- `compute-facts/index.ts:1075-1083` derives `pace_at_easy_hr` from sensor samples where `heartRate <= thresholdHR × 0.78`. Output: `Math.round(1000 / avgSpeed)` (sec/km).
- **No threshold-pace aggregation exists in `compute-snapshot`.** Threshold pace is observable in individual workouts (interval sessions where the athlete holds Z4) but isn't currently extracted as a weekly aggregate.

### 2.2 Baseline shape

`learned_fitness.run_easy_pace_sec_per_km` and `learned_fitness.run_threshold_pace_sec_per_km` carry the shape `{ value: number, confidence: 'low'|'medium'|'high', sample_count: number }`. The existing helper `learnedThresholdPaceUsable` (arc-context.ts:322-334) gates baseline usability:
- `confidence === 'low'` → unusable.
- `sample_count < 2` → unusable.
- `medium`/`high` confidence AND `sample_count >= 2` → usable.
- Otherwise `sample_count >= 3` required.

### 2.3 Where the engine actually prescribes pace

Engine session descriptions are **mostly qualitative** ("threshold / tempo pace"); numeric pace resolution happens at `materialize-plan` (which reads `baselines.performance_numbers.fiveK_pace` etc., not `learned_fitness`). The engine reads `learned_fitness` from `athleteState.learned_fitness` (passed via wrapper).

**This is the surface Phase 1 reconciles:** the engine's `athleteState.learned_fitness.run_easy_pace_sec_per_km.value`, when an observed easy pace from `arc.run_observed_fitness` diverges per the asymmetric ratchet, gets overridden with the reconciled value in an in-memory override before downstream engine consumers read it.

### 2.4 Scope decision: easy pace, not threshold pace

The work-order intent ("observed threshold pace") maps to **observed easy pace** in code reality. Phase 1 reconciles `run_easy_pace_sec_per_km`. The engine's threshold-pace targets (in qualitative descriptions today; numeric resolution in materialize-plan) derive from the easy-pace baseline via existing Daniels-style ratios — those ratios stay unchanged. **Reconciling easy pace at the input source means every downstream consumer (engine prescriptions, derived threshold, derived race pace, long-run pace) inherits the reconciled value naturally.**

A future Phase 1.5 or separate work order can add direct threshold-pace aggregation in `compute-snapshot` (extract Z4 pace from interval sessions) if needed. Not in Phase 1 scope.

---

## 3. The locked anti-volatility pattern (from work order)

**Threshold-triggered displacement + trailing window + asymmetric ratchet.** Spec tunes the numbers within this shape; the architectural choice is not relitigated.

---

## 4. Resolved parameters

### 4.1 Trailing window length: **4 weeks**

**Reasoning:**
- The run-arc within-phase ramp window is 4 weeks for build/race_specific (D-026 `rampWeeksForPhase`). 4-week trailing window matches the granularity of those phase ramps — the reconciler responds within the same window the spec ramps over.
- Base phase ramp window is 6 weeks; a 4-week trailing window captures intra-base trends without lagging.
- Typical run frequency is 3-5 sessions/week; 4 weeks gives 12-20 samples — enough that the median is robust to a single outlier session.
- Shorter windows (2-3 weeks) are too noisy (terrain, weather, HR drift). Longer windows (6-8 weeks) lag real adaptation; you want the reconciler to engage within one phase, not two.

**Minimum sample-count for engagement:** at least **3 of 4 weeks** must have a non-null `run_easy_pace_at_hr` value. If fewer, the wrapper's `run_observed_fitness` returns `null` and the engine falls back to baseline.

### 4.2 Divergence threshold: **4% sustained**

**Reasoning:**
- Below 3% divergence is noise — terrain variation (hilly vs. flat routes), GPS error (~1-2%), HR variability day-to-day, weather (heat slows pace), pacing inconsistency.
- Above 5% divergence is a real fitness shift per coaching literature (Daniels, Friel).
- 4% is the conservative middle. Specifically:
  - 8:00/mi pace × 1.04 = 8:19/mi (19s slower). Plausibly a real fitness loss or fatigue accumulation.
  - 8:00/mi pace × 0.96 = 7:41/mi (19s faster). Plausibly a real fitness gain.
- "Sustained" = the **trailing-window MEDIAN** is outside the ±4% band. Median over 4 weeks is robust to a single anomalous week (one outlier doesn't move the median).

### 4.3 Asymmetric ratchet: **consecutive-week count + ACWR gate**

**Same divergence threshold (4%) but different consecutive-week requirements** for engagement:

- **Worsening (observed pace SLOWER than baseline by >4%):** triggers after **2 consecutive weeks** of weekly values outside the slow band. Fast recognition for fatigue, illness, overreaching, regression — when in doubt, conservative direction is to tighten the plan sooner.
- **Improving (observed pace FASTER than baseline by >4%):** triggers after **4 consecutive weeks** of weekly values outside the fast band. Slow engagement for fitness gains — protects against single-PR weeks (or 2-3 PRs in a row from favorable conditions) auto-prescribing harder paces.

**Asymmetry ratio: 2× slower-to-engage for improvement vs. worsening.** Documented; spec adjusts only this ratio if real-world feedback shows the conservative direction is too aggressive or too slow.

**Safety-favored tie-break:** when both directions could plausibly engage (e.g. data flicker around the threshold), worsening wins. The plan tightens; it does not loosen on ambiguous data.

### 4.3.1 Fatigue-vs-fitness-decline distinction (ACWR gate on worsening)

**The problem:** easy pace slowing at a given HR can mean fitness loss OR accumulated fatigue from a hard training block. These need different responses:
- **Fitness loss** (true regression): reconciler should engage — tighten the plan's prescribed pace.
- **Accumulated fatigue** (build-block overload doing its job): reconciler must NOT engage — locking in the slowdown as new baseline would tighten the plan in response to the very fatigue the plan was designed to create. Self-defeating.

The pace signal alone cannot distinguish these. The system already has the discriminating signal: **`athlete_snapshot.acwr`** (Acute-to-Chronic Workload Ratio), computed weekly at `compute-snapshot:357-359` as `current_workload / 4-week_chronic_load`. Sports-science convention:
- **0.8–1.3:** optimal training zone.
- **1.3–1.5:** caution (functional overreach territory).
- **> 1.5:** high accumulated load (non-functional overreach / fatigue tail).

**Rule (LOCKED at spec level):**

The worsening path engages ONLY when **every week in the 2-consecutive-week worsening window has `acwr ≤ 1.3`**. If any of those weeks has `acwr > 1.3` OR `acwr` is null/missing for both weeks, the worsening signal is treated as fatigue-attributable and the reconciler returns BASELINE.

**Why this rule shape:**
- A single elevated-ACWR week in the worsening window is enough to flag ambiguity — fatigue from a hard week can tail into the next week's easy runs. Conservative: don't lock in a slowdown that might just be carry-over fatigue.
- Null ACWR in BOTH weeks (no chronic-load data — new athlete, no prior 4 weeks of workouts) blocks engagement. We can't distinguish; falling back to baseline is safe.
- Null ACWR in ONE week (mixed data availability) is permitted to engage as long as the available week is ≤ 1.3. The reconciler isn't blocked by partial data.

**The improving path does NOT need an ACWR gate.** A faster-pace signal during a hard block is unambiguous: fitness improving despite high load. That's the strongest possible fitness signal; engaging when ACWR is elevated is correct.

**Display vs. plan-adaptive interaction:** ACWR is already used by the coach context for readiness display. Phase 1 adds a SECOND consumer (the run-pace reconciler), reading the same field. No change to ACWR computation; no change to existing coach display. The new consumer is additive.

**Anti-regression invariant:** the ACWR gate is non-negotiable on the worsening path. Removing it would re-introduce the "deload block misread as fitness decline" failure mode. Pin tests in section 6 lock the gate.

### 4.4 Confidence gating

The existing `learnedThresholdPaceUsable` helper (arc-context.ts:322-334) is the canonical baseline-confidence gate. Phase 1 uses it (or its `learnedEasyPaceUsable` equivalent built in lockstep) to decide:

- **Baseline confidence `medium` or `high` AND sample_count ≥ 2:** standard reconciliation path per 4.2 + 4.3.
- **Baseline confidence `low` OR sample_count insufficient AND observed is available (≥3 weeks of data):** use OBSERVED directly. No baseline to protect; observed is the best signal we have.
- **Both baseline AND observed insufficient:** engine uses the raw `athleteState.learned_fitness.run_easy_pace_sec_per_km.value` (today's behavior). Safe fallback.

**Implementation:** the reconciler is a pure helper `resolveRunEasyPace(baseline, observed)` returning `{ paceSecPerKm: number, source: 'baseline' | 'reconciled' | 'observed_no_baseline', reasoning: string }`. The `source` and `reasoning` fields are for debug-line logging + future plan-trade-off surfacing.

### 4.5 Display-only vs. plan-adaptive (locked)

The work order locked: only observed easy/threshold pace feeds plan targets. This spec confirms per `snapshot.run_*` field:

| Snapshot field | Phase 1 treatment |
|---|---|
| `run_easy_pace_at_hr` | **Plan-adaptive.** Median over trailing window is the input to the reconciler. |
| `run_efficiency` | **Display-only.** Technique/aerobic-capacity signal. Surfaced in Arc for State page display (separate UI task); engine never consumes. |
| `run_interval_adherence` | **Display-only.** Compliance metric, not a pace input. |
| `run_easy_hr_trend` | **Display-only.** HR-side signal of aerobic capacity; doesn't directly map to prescribed pace. |
| `run_long_run_duration` | **Display-only at Phase 1.** Already consumed by `effectiveLongRunFloorMiles.recentLongestRunMi` history-aware path (D-027). Phase 1 does not re-purpose; that path stays unchanged. |

### 4.6 Per-distance scoping

The reconciled `run_easy_pace_sec_per_km` flows to:

| Pace target | Phase 1 treatment |
|---|---|
| Easy-pace prescriptions (Easy Run, Long Run aerobic portions) | Direct (1:1 from reconciled easy pace). |
| Threshold/tempo prescriptions | Derived via existing Daniels-style ratio applied to reconciled easy pace. Phase 1 does not re-derive the ratio. |
| Race-pace prescriptions (5K, 10K, half-marathon, marathon, race-specific) | **Unaffected.** Race pace per distance is computed by existing race-projection logic from `performance_numbers.fiveK_pace` (manual) + race distance. Phase 1 does not touch this — `performance_numbers` is a separately maintained baseline; only `learned_fitness.run_easy_pace_sec_per_km` is reconciled. |
| Long-run pace | Existing `easy × long-run-multiplier`; reconciled easy pace flows naturally. |
| Interval-session pace anchors (5K-pace strides, 1600m repeats at threshold) | **Unaffected.** Their derivation runs through `performance_numbers.fiveK_pace` (manual), not `learned_fitness`. |

**Anti-cross-pollination rule:** Phase 1 reconciles ONLY `learned_fitness.run_easy_pace_sec_per_km`. It does NOT touch `performance_numbers.fiveK_pace` or `performance_numbers.run_threshold_pace`. Race-pace and interval-pace prescriptions remain anchored to the athlete's manual race-time entries. This prevents a fitness drift signal from contaminating race-pace prescriptions which should be athlete-controlled (the manual race-time entry is an explicit goal target).

---

## 5. The `run_observed_fitness` field — `ArcChannelPayload` extension

### 5.1 Shape

```ts
export interface RunObservedFitness {
  /**
   * Median observed easy pace at sub-threshold HR (sec/km) over the trailing window.
   * Null if fewer than 3 weeks of `snapshot.run_easy_pace_at_hr` data in the window.
   */
  median_easy_pace_sec_per_km: number | null;

  /**
   * Weekly raw values (newest first), one entry per week in the trailing window.
   * Length always equals `window_weeks`. Null entries represent weeks with no qualifying
   * easy-HR samples. The engine's reconciler uses this to count consecutive-week
   * divergence per the asymmetric ratchet (4.3).
   */
  weekly_easy_paces_sec_per_km: (number | null)[];

  /**
   * Weekly ACWR values (newest first), parallel array to `weekly_easy_paces_sec_per_km`.
   * The engine's worsening-path reconciler consults this to distinguish accumulated
   * fatigue (ACWR > 1.3) from genuine fitness decline (ACWR ≤ 1.3). See spec section
   * 4.3.1. Null entries permitted; the worsening gate handles partial-data cases.
   * Improving path does NOT consult this field — fitness gains during high load are
   * unambiguous and engagement is correct.
   */
  weekly_acwr: (number | null)[];

  /** Trailing window length in weeks. Locked at 4 for Phase 1 (see spec 4.1). */
  window_weeks: 4;

  /**
   * Display-only fields. Engine does NOT consume these. Carried for State page render
   * and future debugging; the reconciler reads only `median_easy_pace_sec_per_km`,
   * `weekly_easy_paces_sec_per_km`, and `weekly_acwr`.
   */
  efficiency_index: number | null;
  interval_adherence_pct: number | null;
  longest_run_minutes: number | null;
}

// In ArcChannelPayload:
//   run_observed_fitness: RunObservedFitness | null;
```

### 5.2 Wrapper-side aggregation

The wrapper (`create-goal-and-materialize-plan/index.ts`) computes `run_observed_fitness` from the last 4 weeks of `athlete_snapshot` rows:

```ts
async function buildRunObservedFitness(supabase, user_id): Promise<RunObservedFitness | null> {
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400 * 1000).toISOString().slice(0, 10);
  const { data: snapshots } = await supabase
    .from('athlete_snapshot')
    .select('week_start, run_easy_pace_at_hr, run_efficiency, run_interval_adherence, run_long_run_duration, acwr')
    .eq('user_id', user_id)
    .gte('week_start', fourWeeksAgo)
    .order('week_start', { ascending: false })
    .limit(4);
  if (!snapshots || snapshots.length === 0) return null;
  // Pad to 4 weeks (newest first); null for weeks not present.
  const padded: (any | null)[] = new Array(4).fill(null);
  for (let i = 0; i < Math.min(snapshots.length, 4); i++) padded[i] = snapshots[i];
  const weekly = padded.map(s => (s?.run_easy_pace_at_hr ?? null));
  const weeklyAcwr = padded.map(s => (typeof s?.acwr === 'number' ? s.acwr : null));
  const nonNull = weekly.filter((v): v is number => typeof v === 'number');
  if (nonNull.length < 3) return null; // insufficient data; per 4.1
  const median = nonNull.slice().sort((a, b) => a - b)[Math.floor(nonNull.length / 2)];
  return {
    median_easy_pace_sec_per_km: median,
    weekly_easy_paces_sec_per_km: weekly,
    weekly_acwr: weeklyAcwr,
    window_weeks: 4,
    efficiency_index: padded[0]?.run_efficiency ?? null,
    interval_adherence_pct: padded[0]?.run_interval_adherence ?? null,
    longest_run_minutes: padded[0]?.run_long_run_duration ?? null,
  };
}
```

This helper lives in the wrapper, alongside the existing `arcForCombined` build. The result populates `arc.run_observed_fitness` in the `invokeFunction('generate-combined-plan', { arc: { ... } })` call.

### 5.3 Engine-side reconciler

A new pure helper in `generate-combined-plan/science.ts`:

```ts
export type ResolvedRunEasyPace = {
  paceSecPerKm: number;
  source:
    | 'baseline'
    | 'reconciled_worse'
    | 'reconciled_better'
    | 'observed_no_baseline'
    | 'baseline_acwr_gated';  // worsening signal suppressed because ACWR > 1.3 in window — see 4.3.1
  reasoning: string;  // for log-line debug only; not athlete-facing
};

export function resolveRunEasyPace(
  baseline: { value: number; confidence: string; sample_count: number } | null,
  observed: RunObservedFitness | null,
): ResolvedRunEasyPace | null {
  // Decision tree per spec sections 4.3, 4.3.1, 4.4.
  // 1. Both missing → null (caller falls back to whatever default exists today).
  // 2. Baseline usable, observed missing → baseline.
  // 3. Baseline unusable, observed present (≥3 weeks) → observed_no_baseline.
  // 4. Both present, observed median within ±4% of baseline → baseline.
  // 5. Both present, observed median >4% slower for 2+ consecutive weeks AND
  //    ACWR ≤ 1.3 for EVERY week in that 2-consecutive-week window (per 4.3.1) →
  //    reconciled_worse.
  // 6. Both present, observed median >4% slower for 2+ consecutive weeks BUT
  //    ACWR > 1.3 in ANY of those weeks (or null in BOTH weeks) → baseline
  //    (attributed to accumulated fatigue per 4.3.1). New source value:
  //    `baseline_acwr_gated`.
  // 7. Both present, observed median >4% faster for 4+ consecutive weeks →
  //    reconciled_better (no ACWR gate on improving path per 4.3.1).
  // 8. Else (ambiguous data) → baseline (safety-favored tie-break).
  ...
}
```

The engine calls `resolveRunEasyPace` once at request handling, BEFORE `buildPhaseTimeline` / `buildWeek`. The result is stored on a derived in-memory `state` object's `learned_fitness.run_easy_pace_sec_per_km.value` field (override, not mutation of the input). All downstream `buildWeek` calls read the reconciled value automatically — no new threading required.

### 5.4 Why wrapper aggregates instead of engine

- Engine stays a pure function of its inputs (preserves preview-mode + test-fixture pattern from D-032).
- Wrapper already queries DB for `arcForCombined`; one additional query is cheap.
- Aggregation logic (median, consecutive-week counts) can be replaced with cleaner queries in future (e.g. a `compute-snapshot`-side rolling window) without touching the engine.

---

## 6. Anti-volatility e2e test scenario (LOAD-BEARING)

The hash test from Phase 0 caught accidental consumption when no consumer existed. Phase 1 ADDS a consumer; the test must now be load-bearing for the *correct behavior* of that consumer under anomalous data.

### 6.1 Scenario: single anomalous week does NOT swing pace

**Fixture:** Plan #78-style athlete (CTL=60, 11hr/wk, 70.3 intermediate race_peak).

**Baseline:** `learned_fitness.run_easy_pace_sec_per_km = { value: 360, confidence: 'high', sample_count: 12 }` (6:00/km easy).

**Observed payload:** 4 weeks of data (newest first):
- Week 1 (current): 360 sec/km (matches baseline).
- Week 2 (1 week ago): 365 sec/km (+1.4%, within noise).
- Week 3 (2 weeks ago): 355 sec/km (-1.4%, within noise).
- Week 4 (3 weeks ago): **331 sec/km (-8%, the "PR week")**.

Median = 358 sec/km (Week 1 and 3 are middle two when sorted: 331, 355, 360, 365 → median = (355+360)/2 = 357.5; round to 358).

Divergence: (358 - 360) / 360 = -0.56% → within ±4% band → reconciler returns BASELINE.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'baseline'`. Plan output uses baseline pace, NOT the PR-week-skewed value.

### 6.2 Scenario: sustained worsening DOES engage (fast direction)

**Same fixture, baseline.**

**Observed payload (newest first):**
- Week 1: 380 sec/km (+5.6%, slower).
- Week 2: 378 sec/km (+5.0%, slower).
- Week 3: 360 sec/km (matches baseline).
- Week 4: 358 sec/km (within noise).

Median = (358+360+378+380)/2 = (360+378)/2 = 369 sec/km. Divergence: (369 - 360) / 360 = +2.5% → within ±4% band overall, but...

Consecutive-week analysis: weeks 1 and 2 are BOTH >+4% (5.6%, 5.0%) → 2 consecutive weeks worsening → meets asymmetric-ratchet threshold for worsening.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'reconciled_worse'`. Reconciled pace = median (369 sec/km) — the plan tightens easy-pace prescription.

### 6.3 Scenario: sustained improving DOES NOT engage at 2 consecutive weeks

**Baseline as above.**

**Observed (newest first):**
- Week 1: 340 sec/km (-5.6%, faster).
- Week 2: 342 sec/km (-5.0%, faster).
- Week 3: 360 sec/km.
- Week 4: 365 sec/km.

Weeks 1+2 both <-4%, but only 2 consecutive weeks. Improving requires **4 consecutive weeks**.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'baseline'`. Reconciled pace = baseline. The improving signal hasn't earned enough confidence yet.

### 6.4 Scenario: sustained improving FOR 4 WEEKS engages

**Baseline as above.**

**Observed (newest first):**
- All 4 weeks at 340 sec/km (-5.6%, faster).

Median = 340. Divergence = -5.6%. 4 consecutive weeks below -4% threshold → meets asymmetric-ratchet for improving.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'reconciled_better'`. Reconciled pace = 340 sec/km.

### 6.5 Scenario: low-confidence baseline + observed data → observed wins

**Baseline:** `{ value: 380, confidence: 'low', sample_count: 1 }`.

**Observed:** 4 weeks at 360 sec/km (consistent).

Baseline unusable (low confidence). Observed present + sufficient.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'observed_no_baseline'`. Reconciled pace = observed median.

### 6.6 Scenario: insufficient observed data → baseline wins

**Observed:** 4 weeks but only 2 non-null entries (athlete missed easy runs / didn't wear HR strap).

**Assertion:** `run_observed_fitness === null` (per wrapper's 3-of-4 minimum). Engine never sees observed data → falls back to baseline.

### 6.7 Scenario: worsening signal during high-ACWR build block → ACWR gate suppresses (LOAD-BEARING)

**Same fixture, baseline easy pace 360 sec/km.**

**Observed (newest first):**
- Week 1: 380 sec/km (+5.6%, slower); `acwr = 1.45` (elevated — overload territory).
- Week 2: 378 sec/km (+5.0%, slower); `acwr = 1.55` (further elevated).
- Week 3: 360 sec/km; `acwr = 1.20`.
- Week 4: 358 sec/km; `acwr = 1.10`.

Pace signal: 2 consecutive weeks (1+2) both >+4% slow. **Pre-gate, this would trigger `reconciled_worse`.**

ACWR check: Week 1 ACWR = 1.45 > 1.3 AND Week 2 ACWR = 1.55 > 1.3. Both weeks in the worsening window have elevated ACWR.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'baseline_acwr_gated'`. Reconciled pace = baseline (360 sec/km). The slowdown is attributed to accumulated training load, not fitness decline. **The plan does NOT tighten in response to fatigue the plan was designed to create.**

This is the load-bearing scenario for the fatigue-vs-fitness distinction. If this test ever passes with `source === 'reconciled_worse'`, the ACWR gate has regressed.

### 6.8 Scenario: worsening signal with NORMAL ACWR → reconciler engages (genuine regression)

**Same fixture.**

**Observed (newest first):**
- Week 1: 380 sec/km (+5.6%); `acwr = 0.95` (under-loading — perhaps post-taper / illness).
- Week 2: 378 sec/km (+5.0%); `acwr = 1.05`.
- Week 3: 360 sec/km; `acwr = 1.10`.
- Week 4: 358 sec/km; `acwr = 1.00`.

Pace signal: 2 consecutive weeks slow. ACWR check: both weeks ≤ 1.3.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'reconciled_worse'`. Reconciled pace = median (369 sec/km). Genuine fitness loss / illness / extended deload — plan tightens. Distinguishes from 6.7 by ACWR signal alone.

### 6.9 Scenario: improving signal during high ACWR → reconciler STILL engages (no gate on improving path)

**Same fixture.**

**Observed (newest first):**
- Week 1: 340 sec/km (-5.6%); `acwr = 1.45` (high load).
- Week 2: 342 sec/km (-5.0%); `acwr = 1.55`.
- Week 3: 340 sec/km (-5.6%); `acwr = 1.35`.
- Week 4: 338 sec/km (-6.1%); `acwr = 1.40`.

Pace signal: 4 consecutive weeks faster than baseline by >4%. ACWR is elevated throughout — high training load.

**Assertion:** `resolveRunEasyPace(baseline, observed).source === 'reconciled_better'`. The improving path has no ACWR gate (per 4.3.1) — fitness gains during high load are unambiguous and engagement is correct. Reconciled pace = 340 sec/km (median).

### 6.7 Hash test update (Phase 0 → Phase 1 transition)

The Phase 0 hash test (`arc-channel.test.ts`) asserts byte-identical output between `arc: undefined` and `arc: populated`. With Phase 1's consumer wired, this is no longer universally true: a fixture where the reconciler ENGAGES will produce different output between modes.

**Update:** Phase 0 test continues to assert byte-identical for fixtures where the reconciler does NOT engage (insufficient observed data, within-noise divergence, or null `run_observed_fitness`). New Phase 1 tests assert SPECIFIC divergence for fixtures where the reconciler engages — they pin the behavior, not byte-identical.

Specifically:
- Phase 0 fixtures (Plan #78, etc.) populate `arc.run_observed_fitness = null` → byte-identical between modes (no consumer reads, since the reconciler short-circuits on null).
- New Phase 1 fixtures populate non-null `run_observed_fitness` AND assert that plan output reflects the reconciled pace, not the baseline.

---

## 7. Files touched (post-approval)

| File | Change |
|---|---|
| `_shared/arc-context.ts` | No changes. The exposure path uses `arc.run_observed_fitness`, which lives on `ArcChannelPayload`, not the `ArcContext` interface. (`ArcContext` already has `latest_snapshot`; the wrapper aggregates without modifying Arc itself.) |
| `generate-combined-plan/types.ts` | Add `RunObservedFitness` interface; add `run_observed_fitness: RunObservedFitness | null` to `ArcChannelPayload`. |
| `generate-combined-plan/science.ts` | New helper `resolveRunEasyPace(baseline, observed): ResolvedRunEasyPace | null`. Pure function, fully unit-testable. |
| `generate-combined-plan/index.ts` | After request validation, call `resolveRunEasyPace` once. If result is non-null and `source !== 'baseline'`, override `state.learned_fitness.run_easy_pace_sec_per_km.value` on the derived in-memory state. Existing `buildWeek` calls read the overridden state naturally. |
| `create-goal-and-materialize-plan/index.ts` | Add `buildRunObservedFitness(supabase, user_id)` helper. Populate `arc.run_observed_fitness` at the existing `invokeFunction` call site. |
| `arc-channel.test.ts` | Update to assert byte-identical when `run_observed_fitness === null` only. Phase 0's broader assertion narrows. |
| NEW `run-pace-feedback.test.ts` | 9 e2e scenarios from section 6 (including 3 ACWR-gate scenarios 6.7 / 6.8 / 6.9 LOAD-BEARING for the fatigue-vs-fitness distinction) + unit tests for `resolveRunEasyPace`. |

---

## 8. Anti-regression invariants

- **The reconciler is pure.** No side effects, no DB reads, no environment access. Inputs determine output entirely. Fully unit-testable in isolation.
- **State override is local.** The wrapper passes `athlete_state` through the request; the engine creates a DERIVED state with the reconciled pace overridden in-memory. The original request body is not mutated; the input `athlete_state` is not mutated. Engine's "pure function of inputs" property is preserved.
- **Phase 1 reconciles ONLY `learned_fitness.run_easy_pace_sec_per_km`.** `performance_numbers.*` is untouched. Race-pace + interval-pace prescriptions remain anchored to manual athlete entries.
- **Display-only fields stay display-only.** The hash test asserts `efficiency_index`, `interval_adherence_pct`, `longest_run_minutes` do NOT change plan output even when populated with extreme values.
- **Asymmetric ratchet shape is locked.** Worsening triggers at 2 consecutive weeks; improving at 4. Spec adjusts only the ratio if real-world feedback warrants; the asymmetry direction (worsening faster than improving) is non-negotiable.
- **ACWR gate on worsening path is locked.** The fatigue-vs-fitness distinction is structural; removing the gate re-introduces the "deload block misread as fitness decline" failure mode (and the self-defeating "plan tightens in response to its own training stimulus" loop). The improving path is gate-free by design; fitness gains during high load are unambiguous. Pin tests 6.7, 6.8, 6.9 lock both halves.

---

## 9. Open questions — resolved

1. **Easy pace as the reconciliation signal** — ✅ confirmed (user note: "actually the better signal, not a compromise" — easy pace at HR is the cleanest read on aerobic fitness; threshold prescriptions inherit via Daniels ratios; don't wait for threshold-pace aggregation).
2. **Asymmetric ratchet 2× (2 weeks worsening / 4 weeks improving)** — ✅ confirmed (safety-favored is the correct bias for a training plan).
3. **`performance_numbers.fiveK_pace` untouched** — ✅ confirmed (race-pace prescription is athlete-owned goal-setting; anti-cross-pollination rule is correct).
4. **Fatigue-vs-fitness distinction on the worsening path** — ✅ resolved (per amendment 4.3.1): ACWR gate on worsening path. A worsening signal during high-ACWR weeks is suppressed; the reconciler returns `baseline_acwr_gated`. Locked via pin tests 6.7 / 6.8 / 6.9. The improving path has no ACWR gate by design.

---

## 10. Implementation ship sequence (post-approval)

Same pattern as D-028 / D-029 / D-030 / D-031 / D-032:

1. **This spec doc.** Commit `docs/PHASE-1-RUN-PACE-SPEC.md`. (THIS COMMIT — pre-implementation.)
2. **User reviews and approves.** Gate.
3. **Implementation commit.** 5 files modified + 1 new test file. Single commit.
4. **Deploy.** `generate-combined-plan` (engine) + `create-goal-and-materialize-plan` (wrapper). Both functions.
5. **Push.** main.
6. **Close-out commit.** D-033 entry in `DECISIONS-LOG.md` + ENGINE-STATE Solid entry + work-order Phase 1 status update.
