# SPEC — Per-Discipline Periodization

**Status:** Spec / investigation only — NOT built, no code. This document locks the architecture before any implementation so the next session does not fuse the two primitives, route intent through the spine, or attempt the budget-reconciliation math before the primitive itself exists.

**Origin:** Investigation 2026-06-24 (code-traced across `generate-combined-plan/`, `_shared/state-trend/`, `_shared/arc-context.ts`, `compute-snapshot/`, the narrative-core adapters, and the optimizer). The investigation asked whether per-discipline periodization is the *right base primitive* — not just what it touches. It is, with one condition: it must be split into two primitives, not one.

**Read first:** `docs/ENGINE-STATE.md` (Athlete-State Spine, STATE v2 trend model, continuity invariant), `docs/adr/0002-phaseblock-one-week-rows.md` (the one-week-row trap this spec respects), `docs/SPEC-athlete-state-spine.md` (the descriptive-spine contract this spec must not violate).

---

## 0. The problem this primitive solves

Today the plan carries **one global `phase` per week** shared by all disciplines (`generate-combined-plan/types.ts:457-480` — `PhaseBlock` has a single `phase: Phase` plus a `sportDistribution` volume split; the `Phase` type itself is `types.ts:13`). Consequences traced:

- The system cannot express "bike is building while run is maintaining" — there is no state for it. "Both disciplines in build" is structurally always true and implicit.
- Adaptation-style (polarized/pyramidal/threshold) is already phase-keyed (`PHASE_ZONE_DIST`, `science.ts:774-783`) but globally — you cannot give bike a polarized distribution and run a threshold one.
- Interference-cost-as-data has nothing to key on: a per-pair coefficient is only consultable when you can express "these two disciplines are concurrently building." Global phase cannot represent that.

Per-discipline phase is the missing substrate. But the naive framing ("per-discipline phase/intent") bundles two axes the codebase treats separately, and conflating them is how we would build a primitive the next feature has to route around. Hence the two-primitive split below.

---

## 1. DECISION 1 — Two primitives, never fused

There are **two** primitives here, and they are independent axes. Do not model them as one object with a per-discipline `{phase, intent}` field.

### Primitive A — Per-discipline phase (THIS spec's foundational primitive)

A base / build / race-specific posture **per discipline**. This is the foundational substrate:

- **Adaptation-style keys off it** — distribution is already a function of phase (`PHASE_ZONE_DIST` keyed by `Phase` only, `science.ts:774`). Per-discipline phase makes "bike polarized / run threshold" fall out as "let each discipline's phase pick its distribution row." Same axis, clean add.
- **Interference-cost-as-data keys off it** — the coefficient is only meaningful when two disciplines are concurrently in a loading phase. Per-discipline phase is the precondition that makes the prose→data promotion useful.

### Primitive B — Intent / aggressiveness (a SEPARATE axis — named here, owned elsewhere)

Ramp rate / how-hard-you-climb is **orthogonal to phase**. It is already partially built and scattered:

- `training_intent` (`performance` / `completion` / `first_race` / `comeback`) drives the loading pattern (`loadingPatternForIntent` → 3:1 / 2:1 / 1:1, `phase-structure.ts:608-617`), base-phase rep caps, and build-phase VO2 gating (D-061, `training-intent-differentiation.test.ts`).
- `tri_approach` (`base_first` / `race_peak`, `types.ts:191-197`) shifts the race-specific ratio and quality type — the closest existing "aggressive vs conservative block shape" dial.
- Ramp ceilings live separately again (`validate-training-floors.ts` WoW caps keyed by distance, `science.ts` CTL ramp thresholds).

**The rule:** do NOT add a parallel `build` / `maintain` enum as a face of the phase primitive. "Build/maintain does not imply a ramp rate" — ramp rate is intent + distance, fully phase-independent. A second build/maintain intent axis would compete with `training_intent` / `tri_approach` and force every future feature to reconcile two intent models.

**Scope note for Primitive B in THIS spec:** Primitive B is named here only to fence it off. Its consolidation — unifying `training_intent` + `tri_approach` + ramp ceilings + loading patterns into one coherent intent/aggressiveness dial — is its own workstream and its own spec. This document defines Primitive A and explicitly declines to absorb intent into it.

