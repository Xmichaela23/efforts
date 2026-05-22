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

Every phase's spec MUST address: **what happens on the next plan regenerate after one anomalous week.** A single bad workout, a single training session missed, or a one-week injury should not destabilize the plan. Where the spec concludes a loop is better left display-only than wired reflexively, the spec should say so explicitly with reasoning — not wire it because the audit said it was open.

Concrete anti-volatility patterns to consider per phase (not exhaustive):
- **Confidence-weighted blends.** Observed signal blended with baseline by sample-count confidence; single workout has minimal weight.
- **Trailing windows.** Use 4-6 week rolling averages instead of last-week-only.
- **Divergence threshold.** Observed value only displaces baseline when it diverges past a non-trivial margin (e.g. >5% sustained).
- **Hysteresis.** Once observed displaces baseline, requires reverse divergence to swing back — no oscillation around a boundary.
- **One-way ratchets** where appropriate. Strength load increases require sustained evidence; load decreases require less evidence (safety-asymmetric).
- **Outlier rejection.** Single sessions that deviate >2σ from the trailing distribution are excluded from the trend.

The right pattern depends on the discipline + signal. Each phase's spec proposes one and argues why.

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

### Decision: D-032 (proposed)

**Status:** unscheduled. Spec is the next deliverable; implementation gated on user approval.

---

## Phase 1 — Run pace feedback loop

**Goal:** Expose `snapshot.run_*` aggregates in Arc, and let run pace targets consider observed threshold pace alongside the manual baseline.

### Audit summary

- `compute-snapshot:123-138` aggregates weekly `easyPaces`, `runEfficiencies`, `intervalHits`, `intervalTotals`, `longestRunDur` into `athlete_snapshot.run_*` fields.
- `arc-context.ts` exposes `learned_fitness.run_threshold_pace_sec_per_km` (baselines + offline learning) and `run_pace_for_coach` (formatter). Does NOT expose `athlete_snapshot.run_*`.
- `generate-combined-plan` reads from `athleteState` (baseline-derived) for run pace targets. No Arc consumption.

### Scope (subject to spec)

- **Expose** `snapshot.run_*` in `arc-context.ts` under a new field (e.g. `run_observed_fitness`). Confidence-weighted by sample count.
- **Decide** how the engine reconciles observed pace with manual baseline. Three candidate patterns (the spec recommends one and argues why):
  - **Replace** — observed wins when confidence high enough.
  - **Blend** — weighted average baseline × `(1 - w)` + observed × `w`, where `w` is confidence-scaled.
  - **Threshold-triggered** — observed only displaces baseline when divergence > N% sustained over M weeks.
- **Anti-volatility guardrail**: spec must specify the trailing-window length, minimum sample count, and divergence threshold. A single workout PR or a single bad day cannot swing the plan's prescribed pace.

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

### Open questions for the Phase 1 spec

1. **Replace vs. blend vs. threshold** — three candidate patterns. Spec recommends and argues.
2. **Window length.** 4 weeks? 6? 8? The 70.3 / IM build phase is 4-6 weeks; window needs to match the granularity of within-phase ramps without lagging behind real-time adaptation.
3. **Confidence threshold for engagement.** `learned_fitness.confidence_band` exists today (`high/medium/low`); spec defines when the engine actually uses observed pace vs. defaults to baseline.
4. **Display vs. plan-adaptive.** Some signals are better left in Arc + display (athlete sees their trend on State page) without feeding the planner. Spec articulates which run signals are display-only and which feed targets.
5. **Reverse direction.** Does the engine respond when observed pace WORSENS? Or only when it improves? Asymmetric ratchet trade-offs.

### Decision: D-033 (proposed)

**Status:** unscheduled. Gated on Phase 0 ship.

---

## Phase 2 — Strength progression loop

**Goal:** Let `generate-combined-plan` read `exercise_log` 1RM trends so strength load progression reflects actual lifting performance.

### Audit summary

- `compute-facts` writes `exercise_log` (per-exercise: canonical_name, estimated_1rm, avg_rir, sets_count).
- `adapt-plan/index.ts:231-308` reads `exercise_log` and generates progression suggestions stored in `plan_adjustments`. Suggestions are user-gated; they do NOT auto-apply to the next plan generation.
- `generate-combined-plan` strength session generation uses fixed protocol + phase rules (e.g. 2.5%/week linear progression default). Does NOT read `exercise_log` or `plan_adjustments`.

### Scope (subject to spec)

- **Read** `exercise_log` 1RM trends in the strength session generator. Replace or augment the fixed protocol-rule progression with observed 1RM-driven progression.
- **Reconcile** with the existing `adapt-plan` suggestion layer. Three candidate architectures (the spec recommends one):
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

### Open questions for the Phase 2 spec

