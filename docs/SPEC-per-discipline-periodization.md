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

**Amendment locked 2026-06-26 (post non-race arc):** the terminal-collapse set now includes **`retest`** (D-213 Cut 4 — the non-race terminal). `taper` / `recovery` / `rebuild` are **race-anchored**; `retest` is **length-anchored** (`target_weeks`, no race date) — but all four are equally **whole-athlete terminals** (you develop-then-retest the *whole* block; there is no "retest the bike while the run keeps building"), so per-discipline phase collapses to global at `retest` on the same logic. The collapse rule below reads `{taper, recovery, rebuild, retest}`.

Per-discipline phase is coherent **only** for `base` / `build` / `race_specific`. `taper`, `recovery`, `rebuild`, and `retest` are **whole-athlete terminal** concepts:

- Taper is defined per race (`taperWeeks(distance, priority)`, `phase-structure.ts:191`) and read cross-sport (`week-builder.ts:924`, `:1483`, `:1752`). You cannot taper the bike but keep the run in build *for the same race* — the race date is shared across all of the athlete's disciplines.
- Recovery (`insertRecoveryBlock`, `phase-structure.ts:185`; `isRecovery` block boolean) and rebuild (`insertRebuildBlock`, `:212`) are likewise race/athlete-anchored.

**The primitive's definition therefore includes its own collapse rule:** when the macrocycle reaches taper / recovery / rebuild / **retest**, per-discipline phase **collapses back to a single global phase**. This is a structural property of the primitive, specced here, not a downstream special case. Implementations must treat "all disciplines share the taper/recovery phase" as invariant, and the per-discipline representation must degrade cleanly to the global one (e.g. all disciplines read the same value) rather than carrying independent taper states.

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

---

## 13. Builder requirements — what D-210 must support (captured 2026-06-26)

The non-race builder (D-213 surfacing, future) is the consumer that needs this primitive. Its requirements ARE D-210's requirements:

- **Goal-first, 4 disciplines, three states.** The builder is goal-first. Each of the 4 disciplines (swim / bike / run / strength) is set to **develop / maintain / out**, **seeded by the goal** — the user *confirms*, does not configure from scratch.
- **`develop/maintain/out` is the user-facing face of Primitive A, NOT a new intent enum (Decision 1).** Under the hood: **develop** = the discipline runs a building per-discipline phase sequence and *claims budget* (§5); **maintain** = the discipline holds a maintenance-shaped phase and *drops to its floor* (`MAINTENANCE_FLOORS.pct`, §5); **out** = the discipline is *excluded* from the plan (0 budget, no sessions). This is per-discipline **phase** posture + presence — it must **not** be modeled as a parallel build/maintain ramp-rate enum competing with `training_intent` (that is the Decision-1 failure mode). The three-state knob maps onto the foundational primitive, and "out" is the one genuinely new state beyond base/build/race_specific (a presence flag, not a phase).
- **The 6 goals → default per-discipline seeds:**

  | Goal | swim | bike | run | strength |
  |---|---|---|---|---|
  | Build endurance | the goal's endurance discipline **develops**; the *other* endurance disciplines **maintain** | | | **maintain** |
  | Build speed | same shape — one endurance **develops**, others **maintain** | | | **maintain** |
  | Get stronger | **out** | **maintain** | **maintain** | **develop** |
  | Build muscle + train | **out** | **out** | **maintain** | **develop** |
  | Maintain | **maintain** | **maintain** | **maintain** | **maintain** |
  | Starting over | a gentle **single develop** (one discipline), rest maintain/out | | | |

  (For "build endurance / speed," exactly one endurance discipline develops — the one the goal names — the rest maintain; strength maintains.)
