# SPEC — One Engine, Two Output Shapes (plan generation)

**Status:** STANDARD / governing principle — not a feature spec. This is the constraint that governs **all Goals work** before any of it starts. Its whole purpose: prevent the next three-brains by making **"extend the one engine, never widen the forks"** a written rule. **Pending a D-NNN** (see §7).

**Why this exists now:** "plan your season" (race-targeted) and "plan your goals" (non-race / develop-and-retest) are arriving as if they were two systems. They are not. They are two **output shapes** of one engine reading the same sources of truth. The path of least resistance — fork a copy for the goal path — is exactly what produced the three-brains fitness situation (D-212) and the legacy-generator forks. This doc is the guardrail against repeating it.

**Read first:** D-185/D-186 (the numbers-continuity invariant this extends), D-212 (`SPEC-fitness-verdict-reconciliation.md` — the three fitness brains), D-210 (`SPEC-per-discipline-periodization.md`).

---

## 1. The principle

Plan generation is **one engine**. Season and goals are **two output shapes** of it — they differ in **terminal shape only**: a race-season plan tapers **to a date**; a goal/focus-block plan **develops and retests** (no race date). Everything before the terminal shape is shared.

This **extends D-185/D-186 up one level.** D-185/D-186 won *numbers*-continuity ("compute each value once, read everywhere"). This is *engine*-continuity ("generate plans through one engine; season and goals are shapes, not systems"). Same discipline, one layer higher.

The silo risk is anywhere a Goals feature is tempted to **fork its own copy** of something the engine already shares — its own plan logic, its own periodization, its own projection, its own fitness read.

---

## 2. The one-line map

```
create-goal-and-materialize-plan   (router)
        │
        ▼
generate-combined-plan             (THE one engine)
        │
        ▼
phase-structure.ts                 (ONE timeline; season vs goal = two TERMINAL shapes)
        │
        ▼
science.ts / week-builder / session-factory   (race-date-FREE content)
```

- **Fitness** is read from the **D-212 adjacent siblings** (the spine `state_trends_v1` + the projection-brain reads), never a new fitness read.
- **Finish** is read from **`goals.projection.total_sec`** (the single writer's output), never a new estimate.

Everything outside this line is a fork (see §5/§6). The discipline for Goals work: **extend the line, never widen the forks.**

---

## 3. The clean seam (the boundary the two shapes share)

There is a real seam in the engine, and it is the foundation that makes "two shapes, one engine" achievable:

> **`phase-structure.ts` (race-date-BOUND) ↔ `science.ts` / content (race-date-FREE).**

- **Above the seam** (`phase-structure.ts`): the `event_date` sets `totalWeeks` and every phase boundary. This is the race-targeted layer.
- **Below the seam** (`science.ts`, `week-builder.ts`, `session-factory.ts`): the engine is keyed on **`(distance, phase, weekInPhase)`** — **no race date reaches the volume ramp or session content.** `longRunMilesForWeek`, `longRideHoursForWeek`, `scaledWeeklyTSS`, the swim/bike/run ramps — none take a date.

**This is the boundary the two shapes share.** Both season and goal plans run the *same* content engine below the seam. The difference lives almost entirely **above** the seam (how the timeline + terminal phase are built). Protect this seam: a non-race shape must reuse everything below it.

---

## 4. The two real caveats (the genuine builds — not forks)

Non-race is **more than "drop the taper."** Two things make it a real build, and both are **extensions of the shared engine**, not parallel copies:

**(a) The timeline itself is event-date-anchored.** `event_date` sets `totalWeeks` AND every phase boundary in `phase-structure.ts` (`:127-128`), not just the final taper. So a focus block needs a **phase-structure variant** that synthesizes a timeline + phases **without an event-date anchor** and ends in a **non-taper terminal** (e.g. develop → retest). This is a new *output shape inside phase-structure*, not a new phase engine.

**(b) `science.ts` has no race-agnostic volume anchor.** Below the seam, volume is driven by `distance` (the race-distance proxy). A non-race goal has no `distance`, so it needs a **distance-equivalent capacity target** to feed the existing content engine (e.g. a target weekly load / capacity metric the ramps can key on). This is a new *input to the shared content engine*, not a new content engine.

These two are the legitimate work. Everything else is reuse.

---

## 5. The five guard-rails (silos to prevent — verbatim)

1. **Never extend the legacy generators for non-race goals.** Route through `generate-combined-plan`. The non-race build is the occasion to **retire** `generate-run-plan` / `generate-triathlon-plan`, not to feed them.
2. **Develop-retest is a phase-structure VARIANT, not a parallel macrocycle engine.** Do **not** resurrect `generate-macro` (the dead blueprint engine). The new terminal shape lives in `phase-structure.ts`.
3. **Read `goals.projection`, never add a 5th finish estimate.** Don't add another estimator, and don't read `goals.race_readiness_projection` (the coach's separate column) when you mean the canonical `goals.projection.total_sec`.
4. **Read the D-212 fitness siblings, never spawn a 4th fitness read.** Use the spine + projection-brain as the adjacent siblings (D-212); do not add another independent read of `user_baselines`/`athlete_snapshot` for fitness.
5. **D-210 per-discipline phase extends phase-structure's ONE timeline** (collapsing to global at taper), never forks its own phase engine. A goal feature must not treat per-discipline phase — or the non-race shape — as license to fork periodization.

---

## 6. The legacy-fork note (the standing exception to "one engine")

`generate-run-plan` and `generate-triathlon-plan` — each with its **own `determinePhaseStructure`** and its own content pipeline — are the **existing race-season forks** of the engine. They are live today (selected by `combine === false` in `create-goal-and-materialize-plan`); `generate-plan` is dead.

Until they are retired, they are the **standing exception** to "one engine" — acknowledge them honestly rather than pretend the engine is already singular. **Non-race-goal work is the occasion to retire them** (route their cases through `generate-combined-plan`), collapsing the engine toward genuinely one. Do not add new behavior to them.

---

## 7. Status / D-log pointer

- **STANDARD, pending a D-NNN.** When confirmed, this earns a DECISIONS-LOG entry — the load-bearing decision a future session would violate by reaching for the path of least resistance is: **"plan-gen is one engine; season and goals are two output shapes; extend the one engine + retire the legacy forks, never widen them."** (Next available is D-213; not written until confirmed.)
- **Scope:** a governing constraint on *how* plan/Goals features are built — it does not itself build anything. It does not touch prescription beyond requiring that new prescription flow through the shared engine.

---

## 8. Cross-references

- **D-185/D-186** — the numbers-continuity invariant (single scalar resolvers); this doc is the engine-level analogue.
- **D-212** / `SPEC-fitness-verdict-reconciliation.md` — the three fitness brains; guard-rails 3 + 4 enforce reading its siblings, not forking a new read.
- **D-210** / `SPEC-per-discipline-periodization.md` — per-discipline phase extends the one timeline (guard-rail 5).
- Engine anchors: `create-goal-and-materialize-plan/index.ts` (router), `generate-combined-plan/` (the engine), `generate-combined-plan/phase-structure.ts` (the timeline / the seam), `generate-combined-plan/science.ts` (race-date-free content), `_shared/recompute-goal-race-projections.ts` (the single projection writer → `goals.projection`).
- Legacy forks (the standing exception): `generate-run-plan/`, `generate-triathlon-plan/` (each with its own `determinePhaseStructure`); `generate-plan/` (dead).