1. **Architecture: generator-only, adapt-plan-canonical, or layered.** Spec recommends.
2. **Compound vs. accessory split.** Already in `adapt-plan`; reaffirm or revise.
3. **Trailing window** for 1RM trend. Adapt-plan uses 4 weeks; reconcile or specify per-phase.
4. **Phase context.** Deload weeks excluded? Rebuild weeks treated specially? The existing strength protocol has phase multipliers; ensure the observed-1RM logic respects them.
5. **Conservative direction.** Strength load increases must be conservative; load decreases (e.g. observed regression) can be more aggressive. Asymmetric ratchet spec.
6. **Existing `plan_adjustments` overrides.** Spec confirms whether they layer on top of observed-driven progression or replace it.

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

### Scope (subject to spec)

The spec must argue **both sides** before recommending:

- **For closure:** plan power targets adjust based on observed cycling fitness. An athlete trending up in CTL gets harder workouts on the next regenerate.
- **Against closure (display-only):** cycling fitness drives the coach's readiness display ("you're fresh — good day for VO2") but plan generation uses fixed power-percentage targets (FTP × phase multiplier). Athlete-controlled.

Either outcome is acceptable. The deliverable is a documented architectural decision, not necessarily code.

If closure is chosen:
- Add reconciliation helper for cycling power targets (mirror the run-pace helper from Phase 1).
- Anti-volatility: TSB swings can be large day-to-day. Use a trailing form band, not single-week TSB.
- Per-discipline-distinction: VO2 reps shouldn't increase because CTL ramped; that's the rep-formula's job (D-028). Power targets within reps could shift.

### Files

- `generate-combined-plan/science.ts` / `session-factory.ts` — cycling power-target helpers (e.g. `bikeOpeners`, `sweetSpotBike`, `thresholdBike`, `vo2Bike`). Locate where FTP × percentage is computed.
- `_shared/arc-context.ts` — already exposes `cycling_fitness`. No change anticipated.
- New: `cycling-fitness-feedback.test.ts` if closure path is taken.

### Risks

- **TSB volatility.** TSB swings ±20 day-to-day. Direct TSB-to-power-target wiring is reflexive volatility. Mitigation: trailing form band as the signal, not raw TSB.
- **CTL doesn't equal FTP.** CTL is training stress balance, not threshold power. Plan targets ride off FTP; CTL is an orthogonal signal. The spec must NOT conflate them.
- **Phase context.** Build phase: ramping CTL is the design intent. Race-specific: peak CTL with fresh TSB. Each phase has different reconciliation rules. Mitigation: phase-keyed reconciliation.
- **Conservative default.** Recommend display-only by default unless there's strong coaching evidence for closure. CTL/ATL/TSB are well-suited to readiness display; their role in target adjustment is less clear-cut than run pace or strength 1RM.

### Open questions for the Phase 3 spec

1. **Closure or display-only?** This is the decision the spec must reach. Both arguments deserve serious treatment.
2. **What target adjusts?** If closure: power target (FTP %), interval duration, rep count, or all three?
3. **TSB vs. CTL vs. form band as the signal.** Form band (fresh/neutral/fatigued) is the most stable; raw TSB is noisy; CTL is slow-moving. Spec picks one.
4. **Phase-keyed rules.** Build vs. race-specific have different fitness contexts.
5. **Athlete-control trade-off.** Cycling athletes often have their own opinions about FTP. Auto-adjusting power targets without their input may erode trust. Spec considers the UX impact.

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

### Scope (subject to spec)

- **Build** `swim_facts` aggregation in `compute-facts` or `compute-snapshot` (decision in spec).
- **Aggregate** per-week swim metrics: pace per 100yd (per session-type), SWOLF when available, adherence-to-prescribed-yardage, drill-block-completed-as-prescribed.
- **Expose** in Arc under `swim_observed_fitness` (or similar; spec names).
- **Decide** which metrics drive plan adaptation:
  - **Likely drives:** observed CSS pace from threshold sessions (analog of run's threshold pace feedback).
  - **Likely display-only:** SWOLF (technique signal, not load), adherence (no clean adaptation signal — under-adherence could be many causes).
  - **Open:** drill completion (could drive technique-emphasis rotation).

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

### Open questions for the Phase 4 spec

1. **Where does aggregation live — `compute-facts` or `compute-snapshot`?** Run/bike split this between facts (per-workout) and snapshot (per-week); swim should mirror.
2. **Which metrics drive plan adaptation vs. stay display?** Pace yes; SWOLF probably no; adherence probably no; drill completion open question.
3. **Pool vs. open-water distinction.** Aggregation must handle both; OW pace is environmental (current, chop), not pure fitness signal.
4. **Sensor-data degradation.** Aggregation behavior when SWOLF/per-length data is absent (which is the common case).
5. **Threshold session frequency.** Run has weekly threshold work; swim has weekly CSS work. Both should give enough sample size for a 4-week trailing window. Confirm or adjust the window.

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
