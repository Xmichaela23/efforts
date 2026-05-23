# Feedback Loop Closure — Work Order

**Status:** planning artifact. Each phase is executed as its own arc (spec → approval → implement → gate → ship → close-out). **Phases are not bundled.**

**Origin:** 2026-05-22 audit (`docs/FEEDBACK-LOOP-AUDIT.md` if filed separately; otherwise see in-conversation report). The audit found that the analyze → snapshot → Arc → plan loop is **open for most disciplines**. `generate-combined-plan/index.ts` never calls `getArcContext()`. The wrapper (`create-goal-and-materialize-plan`) fetches Arc and passes athleteState through, but the engine reads baselines and request-shape fields — not Arc-aggregated dynamic data. Even where the upstream loop closes (cycling CTL/ATL/TSB), the planner doesn't read the result.

**Severity per discipline (from audit):**

| Discipline | Loop state | Audit-confirmed |
|---|---|---|
| Cycling | Closed to coach (form band display); open to planner | Coach uses `cycling_fitness`; planner doesn't read it |
| Run | Analyzer + snapshot writes exist; Arc + planner don't read | Run adherence display-only |
| Strength | Write-only (`exercise_log` populated; `adapt-plan` reads it for suggestions; generator ignores) | User hypothesis confirmed |
| Swim | Minimal; no snapshot section at all | Session counts only |

---

## Cross-cutting principle: adaptive ≠ jumpy

Every phase MUST address: **what happens on the next plan regenerate after one anomalous week.** A single bad workout, a single training session missed, or a one-week injury should not destabilize the plan. Where the work order concludes a loop is better left display-only than wired reflexively, the work order says so explicitly — phases don't wire reflexively because the audit said the loop was open.

**Division of responsibility — architecture vs. parameters:**

The work order LOCKS the architectural SHAPE of the anti-volatility approach per phase. Each phase's per-phase spec then tunes the numerical parameters (window length, divergence threshold %, N for sustained evidence, etc.) within that committed pattern. This keeps cross-phase consistency at the architectural level; phases don't re-litigate the volatility question from scratch.

**The toolbox** (each phase below commits to a specific combination):

- **Confidence-weighted blend.** Observed signal blended with baseline by sample-count confidence; single workout has minimal weight.
- **Trailing window.** N-week rolling average; the spec picks N within the committed shape.
- **Divergence threshold.** Observed value only displaces baseline when it diverges past a non-trivial margin sustained over the trailing window.
- **Hysteresis.** Once observed displaces baseline, requires reverse divergence to swing back — no oscillation around a boundary.
- **One-way ratchet (safety-asymmetric).** Load increases require sustained evidence; load decreases require less evidence. The asymmetry favors the safe direction (which differs by phase — Phase 1's safe direction is "tighten in response to fatigue"; Phase 2's safe direction is "decrease load on regression").
- **Outlier rejection.** Single sessions that deviate >2σ from the trailing distribution are excluded from the trend.
- **N-consistent-sessions gate.** A signal change must show across N consecutive (or N-of-M) sessions before it propagates to the plan.

**Per-phase pattern commitments are made in the phase sections below.** Specs do not re-pick the architecture — they tune the numbers within it.

**Fast-reference summary:**

| Phase | Discipline | Pattern (LOCKED at work-order level) | What flows to plan |
|---|---|---|---|
| 1 | Run pace | Threshold-triggered displacement + trailing window + asymmetric ratchet (worsening picked up faster than improving) | Observed threshold pace only |
| 2 | Strength | Asymmetric ratchet + outlier rejection + N-consistent-sessions gate (decreases pull faster than increases; fixed rule is no-signal default, not floor) | Observed 1RM trend (both directions); fixed rule fills the gap when signal is inconclusive |
| 3 | Cycling | **If closure chosen:** trailing form band ONLY (never raw TSB / raw CTL). **If display-only wins:** no pattern needed | Form band → power-target hysteresis transitions (or nothing if display-only) |
| 4 | Swim | Confidence-weighted blend + trailing window; observed CSS pace ONLY (SWOLF + adherence + drill-completion locked display-only) | Observed CSS pace only |

---