> The "maintain claims a floor, build claims load" mechanic referenced below (§5) is a *load-distribution* behaviour driven by per-discipline **phase**, not a build/maintain intent enum. A discipline in a maintenance-shaped phase takes its floor; a discipline in a building phase claims budget. The word "intent" in the distribution code must not become a new enum.

---

## 2. DECISION 2 — Plan-contract home, denormalized forward

Per-discipline phase is **prescriptive** state (it is decided by the plan, not observed from data). Its source of truth lives in the **plan contract**, where the parallel already exists:

- `PlanContractWeekIntent.disciplines?: string[]` (`generate-run-plan/types.ts:188-205`) — already a per-discipline annotation on the per-week intent.
- The per-discipline `strength.intent` block (`generate-run-plan/types.ts:211-217`).
- `swim_intent` (`focus` / `race`) carried on the contract / goal `training_prefs`.

The data path is **exactly the path `swim_intent → SWIM_POSTURE` already takes** — generalize it, do not invent a new one:

```
PLAN CONTRACT (source of truth: per-discipline phase per week)
      │  denormalize forward (read-cache, never re-derived authoritatively)
      ├──► athlete_snapshot  (per-week mirror, like plan_phase already is — §4)
      ├──► Arc context       (new top-level field beside longitudinal_signals — §4)
      └──► narrators         (spoken as posture — §3 / §6)
```

Reference implementation to copy: `swimPostureFactLine` / `deriveTriSwimIntentForCoach` (`coach/index.ts:323-339`, `:547-550`, injected at `:4399`). That is already a per-discipline, prescriptive, block-persistent posture, sourced from the contract, surfaced as a grounded coach fact line. Per-discipline phase is the generalization of that one-off to all four disciplines.

---

## 3. DECISION 3 — Taper / recovery scope boundary (part of the definition, not a caveat)

Per-discipline phase is coherent **only** for `base` / `build` / `race_specific`. `taper`, `recovery`, and `rebuild` are **race-anchored, whole-athlete** concepts:

- Taper is defined per race (`taperWeeks(distance, priority)`, `phase-structure.ts:191`) and read cross-sport (`week-builder.ts:924`, `:1483`, `:1752`). You cannot taper the bike but keep the run in build *for the same race* — the race date is shared across all of the athlete's disciplines.
- Recovery (`insertRecoveryBlock`, `phase-structure.ts:185`; `isRecovery` block boolean) and rebuild (`insertRebuildBlock`, `:212`) are likewise race/athlete-anchored.

**The primitive's definition therefore includes its own collapse rule:** when the macrocycle reaches taper / recovery / rebuild, per-discipline phase **collapses back to a single global phase**. This is a structural property of the primitive, specced here, not a downstream special case. Implementations must treat "all disciplines share the taper/recovery phase" as invariant, and the per-discipline representation must degrade cleanly to the global one (e.g. all disciplines read the same value) rather than carrying independent taper states.

---

## 4. DECISION 4 — The spine (and snapshot, and Arc) stay descriptive

Per-discipline intent/phase is **prescriptive**. The continuity systems are **descriptive, point-in-time, observed-data**. The primitive sits **adjacent** to them, never inside their descriptive structures.

### 4.1 Spine — adjacent to `state_trends_v1`, never inside `DisciplineTrendCache`

The spine's invariant is **structural equality**: client and server produce identical output from identical observed rows (`_shared/state-trend/assemble.ts:1-8`; inputs are observed rows + counts only, `StateTrendInputs` `:72-81`; `DisciplineTrendCache = {verdict, pctChange, provisional}`, `:172`; pure projection `toStateTrendsV1` `:209-234`).

Per-discipline phase is not row-derived. Putting it inside `DisciplineTrendCache`:

1. **Breaks the single-source invariant** — intent would have to be fetched separately, so client == server no longer holds for that field.
2. **Destroys the valuable signal** — the whole point is the *pairing*: "intent says **building**, spine verdict says **holding**." That disagreement is the coaching signal. Collapse them into one struct and the pairing is gone.

**Rule:** per-discipline phase rides **beside** `state_trends_v1` (a sibling field on the snapshot / Arc), so a consumer can read prescriptive-intent and descriptive-verdict together and compare them. The spine stays purely descriptive.

