# Performance — interval interpretation spec (Bug A + Bug B, run + cycling)

Status: **DRAFT v2 — awaiting approval**
Scope: run + cycling. Segment labels are run-only (no cycling analog). Variance gate, interpretation, and GAP-aware comparisons cover both sports.
Out of scope (separate polish pass): Bugs C/D/E and inconsistencies Inc-1..Inc-5 from the audit.

Changes vs v1 (per user direction):
1. **INSIGHTS interprets intervals** — doesn't just exclude them from steady comparison.
2. **All effort assessments (CV, vs_similar, TREND, narrative pace/HR reads) prefer GAP** when present. Raw pace is fallback only.
3. **Variance gate uses GAP-adjusted pace variance**, not raw — so a hilly easy run doesn't get misflagged.
4. **Cycling-B bundled.** No half-fix.
5. **No backfill** — stale-until-touched is sufficient.
6. **Plan intent is sacred** — `classified_type` is never overwritten on linked-plan sessions; only stamped with an override flag.
7. **D-NNN entry** to be authored alongside implementation.

---

## 1. Problem restated

**Bug A — run only.** Multi-segment interval workouts can render as a single "Overall" / "Overall session" row, hiding the interval structure. Root: analyzer's `overall_only` fallback in `analyze-running-workout/index.ts:buildSessionIntervalRows` (`:3998–4014`, `:4193–4209`, `:4262–4277`) emits a synthetic overall row with `planned_label:'Overall session'` whenever the structured-interval gate doesn't fire (i.e., unlinked or weakly-linked sessions where the planned object has <2 work steps). Display layer (`humanizePlannedSegmentLabel`, `build.ts:41–51`) does not strip the literal and does not synthesize "Interval N" labels from `interval_number`.

**Bug B — run + cycling.** INSIGHTS and TREND treat interval/mixed-effort sessions as steady efforts. Symptoms:
- INSIGHTS narrative compares whole-workout averages against an easy-run baseline → "HR ran 16 bpm higher than recent similar efforts on this route" on a fartlek.
- TREND sparkline mixes mixed-effort sessions into the easy/steady baseline; future easy runs see contaminated comparisons.
- Cycling has the same fault path: a sweet-spot ride compared to recent endurance rides looks like fitness loss.

Root cause has **three sub-faults**:
1. **No variance flag.** A variance signal exists (`pacing_variability.coefficient_of_variation` per `analyze-running-workout/index.ts:3779-3786`; `powerVariability.coefficient_of_variation` per `analyze-cycling-workout/index.ts:554`; `variability_index` NP/AP per cycling `:560`) but is consumed only by PACING/SMOOTHNESS rows, not the narrative or comparison pools.
2. **CV is GAP-blind in the wrong direction.** The CV in `granular-pace.ts:431–465` is computed on a pace series that already swapped in GAP-corrected samples (`:874–885`) — good for that branch. But the CV is **only computed inside `calculateIntervalPaceAdherence`** (gated at `:904`), so unlinked fartleks and unplanned variable-effort runs skip CV computation entirely. The fix needs a CV that always runs on the GAP-corrected sample series regardless of plan link.
3. **vs_similar and TREND ignore GAP.** `queries.ts:64–66 getOverallPaceSecPerMi` returns raw pace. Historical comparisons across terrain are noise-dominated by elevation. Today's flat tempo vs. a historical hilly tempo compares like-for-unlike even when both are correctly classified as tempo. This is adjacent to Bug B and the user's direction makes it in-scope: "raw HR drift / pace / fitness reads must factor in grade."

---

## 2. Bug A — segment labels (run only)

### 2.1 Fix in the analyzer

Replace the `!isStructuredIntervalSession` gate in `analyze-running-workout/index.ts:buildSessionIntervalRows` with a measured-evidence gate:

- **New condition for `overall_only`**: ONLY when `detailed_analysis.interval_breakdown.intervals` has fewer than 2 entries with measured execution. (Today's gate `!isStructuredIntervalSession` cares about the *planned* shape; the new gate cares about the *measured* shape, which is what determines whether a row-per-interval table is even possible.)
- **When breakdown intervals exist (≥2 with measured execution)**: build rows from `breakdown.intervals` regardless of plan link or `isStructuredIntervalSession`. Each row carries:
  - `planned_label` — from the breakdown row's own `planned_label` if present (set by `compute-workout-summary:formatPlannedLabel`), else `null` (the display layer synthesizes "Interval N" / "Recovery N" — see §2.2).
  - `kind` — from `interval_type` (work/recovery/warmup/cooldown).
  - `interval_number` and `recovery_number` — passed through from the breakdown row.
- **The fully-unplanned no-totals path (`:3998`)** still emits a single overall row, but with `planned_label: null` (not the literal `'Overall session'`). The display layer's `CompletedTotalsSegmentTable` already renders `"Overall"` for the single-row case.

**Stop emitting the literal `'Overall session'` from the analyzer entirely.** Three sites to delete.

### 2.2 Display layer — `humanizePlannedSegmentLabel`

Single chokepoint at `_shared/session-detail/build.ts:41–51`. Replace with:

1. **Defense-in-depth guard.** If raw string equals `'overall session'` (case-insensitive) OR `intervalType === 'overall'`, return `'Overall'`. This catches stale `workout_analysis` rows from before redeploy without backfill.
2. **Synthesize from `interval_type` + `interval_number` when label is missing.** Empty raw string + `intervalType === 'work'` + `interval_number = N` → `'Interval N'` (today: bare `'Work'`). Recovery → `'Recovery N'`. Warmup → `'Warmup'`. Cooldown → `'Cooldown'`. Aligns with `interval-breakdown.ts:980–983` so PACING and segments-table speak the same dialect (also resolves Inc-4 as a side effect).
3. **Pass through meaningful labels** (`'0.5 mi'`, `'5:00 @ 6:30-7:00'`, `'200 yd Stride'`).

Signature change: needs `intervalNumber` and `recoveryNumber` arguments. Both `ibList` and `sessionRows` branches in `build.ts:218,254` already have the values handy — pass them through.

### 2.3 Footgun acknowledgment

`build.ts:277–279` (force-promote `overall_only` → `interval_compare_ready` when `intervals.length > 0`) stays. After §2.1 it becomes dead code in the common path, but keeping it adds a recovery channel if a downstream consumer slips out of sync.

### 2.4 No client changes

`EnduranceIntervalTable.tsx` and `CompletedTotalsSegmentTable` render whatever the server sends. Unchanged.

---

## 3. Bug B — variance gate, GAP-aware (run + cycling)

### 3.1 The variance flag — `is_mixed_effort`

One persistent, deterministic boolean per workout, written into `workout_analysis.session_state_v1.glance.is_mixed_effort`, with supporting numerics under `glance` so future tuning is auditable:

```
glance.is_mixed_effort: boolean
glance.variance_signal: 'pace_cv' | 'pace_spread' | 'interval_execution' | 'detected_intervals'
                       | 'power_cv' | 'variability_index' | null   // why true; null when false
glance.pace_cv_pct: number | null              // run, GAP-corrected if available
glance.pace_cv_basis: 'gap' | 'raw' | null     // which series fed the CV
glance.pace_spread_s_per_mi: number | null     // run, GAP-corrected if available
glance.power_cv_pct: number | null             // cycling
glance.variability_index: number | null        // cycling NP/AP
```

### 3.2 Run-side variance computation — must be GAP-first

**Move the CV computation out of the `isIntervalWorkout` branch in `granular-pace.ts`.** Today CV only runs inside `calculateIntervalPaceAdherence` (gated at `:904`), so unlinked fartleks and unplanned variable-effort runs skip CV entirely. Compute CV unconditionally for any session with ≥30 valid pace samples, using the same GAP-enriched `effectiveSensorData` series the intervals path already uses (`:870–885`).

This means:
- `pacing_variability.coefficient_of_variation` becomes available for steady-state sessions too.
- The CV value is GAP-corrected whenever `hasUsableElevation(sensorData) === true`.
- A hilly easy run with raw pace swinging 6:00 → 9:00/mi up climbs and down descents shows GAP-corrected pace around a tight band (say 7:45 ± 12 s/mi) — CV stays low, gate stays false. **This is the user's "terrain-driven variance must not trip the flag" requirement, satisfied at the source.**
- A flat fartlek showing genuine effort variation (7:30 ↔ 9:30/mi at constant grade) still trips the gate because GAP correction is a no-op on flat ground.

The CV is persisted to fact_packet (`facts.pacing_variability_cv_pct`) and exposed in `glance.pace_cv_pct` + `glance.pace_cv_basis`.

### 3.3 Run-side `is_mixed_effort` predicate

Any one of these is sufficient (we OR, not AND — false-negatives on intervals hurt more than false-positives on flat hilly runs which the GAP fix already neutralizes):

1. **`pace_cv_pct >= 8`** — only counted when `pace_cv_basis === 'gap'` OR the route is classified `flat` (so raw-pace CV is trustworthy when GAP is unavailable). Skips the predicate otherwise.
2. **`pace_spread_s_per_mi >= 75`** across ≥5 segments — also GAP-corrected. Promotes the existing `suppressHrDriftForIntervals` heuristic at `_shared/fact-packet/ai-summary.ts:629-640` from display-only to first-class.
3. **`interval_execution.total_steps >= 2`** AND measured execution exists for ≥2 work steps — linked-plan signal, trustworthy regardless of CV.
4. **`detectWorkoutTypeFromIntervals` returns a non-easy/non-steady type** — existing unlinked-session heuristic.

`variance_signal` records which predicate fired (first-match priority: linked > detected > cv > spread).

### 3.4 Cycling-side variance computation

Cycling already has it — surface to the same shape:

- **`power_cv_pct`** ← existing `granular_analysis.power_variability.coefficient_of_variation` (`analyze-cycling-workout/index.ts:554`).
- **`variability_index`** ← existing `granular_analysis.power_variability.variability_index` (`:560`).
- No GAP concern on the bike (NP already handles terrain via the 4th-power smoothing).

### 3.5 Cycling-side `is_mixed_effort` predicate

Any one of:

1. **`variability_index >= 1.05`** — textbook threshold for "non-steady" rides. Below 1.05 a ride is effectively constant-power; ≥1.05 means meaningful surges (intervals, group ride, hilly).
2. **`power_cv_pct >= 12`** — proxy for sessions where VI isn't reliable (short rides, sparse power data).
3. **Classified type in `{ 'vo2', 'threshold', 'sweet_spot', 'intervals', 'fartlek' }`** — plan intent path; classification trust per existing `_shared/cycling-v1/classify.ts`.

Cycling has no `detectWorkoutTypeFromIntervals` analog needed because `variability_index` covers the unplanned-detection use case.

### 3.6 Classification — plan intent is sacred

Per user direction:

- **Linked-plan sessions:** `classified_type` is **never** overwritten. If the linked plan says `easy` and the variance gate trips (e.g., athlete added unplanned strides or hit a hilly route harder than planned), persist `classified_type:'easy'` AND `classified_type_variance_override: true`. The override flag is the audit trail.
- **Unlinked sessions:** `classified_type` defaults to `'steady_state'` from `detectWorkoutTypeFromIntervals`. If the variance gate trips, override to `'intervals'` (no plan intent to protect). Set `classified_type_variance_override: true` here too so the path is uniform.

Stored at `workout_analysis.session_state_v1.glance.classified_type_variance_override: boolean`.

### 3.7 vs_similar pool filter — exclude mixed-effort from steady pool

In `_shared/fact-packet/queries.ts:232–237`:

Easy/steady pool eligibility becomes:
- `inferWorkoutTypeKey(r) ∈ easyLike` AND
- `r.workout_analysis?.session_state_v1?.glance?.is_mixed_effort !== true`

Interval/tempo pool eligibility becomes:
- `inferWorkoutTypeKey(r) ∈ intervalLike` OR `r.workout_analysis?.session_state_v1?.glance?.is_mixed_effort === true`

The `classified_type_variance_override` flag means a linked-plan `'easy'` run that tripped the gate is correctly excluded from the easy pool **without** mutating its primary classification. Type contagion stops in both directions.

### 3.8 vs_similar and TREND — prefer GAP

In `_shared/fact-packet/queries.ts`:

- New `getOverallGapSecPerMi(row)` that reads `computed.overall.avg_gap_s_per_mi` (already written by the analyzer when usable elevation exists).
- New `resolvePaceForComparison(currentRow, candidateRow)`: returns GAP when **both** rows have it; otherwise returns raw pace from both (matched basis). Never mixes a GAP value from one row with a raw value from another.
- `vs_similar` `currentAvgPaceSecPerMi` and historical `pace` (`:264, 311, 317, 436`) both flow through the new resolver.
- `trend_points` carry an additional `pace_basis: 'gap' | 'raw'` field. The client TREND already exists and just plots numbers — no client change needed; the values are now apples-to-apples.

Net effect: when a flat tempo today is compared to historical tempos that included hilly ones, the comparison is on GAP — terrain drops out. When neither row has GAP (older flat-road data), it falls back to raw with no mixing.

### 3.9 LLM input shape — INSIGHTS interprets intervals

`_shared/fact-packet/ai-summary.ts:toDisplayFormatV1` returns a payload to the LLM. When `is_mixed_effort === true`, swap the steady-effort frame for an interval-interpretation frame:

**Drop entirely (when `is_mixed_effort`):**
- `signals.vs_similar` (no whole-workout pace/HR delta comparison — the workout isn't a whole-workout effort).
- `workout.avg_pace` as the headline (replace with per-interval breakdown).
- The "compared to similar efforts" prompt scaffold lines.

**Add (when `is_mixed_effort`):**
- `signals.interval_summary` — built from `detailed_analysis.interval_breakdown.intervals[]`:
  ```
  {
    structure: 'planned' | 'detected_unplanned',
    completed_steps, total_steps,                          // from performance
    execution_score,                                       // from performance.execution_adherence
    work_intervals: [{ n, planned_label, planned_pace_display,
                       actual_pace_display, actual_gap_pace_display,
                       pace_adherence_pct, hr_avg, hr_max }],   // GAP-aware per §3.2
    recovery_intervals: [{ n, planned_label, actual_pace_display, hr_avg }],
    pace_cv_pct, pace_cv_basis,                            // tell the LLM what the variance was
    grade_adjusted: boolean,                               // true when interval paces are GAP-corrected
  }
  ```
- New prompt instruction: "This was an interval/mixed-effort workout. Do not compare whole-workout averages to easy-run history. Interpret the per-interval execution: which work bouts hit the prescribed range, where the athlete drifted, how recoveries went. When grade-adjusted pace is provided, use it as the effort read; do not anchor the narrative on raw pace if GAP differs."

**Keep:**
- The deterministic anti-jargon guard (`POLISH-PUNCH-LIST.md:269`) and its retry loop. The new prompt scaffold is additive; the guard still polices output.

### 3.10 Concrete copy targets

**Linked-plan interval (5×3 min @ 6:30-7:00/mi, hilly):**
> "5 × 3 min @ 6:30-7:00/mi. Hit 4 of 5 in range on grade-adjusted pace; #4 drifted 14 s/mi slow as HR climbed to 167 on a long uphill. Recoveries averaged 9:30/mi (GAP). Pacing CV 9% on GAP — typical for VO2 work with rolling terrain. Execution grade 82/100."

**Unlinked fartlek detected (Garmin-imported, 7 segments, 142 s/mi raw spread, rolling route):**
> "Garmin-detected fartlek — 7 segments, GAP pace 7:50 → 8:55/mi, HR 140-167. Two hardest efforts averaged 7:55/mi (GAP) at 162 bpm; easier segments 8:40/mi at 145 bpm. Interpreted per-segment, not compared to your easy-run baseline."

**Hilly easy run that does NOT trip (raw pace 6:00 ↔ 9:00/mi, GAP 7:42 ± 10 s/mi, +1200 ft):**
> Falls through to the existing easy-run narrative path. Raw pace swings are explained by terrain, not effort variation. (No change to existing copy.)

**Cycling sweet-spot (VI 1.08, IF 0.88):**
> "Sweet-spot ride — 220W normalized power at IF 0.88, VI 1.08 means meaningful surges. Held the target band for ~75% of the work time. Interpreted as structured effort; not compared to your endurance ride baseline."

### 3.11 TREND — fixed for free

Same pool filter (§3.7) feeds `trend_points` (`queries.ts:281-328`). Once the easy pool excludes mixed-effort rows AND comparisons are GAP-when-available, TREND becomes apples-to-apples without further changes. No new gate.

---

## 4. Affected files

Run (`analyze-running-workout` + shared):
- `analyze-running-workout/index.ts` — `buildSessionIntervalRows` rewrite (§2.1); CV unconditional + `is_mixed_effort` computation (§3.2-3.3); `classified_type_variance_override` (§3.6); persist new `glance.*` fields (§3.1).
- `analyze-running-workout/lib/adherence/granular-pace.ts` — lift CV computation out of `calculateIntervalPaceAdherence` so it runs on any session with ≥30 GAP-enriched samples (§3.2).

Cycling (`analyze-cycling-workout` + shared):
- `analyze-cycling-workout/index.ts` — `is_mixed_effort` computation (§3.4-3.5); persist `glance.*`; `classified_type_variance_override` (§3.6).

Shared (consumed by both analyzers + workout-detail):
- `_shared/fact-packet/queries.ts` — vs_similar pool filter (§3.7); GAP-aware pace resolver (§3.8); `inferWorkoutTypeKey` reads the override flag.
- `_shared/fact-packet/ai-summary.ts` — `interval_summary` block + prompt scaffold swap (§3.9-3.10). Drop `suppressHrDriftForIntervals` (replaced by `is_mixed_effort`).
- `_shared/fact-packet/build.ts` — surface `is_mixed_effort` and GAP fields on the fact_packet contract.
- `_shared/session-detail/build.ts` — `humanizePlannedSegmentLabel` rewrite (§2.2).
- `_shared/cycling-v1/ai-summary.ts` — symmetric `interval_summary` block for rides.

Client: **none**.

---

## 5. Deploy scope

Per `CLAUDE.md` "Deploy policy" — must ship every edge function that imports the changed shared modules. Concretely:

```
supabase functions deploy \
  analyze-running-workout \
  analyze-cycling-workout \
  workout-detail \
  recompute-workout \
  bulk-reanalyze-workouts \
  ingest-activity \
  --project-ref yyriamwvtvzlkumqrvpm
```

- `analyze-running-workout`, `analyze-cycling-workout` — primary changes.
- `workout-detail` — imports `_shared/session-detail/build.ts` (label change).
- `recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity` — route to the analyzers per the orchestrator pattern; redeploy because the analyzer signature carries new persisted fields.
- `coach`, `compute-snapshot`, `compute-facts` — read `workout_analysis` but do not consume `is_mixed_effort` or `classified_type_variance_override` (yet). **No redeploy this slice.** If a future State surface reads these, that's a separate change.

**No backfill** — stale-until-touched per user direction:
- Existing rows without `is_mixed_effort` are treated as `!is_mixed_effort` by the pool filter. Old fartleks stay in easy pools until they're re-analyzed by the next ingest/recompute that touches them. This is a known temporary skew that decays naturally as the user logs new workouts; user accepts it.
- Existing rows carrying `'Overall session'` labels are caught by the display-layer defense-in-depth guard (§2.2 rule 1) — render flips to `'Overall'` immediately on next `workout-detail` fetch (no row mutation needed because `workout-detail` rebuilds `session_detail_v1` per request).

---

## 6. Test cases

Add as `*.test.ts` under `supabase/functions/_shared/` per the existing pattern.

**Bug A (run):**

- `unplanned interval run, 6 measured breakdown intervals → mode='interval_compare_ready', 6 rows, no row labeled 'Overall session'`.
- `truly unplanned steady run, no breakdown → mode='overall_only', single row, planned_label=null` (display renders 'Overall').
- `linked plan, 2 work steps, only 1 measured → mode='awaiting_recompute'` (unchanged).
- `humanizePlannedSegmentLabel('Overall session', 'overall') === 'Overall'`.
- `humanizePlannedSegmentLabel('', 'work', { intervalNumber: 3 }) === 'Interval 3'`.
- `humanizePlannedSegmentLabel('', 'recovery', { recoveryNumber: 2 }) === 'Recovery 2'`.

**Bug B (run, GAP-aware variance):**

- `flat fartlek, 142 s/mi GAP spread → is_mixed_effort=true, variance_signal='pace_spread', pace_cv_basis='gap'`.
- `hilly easy run, raw pace spread 180 s/mi, GAP spread 22 s/mi, CV(GAP) 4% → is_mixed_effort=false` (terrain-driven variance does NOT trip).
- `hilly easy run, GAP unavailable, route classified 'hilly', CV(raw) 14% → is_mixed_effort=false` (untrustworthy raw CV is skipped per §3.3 rule 1).
- `flat easy run, GAP unavailable, route classified 'flat', CV(raw) 11% → is_mixed_effort=true` (trustworthy raw CV is used).
- `linked plan 5×3min → is_mixed_effort=true via interval_execution`.
- `linked plan 'easy' that tripped variance gate → classified_type='easy', classified_type_variance_override=true` (plan intent preserved).
- `unlinked steady run that tripped variance gate → classified_type='intervals', classified_type_variance_override=true`.

**Bug B (cycling):**

- `endurance ride, VI 1.02, CV 6% → is_mixed_effort=false`.
- `sweet-spot ride, VI 1.08 → is_mixed_effort=true, variance_signal='variability_index'`.
- `group ride, classified 'endurance', VI 1.12 → is_mixed_effort=true` (override flag set, classified_type unchanged if linked plan said endurance).

**Pool filter + GAP comparisons:**

- `vs_similar easy pool excludes rows with is_mixed_effort=true regardless of classified_type`.
- `vs_similar uses GAP when both current and candidate have avg_gap_s_per_mi`.
- `vs_similar falls back to raw when either row lacks GAP; reports pace_basis='raw'`.
- `trend_points carry pace_basis field`.

**LLM input swap:**

- `is_mixed_effort=true → signals.vs_similar is null, signals.interval_summary is populated`.
- `interval_summary.grade_adjusted=true when GAP fed the per-interval paces`.
- `narrative does not include "compared to similar" / "vs similar" substrings when is_mixed_effort`.

---

## 7. Decision log entry (draft)

To be filed as the next available D-NNN in `docs/DECISIONS-LOG.md` at implementation time:

> **D-NNN — `is_mixed_effort` is the canonical variance flag; plan intent is never overwritten; comparisons prefer GAP.**
>
> Why: Production observation — INSIGHTS narrates fartleks and structured intervals as if they were steady efforts, comparing whole-workout HR/pace averages against easy-run history. Root cause: the variance signals existed (CV, VI, pace spread) but were consumed only by PACING/SMOOTHNESS rows, never by the comparison pool filter or the narrative LLM input. Compounding: vs_similar used raw pace, so hilly historical sessions polluted flat comparisons even when correctly classified.
>
> Decision: One persistent boolean (`workout_analysis.session_state_v1.glance.is_mixed_effort`) computed by both run and cycling analyzers from existing signals. Run-side CV is GAP-corrected; cycling uses VI. Linked-plan `classified_type` is **never** overwritten — the variance gate sets a parallel `classified_type_variance_override` flag so pool filters can exclude the row without mutating intent. All pace comparisons (vs_similar, trend) prefer GAP when both rows have it; raw is fallback only, basis is reported.
>
> Alternative considered: client-side variance detection in `SessionNarrative.tsx`. Rejected — the variance signal must be persisted to break the type-contagion feedback loop in vs_similar/trend pools, which is a server concern.
>
> Alternative considered: overwrite `classified_type` when variance disagrees with plan intent. Rejected — plan intent is the athlete's stated goal for the session and load-bearing for adapt-plan, coach narrative, and execution-grade comparisons; mutating it would silently corrupt the plan-adherence story.

---

## 8. Open questions

1. **CV threshold for run.** Proposed 8% (sits between PACING's 5% Mastery / 10% uneven boundaries). Adjust to 7% or 10% if you have a preference; default keeps 8% and tunes after 2 weeks of production data.
2. **VI threshold for cycling.** Proposed 1.05 (textbook). Confirm.
3. **Minimum sample count for unconditional CV.** Proposed 30 valid pace samples (~30 s of running). Below that, `pace_cv_pct` is null and predicate 1 of §3.3 doesn't fire. Confirm.
4. **`pace_cv_basis='raw'` on a non-flat route.** Spec says: skip predicate 1 (don't trip the gate on untrustworthy raw CV). Confirm — alternative is "use raw CV but with a higher 12% threshold." Conservative path (skip) is the default.

---

## 9. Non-goals (explicit)

- TERRAIN reclassification (Bug D).
- NEXT label unification (Inc-1).
- Race-block dedup (Inc-2).
- AERO for cycling on State (Gap 3).
- Cross-discipline interference (Gap 1) — separate spec.
- State-side consumption of `is_mixed_effort` (e.g., a "your last 3 'easy' runs were actually intervals" nudge) — separate change.
- Migrating older rows to populate the new fields. Stale-until-touched only.