## Phase 0 — Architectural foundation (prerequisite for Phases 1-4)

**Goal:** Thread `getArcContext()` output into `generate-combined-plan` so the engine can consume dynamic fields per phase. **This phase wires the channel but changes NO plan behavior.** Every consumer continues to read baselines until its own phase ships. Pure plumbing, behavior-neutral, fully test-locked.

**Why this must ship before 1-4:** Without it, every subsequent phase has to invent its own Arc-fetch path — either duplicating the wrapper's read or re-querying. Centralized once, the engine sees Arc consistently.

### Scope

- Add Arc context as an optional input to `generate-combined-plan/index.ts` request body (mirrored from the wrapper's existing `arcForPlanning` shape).
- Thread Arc into `buildWeek` / `week-builder.ts` via the existing `options` parameter or a parallel `arc` parameter. Decision point in the spec.
- Document a clear separation: **baselines = athlete intent + manual entries** (what they say); **Arc = dynamic observed state** (what they're doing). Consumers in later phases read both, decide which to use, and document the choice.
- Behavior-neutral verification: every existing test case must produce **byte-identical** output. New tests confirm the channel exists but isn't consumed yet.

### Files (read-only audit needed before scope finalization)

- `generate-combined-plan/index.ts` — entry point. Add Arc to request payload type. Default to empty `{}` to preserve existing callers.
- `generate-combined-plan/week-builder.ts` — `buildWeek` signature extension. Pass through to per-session helpers.
- `create-goal-and-materialize-plan/index.ts` — already fetches Arc via `arcForPlanning`; wire it into the `generate-combined-plan` payload.
- `_shared/arc-context.ts` — no changes; just the consumer side learns to read it.
- New: `arc-channel.test.ts` to lock the back-compat: arc=undefined → byte-identical plans.

### Risks

- **Risk: behavior change leaks into Phase 0.** A consumer reads Arc accidentally because the data is now in scope. Mitigation: behavior-neutral pin tests on every existing plan-generation fixture (byte-identical hashing of the generated weeks).
- **Risk: request payload schema change breaks legacy callers.** Mitigation: Arc field is optional and defaults to `{}`. Existing tests + telemetry sites pass `{}` automatically.
- **Risk: parameter sprawl.** Engine signatures already large. Mitigation: pass Arc as a single object on the `options` parameter; per-phase consumers destructure what they need.

### Open questions for the Phase 0 spec

1. **Where does the engine receive Arc?** Request body (preferred) vs. fetched directly inside `generate-combined-plan` (couples the engine to the Arc fetch path). The wrapper already fetches; request-body avoids re-fetch.
2. **What Arc fields are channeled?** Full `ArcContext` (large) vs. a curated subset. Curated likely cleaner. If curated, what's the cutoff for "dynamic enough to matter to the planner"?
3. **Test format for behavior-neutral.** Byte-equal serialized weeks? Hash of generated week structure? What's the granularity that catches accidental consumption but tolerates legitimate refactor noise?
4. **Default value.** `arc?: ArcContext` (undefined when absent) vs. `arc: ArcContext = {}` (empty default). Trade-offs around accidental field reads.

### Decision: D-032 — SHIPPED 2026-05-22

**Status:** **shipped.** Spec at `docs/PHASE-0-ARC-CHANNEL-SPEC.md` (commit `30e88008`); implementation at commit `ad4102f8`; close-out at this commit. Engine + wrapper deployed. SHA-256 byte-identical hash gate green on 5 fixtures × 2 modes (`arc-channel.test.ts`). Phases 1-4 unblocked.

---

## Phase 1 — Run pace feedback loop

**Goal:** Expose `snapshot.run_*` aggregates in Arc, and let run pace targets consider observed threshold pace alongside the manual baseline.

### Audit summary

- `compute-snapshot:123-138` aggregates weekly `easyPaces`, `runEfficiencies`, `intervalHits`, `intervalTotals`, `longestRunDur` into `athlete_snapshot.run_*` fields.
- `arc-context.ts` exposes `learned_fitness.run_threshold_pace_sec_per_km` (baselines + offline learning) and `run_pace_for_coach` (formatter). Does NOT expose `athlete_snapshot.run_*`.
- `generate-combined-plan` reads from `athleteState` (baseline-derived) for run pace targets. No Arc consumption.

### Anti-volatility pattern (LOCKED at work-order level)

**Threshold-triggered displacement + trailing window + asymmetric ratchet.**

- **Threshold-triggered displacement.** Observed pace does NOT continuously blend into the baseline. It displaces the baseline only when the divergence exceeds a sustained margin across the trailing window. Below the threshold, baseline holds. Spec tunes the divergence % and the sustained-margin definition.
- **Trailing window.** Multi-week rolling — spec tunes N (likely 4-6 weeks to match within-phase ramp granularity).
- **Asymmetric ratchet.** Fatigue and fitness loss are picked up faster than fitness gains. A worsening signal (observed pace > baseline pace) tightens the plan sooner than an improving signal (observed pace < baseline pace) loosens it. This protects against locking-in a deload week as the new baseline; it also stops single-PR weeks from auto-prescribing harder paces. The asymmetry direction is **safety-favored**: the plan defaults to conservative.

Specs tune the numbers (window N, divergence %, asymmetric ratchet ratio); the SHAPE above is locked.

### Scope (subject to spec for numbers)

- **Expose** `snapshot.run_*` in `arc-context.ts` under a new field (e.g. `run_observed_fitness`). Confidence-weighted by sample count.
- **Implement** the locked pattern above as a reconciliation helper in `generate-combined-plan/science.ts` (e.g. `resolveRunPaceTarget(baseline, observed, trailingWindow)`).
- **Per-distance scoping.** Observed threshold pace from 5K-style intervals reconciles separately from the 70.3 race pace prescription; spec defines the discipline-effort-tier map.

### Files

- `_shared/arc-context.ts` — new `run_observed_fitness` field (or similar; spec names it).
- `compute-snapshot/index.ts` — verify aggregates are sufficient (they're already computed; the gap is exposure).
- `generate-combined-plan/science.ts` — pace derivation helpers. Spec adds a decision helper (e.g. `resolveRunPaceTarget(baseline, observed)`).
- `generate-combined-plan/week-builder.ts` — call sites for pace targets.
- New: `run-pace-feedback.test.ts` for the reconciliation logic, anti-volatility scenarios, and end-to-end pace adjustment.

### Risks

- **Volatility risk:** athlete has one fast workout → next plan prescribes harder paces → athlete struggles → confidence loss. Mitigation: the spec's anti-volatility pattern; pin tests covering single-week outliers.
- **Direction risk:** observed pace drops because athlete is fatigued, not because fitness changed. The reconciliation helper must not "lock in" a deload as the new baseline. Mitigation: trailing window + asymmetric ratcheting (paces tighten faster than they loosen, conditional on ACWR readiness).
- **Per-distance coupling:** observed threshold pace from 5K-style intervals shouldn't dictate 70.3 race pace prescription. Mitigation: spec scopes the reconciliation to the appropriate effort tier; different lerp targets per race distance read different reconciled values.

### Open questions for the Phase 1 spec (numbers within the locked shape)

1. **Window length.** 4 weeks? 6? 8? The 70.3 / IM build phase is 4-6 weeks; window needs to match the granularity of within-phase ramps without lagging behind real-time adaptation.
2. **Divergence threshold.** What sustained % divergence triggers displacement? Likely 3-7% range; spec argues with coaching reference.
3. **Confidence threshold for engagement.** `learned_fitness.confidence_band` exists today (`high/medium/low`); spec defines when the engine actually uses observed pace vs. defaults to baseline.
4. **Asymmetric ratchet ratio.** How much faster does the ratchet tighten vs. loosen? E.g. tighten triggers at 3% divergence; loosen requires 5%. Spec picks the asymmetry.
5. **Per-tier scoping.** Which run pace targets does observed pace influence? Threshold lerps yes; race-pace prescription maybe; long-run pace probably not. Spec maps signals to consumers.
6. **Display vs. plan-adaptive.** Confirm: efficiency index and interval-adherence % are display-only (Arc surfaces them; planner does not consume). Only threshold pace feeds targets.

### Decision: D-033 — SHIPPED 2026-05-22

**Status:** **shipped.** Spec at `docs/PHASE-1-RUN-PACE-SPEC.md` (commit `b8f1e626` / `d87be8ef`); Path B amendment + implementation + close-out at this commit. Engine + wrapper deployed. Reconciler engages on three independent anti-volatility gates: streak (≥2 weeks worsening / ≥4 weeks improving outside ±4% band), median (4-week median outside ±4% band in matching direction), ACWR ≤ 1.3 (worsening path only). 22 pin tests in `run-pace-feedback.test.ts` (10 spec §6 scenarios incl. LOAD-BEARING ACWR-gate triad 6.7/6.8/6.9 + LOAD-BEARING §6.10 Path B regression pin + 12 unit tests). See DECISIONS-LOG D-033 + ENGINE-STATE Solid entry.

**Workorder pauses here per user direction.** Phases 2 (strength) / 3 (cycling Arc-to-plan) / 4 (swim aggregation) remain queued — D-034 / D-035 / D-036 — but are NOT scheduled. Resumption is user-gated.

---

## Phase 2 — Strength progression loop

**Goal:** Let `generate-combined-plan` read `exercise_log` 1RM trends so strength load progression reflects actual lifting performance.

### Audit summary

- `compute-facts` writes `exercise_log` (per-exercise: canonical_name, estimated_1rm, avg_rir, sets_count).
- `adapt-plan/index.ts:231-308` reads `exercise_log` and generates progression suggestions stored in `plan_adjustments`. Suggestions are user-gated; they do NOT auto-apply to the next plan generation.
- `generate-combined-plan` strength session generation uses fixed protocol + phase rules (e.g. 2.5%/week linear progression default). Does NOT read `exercise_log` or `plan_adjustments`.

### Anti-volatility pattern (LOCKED at work-order level)

**Asymmetric ratchet + outlier rejection + N-consistent-sessions gate.**

The fixed 2.5%/week progression rule is the **no-signal default** (the fallback when observed evidence is inconclusive). It is NOT a floor. Observed evidence can drive load in either direction relative to the default:

- **Sustained progression evidence** (1RM gains stable across N consecutive sessions, exceeding what the fixed rule predicts) → generator pushes load **above** the rule. This direction requires the most evidence — strength gains lock in conservatively.
- **Sustained regression evidence** (1RM declines stable across N consecutive sessions — illness, overreaching, a bad block) → generator pulls load **below** the rule. This direction propagates faster — N for regression is smaller than N for progression. The safety-asymmetric direction: when in doubt, deload sooner.
- **No clear signal** (noisy logs, mixed sessions, insufficient sample count) → generator uses the 2.5%/week default. The rule is fallback, not floor.

Additional gates protecting against bad data:

- **Outlier rejection.** Single-session 1RM spikes (the "bad rep log" risk — athlete records 200lb × 5 when they did 200lb × 1) are rejected by ≥2σ deviation from the trailing distribution. `avg_rir` provides a sanity gate (a 1RM spike with RIR=0 inconsistent with prior sessions is suspect). This rejection is symmetric — outlier-low data is also rejected; you don't drop load because of one missed lift any more than you raise it because of one PR.
- **N-consistent-sessions gate.** A signal change (up or down) must show across N consecutive sessions before propagating to the plan. This is the strongest anti-volatility layer for strength because logged data has higher noise than sensor-derived pace/HR. The asymmetry is in N itself: N for regression < N for progression.

Specs tune N (separately for progression vs. regression), the trailing window length, and the outlier σ threshold; the SHAPE above is locked.

### Scope (subject to spec for numbers + architecture decision)

- **Read** `exercise_log` 1RM trends in the strength session generator. Augment (not replace) the fixed protocol-rule progression with observed 1RM-driven progression per the locked pattern above. The fixed rule remains the default; observed evidence shifts load only when the gates fire.
- **Reconcile** with the existing `adapt-plan` suggestion layer. Three candidate architectures (the spec recommends one). The anti-volatility pattern applies regardless of which architecture wins:
  - **Generator-only.** Generator reads `exercise_log` directly; `adapt-plan` deprecates progression suggestions (becomes a notification-only layer for other adaptation kinds like deload triggers).
  - **adapt-plan as canonical source.** Generator reads `plan_adjustments` (the suggestion layer's output). adapt-plan is the canonical reconciliation point. Generator doesn't query `exercise_log` directly.
  - **Layered.** Generator reads `exercise_log` for the baseline progression; adapt-plan's user-confirmed adjustments override on top.

### Files

- `generate-combined-plan/` — strength session generation. Locate the current 2.5%/week rule and the load-resolution helpers. New helper proposed in spec: `resolveStrengthLoadFromObserved(exerciseName, baselineRule, observedTrend)`.
- `adapt-plan/index.ts` — may need scope change depending on Architecture chosen.
- `exercise_log` table — already populated; no schema change anticipated.
- `_shared/arc-context.ts` — likely NO change; strength data accessed directly via `exercise_log` query, bypassing Arc per existing pattern. Spec confirms or revisits.
- New: `strength-feedback.test.ts` for the load-resolution logic and adapt-plan integration scenarios.

### Risks

- **Two competing progression systems.** The whole point of this phase is to NOT build a second one. Mitigation: the spec MUST clearly state which system is authoritative for which decision.
- **Bad-rep-data risk.** Athlete logs a Friday squat as 200lb × 5 when they actually did 200lb × 1 (RIR=0). One bad log skews the estimated 1RM. Mitigation: outlier rejection; require N consistent sessions; the existing `avg_rir` field provides a sanity gate.
- **Load progression for accessories.** `adapt-plan` already separates compound progression (load-driven) from accessory progression (qualitative). The generator's new logic must respect the same split. Mitigation: the helper accepts an exercise-classification flag.
- **Deload weeks.** If observed 1RM drops during a deload, the next non-deload week shouldn't read that as fitness loss. Mitigation: respect phase context; deload weeks excluded from the trailing trend.

### Open questions for the Phase 2 spec (numbers + architecture within the locked shape)

1. **Architecture: generator-only, adapt-plan-canonical, or layered.** Spec recommends.
2. **N for the consistent-sessions gate.** 3 consecutive? 4-of-5? Per-exercise sample size matters; squat probably has more frequent sessions than power clean.
3. **Trailing window** for 1RM trend. Adapt-plan uses 4 weeks; reconcile or specify per-phase.
4. **Outlier σ threshold.** 2σ is the default; spec confirms or refines per exercise type.
5. **Asymmetry ratio.** How much faster do load decreases propagate vs. increases? E.g. 1 regression-session sufficient to trigger a 2.5% load drop; 4 progression-sessions required to trigger a 2.5% load increase above the fixed rule.
6. **Compound vs. accessory split.** Already in `adapt-plan`; reaffirm or revise.
7. **Phase context.** Deload weeks excluded from the trailing window? Rebuild weeks treated specially? The existing strength protocol has phase multipliers; ensure the observed-1RM logic respects them.
8. **Existing `plan_adjustments` overrides.** Spec confirms whether user-confirmed adjustments layer on top of observed-driven progression or replace it.

### Decision: D-034 (proposed)

**Status:** unscheduled. Gated on Phase 0 ship.

---

## Phase 3 — Cycling: connect Arc fitness to plan targets

**Goal:** Decide deliberately whether plan power targets should respond to cycling fitness (CTL/ATL/TSB/form), or whether coach-readiness-only is the correct conservative design. Implement the decision OR document the decision-not-to-implement.

### Audit summary

- `analyze-cycling-workout:200-250` writes `fitness_v1` (CTL, ATL, TSB).
- `compute-snapshot:569-607` extracts and writes ctl/atl/tsb to `athlete_snapshot`.
- `arc-context.ts:920-939` exposes `cycling_fitness` object (ctl, atl, tsb, form band: fresh/neutral/fatigued).
- Coach consumes it; planner doesn't.

This is the **only fully-closed analyze-to-Arc loop**. The question is whether closing it further (Arc-to-plan) is desirable.

### Anti-volatility pattern (LOCKED at work-order level — conditional)

**If closure is chosen: trailing form band ONLY, never raw TSB or raw CTL.**

The work-order-level commitment: raw TSB and raw CTL **never** touch a plan target. The only admissible signal from cycling fitness to plan generation is the **smoothed form band** (the `fresh / neutral / fatigued` categorical that `cycling_fitness` already exposes). Day-to-day TSB swings of ±20 are real and they CANNOT propagate to power-target adjustments. The form band's smoothing is the floor of acceptable noise.

If display-only wins, no pattern is needed — the loop stays as it is today (coach reads `cycling_fitness`, planner doesn't).

Specs tune which form-band transitions trigger which target adjustments, and the hysteresis around band boundaries (preventing oscillation between fresh→neutral→fresh on consecutive regenerates).

### Scope (subject to spec for closure-or-display-only decision)

The spec must argue **both sides** before recommending:

- **For closure:** plan power targets adjust based on observed cycling form band. An athlete with a sustained `fresh` band may get incrementally harder workouts; sustained `fatigued` may unlock deeper recovery without waiting for the validator.
- **Against closure (display-only):** cycling fitness drives the coach's readiness display ("you're fresh — good day for VO2") but plan generation uses fixed power-percentage targets (FTP × phase multiplier). Athlete-controlled. The within-phase rep ramps (D-028) already adjust intensity progressively; the form band may be redundant signal.

Either outcome is acceptable. The deliverable is a documented architectural decision, not necessarily code.

If closure is chosen:
- Add reconciliation helper using the form band as the input (not TSB, not CTL).
- Hysteresis required: spec defines minimum sustained-band duration before the transition takes effect.
- Per-discipline-distinction: VO2 reps shouldn't increase because CTL ramped; that's the rep-formula's job (D-028). Power targets within reps could shift; rep counts stay formula-driven.

### Files

- `generate-combined-plan/science.ts` / `session-factory.ts` — cycling power-target helpers (e.g. `bikeOpeners`, `sweetSpotBike`, `thresholdBike`, `vo2Bike`). Locate where FTP × percentage is computed.
- `_shared/arc-context.ts` — already exposes `cycling_fitness`. No change anticipated.
- New: `cycling-fitness-feedback.test.ts` if closure path is taken.

### Risks

- **TSB volatility.** TSB swings ±20 day-to-day. Direct TSB-to-power-target wiring is reflexive volatility. Mitigation: trailing form band as the signal, not raw TSB.
- **CTL doesn't equal FTP.** CTL is training stress balance, not threshold power. Plan targets ride off FTP; CTL is an orthogonal signal. The spec must NOT conflate them.
- **Phase context.** Build phase: ramping CTL is the design intent. Race-specific: peak CTL with fresh TSB. Each phase has different reconciliation rules. Mitigation: phase-keyed reconciliation.
- **Conservative default.** Recommend display-only by default unless there's strong coaching evidence for closure. CTL/ATL/TSB are well-suited to readiness display; their role in target adjustment is less clear-cut than run pace or strength 1RM.

### Open questions for the Phase 3 spec (architecture decision + numbers if closure)

1. **Closure or display-only?** This is the decision the spec must reach. Both arguments deserve serious treatment.
2. **If closure: what target adjusts?** Power target (FTP %), interval duration, rep count, or all three? Rep count likely stays formula-driven (D-028); power % and interval duration are the candidates.
3. **Sustained-band duration before transition.** How many consecutive weeks of `fatigued` or `fresh` band before the plan responds? Spec sets the hysteresis.
4. **Phase-keyed rules.** Build phase ramping CTL is the design intent (form band trending toward neutral/fatigued is normal); race-specific peak CTL with fresh TSB is the design intent. The form band's MEANING is phase-keyed. Spec handles per-phase reconciliation.
5. **Athlete-control trade-off.** Cycling athletes often have their own opinions about FTP. Auto-adjusting power targets without their input may erode trust. Spec considers the UX impact — possibly tying any plan-target adjustment to a notification (deferred to the out-of-scope notifications work).
6. **TSB / CTL as direct inputs are PROHIBITED at work-order level.** Spec confirms it uses form band only.

### Decision: D-035 (proposed)

**Status:** unscheduled. Gated on Phase 0 ship. **May resolve as "no implementation, display-only is correct" with a documented D-NNN entry.**

---

## Phase 4 — Swim feedback loop

**Goal:** Build swim aggregation (pace, efficiency/SWOLF, adherence) into `compute-snapshot`, expose in Arc, and decide which metrics drive plan adaptation vs. stay display-only.

### Audit summary

- `analyze-swim-workout` writes minimal output to `workout_analysis` (adherence %, stroke analysis when sensor data exists).
- `compute-snapshot` has NO swim section. No `swim_facts` aggregation.
- `arc-context.ts:653-673, 975-983` exposes only `swim_training_from_workouts` (session count + last date).
- `generate-combined-plan` swim targets driven by `swim_protocol-v21.ts` rules + baselines.

This phase is the **most new work** because the aggregation infrastructure doesn't exist. Run + bike had `workout_facts` aggregation; swim has no equivalent.

### Anti-volatility pattern (LOCKED at work-order level)

**Confidence-weighted blend + trailing window — observed CSS pace ONLY.**

The work-order-level commitments:

- **Only observed CSS pace feeds plan targets.** SWOLF, adherence, drill completion, and stroke rate stay **display-only**. SWOLF is a technique signal not a load signal; adherence is ambiguous (under-adherence could be many causes — bad prescription, athlete cut early, equipment issue, water-quality day). Locking these as display-only at the work-order level prevents the spec from drifting into wiring them reflexively.
- **Confidence-weighted blend** for observed CSS pace. Sample-count drives the blend weight; a single threshold session has near-zero weight; a 4-week trailing average converges toward the observed value. The blend is the right shape (not threshold-triggered like Phase 1) because swim threshold work is less frequent than run threshold work — sample count is lower so the engine should integrate observations smoothly rather than wait for a discrete divergence event.
- **Trailing window** sized to swim threshold session frequency. Run has weekly threshold work; swim has 1-2 CSS-anchored sessions per week. Window must be long enough to accumulate evidence without lagging behind real adaptation.
- **Pool vs. open-water distinction.** OW pace is environmental (current, chop, water temp), not pure fitness signal. OW sessions are excluded from the CSS-pace trailing window; included in adherence display only.

Specs tune the blend-weight formula, the trailing window length, and the per-session-type scoping (which session types contribute to the observed CSS estimate); the SHAPE above is locked.

### Scope (subject to spec for numbers)

- **Build** `swim_facts` aggregation in `compute-facts` or `compute-snapshot` (decision in spec — likely mirror run/bike split: per-workout facts → weekly snapshot).
- **Aggregate** per-week swim metrics:
  - Pace per 100yd (per session-type, pool-only) — **drives plan via locked pattern above**.
  - SWOLF (when available) — **display-only, locked**.
  - Adherence-to-prescribed-yardage — **display-only, locked**.
  - Drill-block-completion — **display-only, locked**.
- **Expose** in Arc under `swim_observed_fitness` (or similar; spec names). All four metrics surfaced for display; only pace flows into the reconciliation helper.
- **Implement** the locked pattern as a reconciliation helper in `generate-combined-plan/swim-protocol-v21.ts` (e.g. `resolveSwimCssTarget(baseline, observed, trailingWindow)`).

### Files

- `compute-snapshot/index.ts` — add swim aggregation section (currently absent).
- `compute-facts/index.ts` — verify swim_facts shape (may need extension).
- `_shared/arc-context.ts` — new `swim_observed_fitness` exposure.
- `analyze-swim-workout/index.ts` — ensure analyzer writes the fields the aggregator needs (may be incomplete today).
- `generate-combined-plan/swim-protocol-v21.ts` — pace-target reconciliation helper (analog of run's).
- New: `swim-feedback.test.ts`.

### Risks

- **Limited sensor data.** Many pool swimmers train without per-length sensor data (no Garmin watch, or watch on but no SWOLF). The aggregation must degrade gracefully — absence is normal, not a failure mode.
- **CSS pace volatility from short sessions.** A 1500yd session at threshold doesn't have many data points; a single session's CSS estimate is noisy. Mitigation: trailing window similar to run pace.
- **Open-water swims have no lap-level data.** Pace data exists; per-length data doesn't. Aggregation must distinguish pool vs. OW swims.
- **Adherence ambiguity.** Athlete swims 1800yd of a prescribed 2200yd session. Was the prescription wrong, or did the athlete cut early? Adherence as a plan-adaptation signal is brittle. Mitigation: spec recommends display-only for adherence; only pace drives targets.

### Open questions for the Phase 4 spec (numbers within the locked shape)

1. **Where does aggregation live — `compute-facts` or `compute-snapshot`?** Run/bike split this between facts (per-workout) and snapshot (per-week); swim should mirror.
2. **Trailing window length.** Probably 4-6 weeks (mirroring run pace); spec confirms or adjusts based on actual swim threshold session frequency.
3. **Confidence-weight formula.** Linear in sample count? Sigmoid? Capped at 1.0 once N sessions accumulated? Spec picks.
4. **Per-session-type scoping.** Which session types contribute to the observed CSS estimate? Threshold yes; CSS Aerobic yes; technique-aerobic probably no (drill-heavy, pace contaminated); recovery no.
5. **Sensor-data degradation.** Aggregation behavior when per-length data is absent (the common case for many pool swimmers). Pace from total-distance / total-time is still meaningful and feeds the trailing window.
6. **Drill-completion driver scope.** Confirmed display-only at work-order level — the spec confirms this and does NOT relitigate.

### Decision: D-036 (proposed)

**Status:** unscheduled. Lowest priority of the four loops. Gated on Phase 0 ship.

---

## Execution sequence

```
Phase 0 (architectural foundation)        ← prerequisite for all
    │
    ├── Phase 1 (run pace)                ← highest leverage, well-studied signal
    │
    ├── Phase 2 (strength progression)    ← user-confirmed write-only; clear win
    │
    ├── Phase 3 (cycling Arc → plan)      ← may resolve as "no change"; decide deliberately
    │
    └── Phase 4 (swim aggregation)        ← most new work; lowest priority
```

Phases 1-4 are independent of each other (only Phase 0 is a dependency). After Phase 0 ships, the user can re-prioritize 1-4 based on what's most impactful.

## Per-phase ship checklist

Each phase ships through the same gates:

1. **Investigate-first.** Reproduce current behavior; understand the existing code paths; cite file:line.
2. **Spec.** Markdown amendments to the relevant protocol doc OR a new section in `docs/`. Spec includes the anti-volatility design + answers all open questions for the phase. Spec is committed BEFORE implementation.
3. **Approval gate.** User reads spec, approves or redirects. No implementation until approved.
4. **Implementation.** Per the approved spec.
5. **Test gate.** Unit pins + e2e load-bearing pins. e2e MUST include the anti-volatility scenario (single-week anomaly does not destabilize plan).
6. **Ship.** Commit code, deploy affected edge functions, push to main. (Same pattern as D-028 / D-029 / D-030 / D-031.)
7. **Close-out doc.** D-NNN entry in `DECISIONS-LOG.md`; ENGINE-STATE Solid entry; POLISH update if applicable.

## Out of scope

These adjacent items are NOT in this work order:

- **State page rendering completeness.** The audit flagged that `snapshot.run_*` is computed but not displayed on State page. Surfacing it is a UI task, separate from closing the planner-feedback loop. File as POLISH backlog if not already there.
- **Coach context vs. planner context separation.** Coach reads Arc via `getArcContext()` already. The planner's Arc consumption (Phase 0) brings the planner up to parity with coach, but the broader question of "should coach and planner share an Arc fetch or each have their own context" is architecture-level and not addressed here.
- **`adapt-plan` deprecation question.** Phase 2 may recommend deprecating `adapt-plan` progression suggestions or keeping them as a layered override. Either way, broader `adapt-plan` cleanup (other adaptation kinds it handles) is out of scope.
- **Athlete-facing notifications.** When the planner adapts based on observed performance, should the athlete be notified? UX layer, separate work order.

## References

- 2026-05-22 feedback-loop audit (read-only investigation; in-conversation report).
- `docs/ENGINE-STATE.md` — discipline-by-discipline current state of analyze → snapshot → Arc loops.
- `docs/DECISIONS-LOG.md` — D-NNN entries for each phase as they ship.
- `CLAUDE.md` — Topology section documents the four storage layers and ingest fan-out pattern.