### 4.2 Snapshot — denormalized per-week mirror only (ADR-0002)

`athlete_snapshot` is one row per week, keyed `user_id` + `week_start`. Phase is already mirrored per-week-row (`plan_phase`, `compute-snapshot/index.ts:703`; `plan_week_number` `:702`) — that precedent is fine.

But per-discipline phase is a **block** property ("building for 6 weeks"), and ADR-0002 (`docs/adr/0002-phaseblock-one-week-rows.md`) names the trap: a block property stamped on one-week rows loses its block identity (the doc warns `weekNum - block.startWeek + 1` always returns 1). Therefore:

- The snapshot may carry per-discipline phase **only as a denormalized per-week mirror** (a read-cache of "what was this discipline's phase during this week"), re-derived each week like `plan_phase`.
- The **authoritative block** (start/end of a discipline's build block) lives in the **plan contract**, not in `athlete_snapshot`. Do not make the snapshot the source of truth for block boundaries — its grain is the week, not the block.

### 4.3 Arc — new top-level field beside `longitudinal_signals`, not inside `active_plan`

`ArcContext.active_plan` is a single-phase / single-discipline scalar (`arc-context.ts:68-75`), and `arc_narrative_context` depends on that single resolved phase. Forcing a per-discipline map into `active_plan` breaks that contract.

Arc already carries exactly one multi-week, per-discipline-flavored structure: `longitudinal_signals` (`arc-context.ts:219`). Per-discipline phase attaches as a **new top-level `ArcContext` field beside it** — point-in-time Arc reads the denormalized current value; it does not extend `active_plan`.

---

## 5. Intent-aware load distribution (Primitive A behaviour, Phase 1)

Making the sport-distribution split phase-aware (a building discipline claims budget; a maintenance-phase discipline drops to a floor) is a **clean extension of an existing seam**, not a new budgeting model:

- The seam is `getBaseDistribution` (`science.ts:724-762`), which already layers additive, proportionally-funded, capped shifts: the swim-intent shift (`SWIM_FOCUS_SHIFTS`, `:715-722`, applied `:740-747`) and the limiter shift (`:749-759`, capped at 0.65 `:754`). A third per-discipline-phase shift slots into the identical pattern.
- The **one real gap**: `getBaseDistribution` is currently phase-blind — the distribution is computed once per goal and stamped on every block (`phase-structure.ts`), with phase affecting only the scalar `tssMultiplier`. Making it phase-aware means threading phase into the function and recomputing per block. Contained change, not architectural.
- The **maintain floor** has a latent home: `MAINTENANCE_FLOORS.pct` (`science.ts:765-770`) is already shaped like a per-sport budget-share floor but is **dead** — only `.sessions` is read (`validator.ts:121-145`). Reviving `.pct` as the maintain-floor value is natural; enforcing it as a *distribution clamp* (not just a session count) is the new code.
- It is **zero-sum inside a fitness-capped pie**: whatever a building discipline claims is automatically funded by maintenance disciplines dropping toward their floor — the same proportional-funding mechanic the limiter shift already uses. The whole-athlete caps remain binding regardless (total TSS ceiling `week-builder.ts:741`, ACWR/CTL ramp `:739-740`, the endurance-hours pool `:733-736`, the 0.65 shift cap, the session-count floors).

This behaviour belongs to **Phase 1** (it uses the existing single-budget split; it does not require independent per-sport budgets).

---

## 6. Narrators — generalize the `swim_intent` path (Phase 1)

The narrators are the cleanest fit and the primitive makes them **more coherent**:

- The four per-discipline narrative-core adapters (run/ride/swim/strength) are **intent-blind** — they consume a single-session fact packet and do not read phase at all, so they do not resist per-discipline posture.
- The **coach adapter** is the week/state-scoped narrator (`adapters/coach.ts`) and already pins fitness claims to the spine verdict (Rule-5 grounding). Per-discipline posture becomes a new field on its week context, spoken under the same grounding rules ("bike building, run holding" is a direction claim that must be grounded — `hasFitnessTrend` already gates this class).
- The coach's existing phase framing is global today: `current_phase` (one global value from volume ratios, `coach/index.ts:2421-2422`), `week_intent` (single per-week, `:614-629`), and the per-discipline exception `swimPostureFactLine` (`:547-550`). Generalizing `swimPostureFactLine` to all disciplines **replaces a one-off with a uniform primitive** — that is the target.

---

## 7. Build phasing

### Phase 1 — the primitive, clean

Build the primitive end-to-end on the existing single-budget machinery. No independent-budget math.

1. **Contract** — per-discipline phase per week in the plan contract (extend the `PlanContractWeekIntent.disciplines[]` / `swim_intent` lineage). With the §3 collapse-to-global rule at taper/recovery/rebuild baked in.
2. **Denormalize forward** — per-week mirror on `athlete_snapshot` (like `plan_phase`); a sibling field beside `state_trends_v1`; a new top-level Arc field beside `longitudinal_signals`. Read-cache only; contract is authoritative (§4).
3. **Content layer** — point the already-per-sport session factories / ramps at *this discipline's* phase instead of the global phase (mechanical; see §8).
4. **Intent-aware distribution shift** — slot the per-discipline-phase shift into `getBaseDistribution`'s additive-shift pattern + revive `MAINTENANCE_FLOORS.pct` as a distribution clamp (§5).
5. **Narrators** — generalize the `swim_intent → SWIM_POSTURE` path to all disciplines (§6).

### Phase 2 — independent per-sport budget reconciliation (the load-bearing wall)

The one genuine piece of new logic, isolated deliberately so Phase 1 ships clean.

Today the weekly TSS budget is a **single whole-week envelope** keyed on the one phase (`PHASE_TSS_RANGES` `science.ts:242-251` → `scaledWeeklyTSS(phase, …)` `:281` → consumed `week-builder.ts:736`), then split by `sportDistribution` (`:830-839`). When run is in `race_specific` (450–700) and bike in `base` (250–450) **simultaneously**, there is no single `PHASE_TSS_RANGES[phase]` to look up.

Phase 2 is: independent per-sport TSS budgets (each from its own discipline's phase) reconciling against **one athlete's shared CTL / ramp ceiling and hours pool**. The whole-athlete caps in §5 are exactly the reconciliation constraints. This also means generalizing the consumers that assume one budget/one ratio: the week-1 load clamp (`week-builder.ts:757`), the validator budget check (`validator.ts:73`), the persisted `weekly_tss_target` (`index.ts:606`), and `enforce8020`'s whole-week 80/20 ceiling (`week-builder.ts:397-437`, target `:399`) which must split per sport once distribution is per-discipline.

**Peer-reviewed grounding for the distribution rules:** `docs/SCIENCE-concurrent-training-interference.md` — the citable rationale for *why* the Phase-2 split is shaped this way. Load-bearing takeaways the budget logic must encode: cycling interferes far less than running (so "strength + bike build, run maintain" is the compatible shape, not a guess); interference scales with endurance volume/frequency (so it's a bounded *budget*, not a binary); `strength_intent` modulates the cardio cap (power focus bounds endurance tightest, hypertrophy/max-strength is permissive); spacing already satisfies the separation science (no new same-day logic). **The literature gives direction + guardrails, NOT a coefficient** — Phase 2 must not invent a precise bike-to-strength volume ratio; the athlete's own response / benchmark re-test calibrates the exact volume over the block.

Do not attempt Phase 2 until Phase 1 is shipped and verified.

---

## 8. Reusable as-is (no rework)

- **Content layer** — session-content factories (`intervalRun`, `vo2Run`, the bike sweet-spot/threshold builders, `triathlonStrength`, swim protocols) and the ramp math in `science.ts` (`longRunMilesForWeek`, `longRideHoursForWeek`, `rampWeeksForPhase`, etc.) already take `phase` as a parameter for a sport they already know. Generalization = pass this discipline's phase. The materialize token parser (`materialize-plan/index.ts:1312-1317`) already reads a per-discipline phase suffix off the token.
- **Calendar-layer interference solver** — `_shared/week-optimizer.ts` (`deriveOptimalWeek`, `sequentialOk`, `canPlaceWithModifier`, the CLEAN→SOFT→SANDWICH→DROP ladder) and the same-day matrix (`_shared/schedule-session-constraints.ts`). Per-discipline phase does not change calendar placement; the solver is untouched. (Interference-cost-as-data is a *future* add that keys off per-discipline phase — out of scope here.)

---

## 9. Do NOT touch — `strPct`

The strength key in the distribution tables (`strength: 0.06` in `TRI_SPORT_DIST` etc.) is **vestigial by design**, not by omission. The split code destructures only `runPct`/`bikePct`/`swimPct`; the `// strPct reserved` comment is at `week-builder.ts:834`.

Strength already claims real budget — **upstream, via the hours deduction**, not as a TSS share: the endurance budget is scaled on `endurance_hours = declared hours − strength_count × 0.75h` (`session-frequency-defaults.ts:285-292`), and strength session TSS counts at 50% (`STRENGTH_BUDGET_FRACTION = 0.5`, `science.ts:238`, applied in `estimateSessionTSS` `:271`).

Wiring `strPct` to give strength a TSS share would **fight the existing frequency/dose + hours-deduction model** (strength would be double-counted, or its two budgeting paths would conflict). Per-discipline phase / intent-aware load is **not** the trigger to revive `strPct`. Leave it dead.

---

## 10. Decision summary (the four locks)

| # | Decision | The rule | Failure mode if violated |
|---|----------|----------|--------------------------|
| 1 | Two primitives, never fused | Per-discipline **phase** is foundational; **intent/aggressiveness** is a separate axis — consolidate `training_intent`/`tri_approach`/ramp scatter, never add a parallel build/maintain enum | A second intent axis competing with `training_intent`; every future feature reconciles two intent models |
| 2 | Plan-contract home, denormalized forward | Source of truth in the contract → read-cache in snapshot/Arc → spoken by narrators (the `swim_intent → SWIM_POSTURE` path) | A new state path invented alongside the one that already works |
| 3 | Taper/recovery scope boundary | Per-discipline phase exists for base/build/race_specific only; collapses to global at taper/recovery/rebuild (race-anchored, whole-athlete) | Incoherent "taper bike but not run for the same race" states |
| 4 | Spine stays descriptive | Per-discipline phase rides **adjacent** to `state_trends_v1` (and as a per-week snapshot mirror, and beside Arc's `longitudinal_signals`) — never inside `DisciplineTrendCache` | Breaks the spine's structural-equality invariant; destroys the "intent says building, verdict says holding" pairing |

---

## 11. Open questions / sign-offs (prescription-touching — gated)

Per-discipline phase **changes prescription** (it drives session content and load distribution), so the following are sign-off-gated, consistent with the spine's Step-4 gate:

- **Who sets per-discipline phase?** Wizard-declared, engine-derived from limiter/intent, or both? (The wizard collects no per-discipline phase today.)
- **Maintain-floor values** — reviving `MAINTENANCE_FLOORS.pct` as distribution clamps sets real prescription floors; the numbers need sign-off (like the spine thresholds and the 500-floor).
- **Per-discipline ramp interaction with the shared CTL ceiling** (Phase 2) — how aggressively one building discipline may claim the shared ramp budget.
- **Default behaviour** — absent any per-discipline phase declaration, the system must produce today's exact global-phase plan (byte-parity target, like the Arc-channel Phase 0).

---

## 12. Cross-references

- `docs/adr/0002-phaseblock-one-week-rows.md` — the one-week-row trap (Decision 4.2).
- `docs/SPEC-athlete-state-spine.md` — the descriptive-spine contract (Decision 4.1).
- `docs/ENGINE-STATE.md` — Athlete-State Spine, STATE v2 trend model, continuity invariant.
- D-061 / `training-intent-differentiation.test.ts` — the existing `training_intent` axis (Primitive B, Decision 1).
- `coach/index.ts:323-339,547-550,4399` — `swim_intent → SWIM_POSTURE`, the reference path to generalize (Decision 2 / §6).
- `docs/SCIENCE-concurrent-training-interference.md` — peer-reviewed grounding for the Phase-2 load-distribution rules (Wilson 2012; Schumann/Petré 2023; Frontiers 2025; Hickson 1980). Direction + guardrails, not coefficients.