- **Hard constraint — the two-build ceiling (interference science):** **at most 2 develop-disciplines at once.** None of the 6 default seeds exceed it (they develop 1 discipline each). This is the citable bound from `SCIENCE-concurrent-training-interference.md` (interference is a bounded budget; "strength + one cardio build" is the compatible shape) — it is a **config invariant**, not a soft preference. See the scout (where it's enforced).

- **Commitment tier — the volume envelope, as a tier not an hours input (captured 2026-06-26).** Alongside goal + per-discipline states, the builder asks **"how much can you commit?"** as a tier — **light / moderate / committed** — **defaulted to low (light)**. **Hours are an OUTPUT, not an input:** the user picks the qualitative tier; the engine derives the weekly-hours band and shows it back ("≈ N h/wk"), never asking the athlete to type hours. Engine mapping: the tier is a qualitative front-end for the **existing `weekly_hours_available` lever** (→ `scaledWeeklyTSS` hour-factor) — it is **not a new engine primitive**, and it is distinct from Primitive B ramp-rate intent (commitment bounds *volume*, intent bounds *how hard you climb*). Default-light keeps the conservative-by-default posture. The tier→hours-band numbers are sign-off-gated prescription (like the maintain floors, §11).

This table is the expressiveness contract: if the per-discipline primitive cannot represent every row above (incl. "out"), it is underbuilt. The commitment tier is the volume envelope that sits over it.

### 13.1 Strength protocol contract — posture → protocol → label (captured 2026-06-26)

The builder must speak the **same strength language the system already ships**, not a parallel story. Today three surfaces disagree: **PlanWizard (legacy run)** offers a *named-protocol* picker ("Durability" / "Neural Speed" / "Upper Aesthetics"); **ArcSetupWizard (tri)** offers *intent-role* labels ("Strength as a training priority" / "Durability-Focused", → `strength_intent` only); and a **marathoner in ArcSetupWizard sees no strength step at all**. The reconciliation rules:

- **"Durability" is the consistency anchor.** It is the one term shared across *both* wizards *and* the engine (the `durability` protocol; the `triathlon` protocol's own name is "…(Durability)"). **`maintain` → label "Durability"** everywhere.
- **Adopt PlanWizard's named-protocol vocabulary** ("Durability" / "Upper Aesthetics" / "Neural Speed") **+ "5×5"** — so a runner sees the *same words* in the legacy picker and the builder. **Do NOT invent "hypertrophy" / "upper-focus"** (that is a fourth vocabulary; `upper_aesthetics` already ships as **"Upper Aesthetics"** — use it). **Do NOT copy Arc's tri intent-role labels** (they carry no named choice).
- **`develop` is sport-context-aware** — the menu depends on whether the goal's *developing* disciplines are tri-shaped or run/general, mirroring `resolveStrengthProtocolForGoal`'s sport split (`selector.ts`). A tri-shaped goal's "develop strength" must resolve to the **tri developer**, not a run protocol.

**The contract table** (the label is constant; the underlying protocol is sport-context-aware):

| Posture | User-facing label | Resolves to — run / general context | Resolves to — tri-shaped context (swim+bike+run developing) |
|---|---|---|---|
| **maintain** | **"Durability"** | `durability` | `triathlon` (its name is "Triathlon Multi-Sport (Durability)") |
| **develop** | run/general → a **choice**: **"5×5"** (default) / **"Upper Aesthetics"** / **"Neural Speed"**; bodyweight/bands → **"Durability"** (the only option that progresses without load). tri-shaped → **"Triathlon Performance"** (auto) | `five_by_five` (default; `durability` if bodyweight/bands) / `upper_aesthetics` / `neural_speed` | `triathlon_performance` |
| **out** | — (discipline excluded) | excluded (0 budget, no sessions) | excluded |

- **Default developer = `five_by_five`** ("5×5") when `develop` and the user doesn't pick — **AMENDED 2026-06-27 (was `upper_aesthetics`).** The audit found `upper_aesthetics` is a **concurrent run-overlay SLOT** (1 upper + 1 lower at 2×/wk, designed to sit around endurance), **thin as a standalone strength block**, and its name **over-promises** (upper/aesthetics). `five_by_five` is the honest default: full-body, balanced, real periodization (70→85% by week-in-block), name matches what it does. **Upper Aesthetics (upper-focus/hypertrophy) and Neural Speed (power) stay explicit opt-ins** — not the default. **Equipment-aware:** 5×5's linear %1RM needs loadable resistance, so **bodyweight/bands athletes fall back to `durability`** (the only developer that progresses without load — via tempo/RIR/tiers). The two limitations this surfaced are logged: **Q-087** (the `strength-overlay.ts:620` run-overlay filter bug) + **Q-088** (the standalone-strength frequency gap — the system caps strength at 2–3×/wk, no 3–4-day block).
- **`minimum_dose` is NOT offered** — it is excluded from the runtime allow-list (`selector.ts`) until frontend support lands.
- **This contract is the builder's, not the race wizards'.** Harmonizing ArcSetupWizard's tri strength onto named protocols is a separate cleanup — see the OPEN-QUESTIONS harmonization entry; it is **not** in scope for the builder wiring (Cut A).

### 13.2 Length floor-by-goal — the minimum `target_weeks` (DG-1, captured 2026-06-27)

The length step offers `target_weeks` from a **per-goal floor** upward. The floor is **science-backed, not picked**: it is the **shortest block in which the goal's adaptation actually shows in a retest**. Show a shorter option and the retest lies — the block ends before the adaptation is measurable. The floor IS the bottom of the menu.

| Goal | Floor (wk) | Where the adaptation shows in a retest — the citation |
|---|---|---|
| **Build endurance** | **8** | Measurable aerobic adaptation (mitochondrial/capillary density, plasma volume, stroke volume) needs ~6–8 wk; the engine's base ramp is **6 wk** (`science.ts` `rampWeeksForPhase` base; `RUN-PROTOCOL.md`). 8 wk = the ramp + a retest that reflects it. |
| **Build speed** | **6** | Threshold/VO2 + neuromuscular adaptations show in ~6 wk (the neural component is faster than aerobic structural change); a coherent speed block layered on existing base. |
| **Get stronger (5×5)** | **8** | `SCIENCE-5x5-linear-progression.md §2–3`: ~1–3%/wk over 70→85% 1RM with a deload every 4–6 wk → 8 wk ≈ **2 deload cycles + a measurable 1RM gain**. Below the §4 ~16–20 wk linear ceiling; the floor is where it first shows. |
| **Build muscle + train** | **12** | Hypertrophy is **structural, slower than neural strength**: measurable muscle growth needs ~8–12 wk (Schoenfeld 2017, cited in `SCIENCE-5x5 §6`). 12 wk is the conservative floor where a hypertrophy retest is honest — deliberately longer than Get-stronger (neural gains show first, mass later). |
| **Maintain** | **4** | No develop-to-retest — maintenance holds fitness through a constrained period on minimal stimulus (1–2×/wk retains for weeks). 4 wk is the shortest coherent block worth materializing a plan for. |
| **Starting over** | **6** | Re-adaptation from detraining is **faster than from scratch** (muscle memory / rapid early reacquisition), but a coherent return block is ~6 wk; gentler than a full develop. |

- **Keyed by the GOAL (the adaptation intent), not the edited posture.** The goal sets the adaptation *type* (aerobic / threshold / strength / hypertrophy); editing *which* disciplines develop (the posture step) doesn't change the timeline of the adaptation, so `floorForGoal(goal)` is the lookup. (Edge: a `Maintain` goal edited to develop a discipline keeps the 4 wk floor — the floor is a minimum, not a maximum; the user can still pick longer.)
- **Range:** every floor sits inside the `target_weeks` **4–52** band (the migration CHECK). The slider runs from the goal's floor to 52; the default lands at `max(floor, 12)`.
- **Sign-off-gated prescription** (like the maintain floors §11, the commitment tier §13). These are defensible adaptation-timeline floors a coach may tune — but they must stay **science-anchored**: the shortest length shown is a claim that the retest will be honest at that length.

---

## 14. Design language — the builder UI skin (out of D-210 ENGINE scope; captured 2026-06-26)

Noted so the eventual non-race builder UI inherits today's design language rather than a generic scheme. **This is UI skin, not engine architecture — D-210 builds none of it; it is here so the builder wears the right skin when it's built.**

- **Discipline colors:** swim = **blue** (`#4A9EFF`), bike = **green** (`#50C878`), run = **amber/yellow** (`#FFD700`), strength = **orange** (`#FF8C42`). **(DG-2 resolved 2026-06-27:** aligned to the live `SPORT_COLORS` token in `src/lib/context-utils.ts:27` — strength is **orange** in code, not neutral; the token is the source of truth, the doc was wrong. `getDisciplineColor(d)` is the accessor.)
- **Compact session codes:** `SW`, `BK-THR` (bike threshold), `RN-INT-SP` (run interval/speed), `SM-DRL` (swim drill), `BK-BRK` (bike brick), `RN-LR` (run long run).
- **Discipline glyphs:** waves (swim), bike (bike), pulse (run), dumbbell (strength).
- **Dark-mode native.**
- The non-race builder must **wear this skin** (these colors / codes / glyphs / dark-mode), not a generic scheme. Cross-ref `DESIGN_GUIDELINES.md`.
