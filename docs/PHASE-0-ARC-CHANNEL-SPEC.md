# Phase 0 — Arc Channel: Architectural Foundation Spec

**Status:** spec for review. Implementation gated on user approval.

**Companion:** `docs/FEEDBACK-LOOP-WORKORDER.md` (Phase 0 section).

**Decision:** D-032 (proposed).

---

## 1. Goal restatement

Thread `getArcContext()` output into `generate-combined-plan` so the engine can consume dynamic Arc fields per phase (1-4 follow). **This phase wires the channel and changes NO plan behavior.** Every consumer continues to read existing baselines until its own phase ships.

**The contract:** byte-identical plan output on every existing fixture, verified by deterministic hashing. The test gate is the entire definition of "behavior-neutral."

---

## 2. Investigation findings (current state, file:line)

### 2.1 Current request shape

`supabase/functions/generate-combined-plan/types.ts:310` defines `CombinedPlanRequest`:

```ts
export interface CombinedPlanRequest {
  user_id: string;
  goals: GoalInput[];
  athlete_state: AthleteState;
  athlete_memory?: AthleteMemory;
  start_date?: string;
  generation_trade_offs?: PlanGenerationTradeOff[];
  preview?: boolean;
}
```

The engine destructures these at `generate-combined-plan/index.ts:62-63`. No Arc field today.

### 2.2 Arc data already flows through `athlete_state` (partially)

The wrapper (`create-goal-and-materialize-plan/index.ts:1201`) already calls:
```ts
const arcForCombined = await getArcContext(supabase, user_id, focusForCombined);
```
And at lines 1568-1612 builds the `athlete_state` payload from Arc-derived values:
- `learned_fitness` (line 1593-1595) — already passed.
- `performance_numbers` (line 1585-1587) — already passed.
- `equipment` (line 1580) — already used to derive `equipment_tier`.
- `swim_threshold_pace` (line 1601-1611) — already derived from Arc swim inputs.
- `swim_volume_multiplier`, `swim_cutoff_pressure_v1`, `swim_equipment` — already derived.

**The gap:** Arc's DYNAMIC fields (the ones that will feed Phases 1-4) are NOT in `athlete_state`:
- `latest_snapshot` (the weekly aggregate — Phase 1 needs `snapshot.run_*` here)
- `cycling_fitness` (Phase 3 needs the form band)
- `swim_training_from_workouts` (Phase 4 partial signal)
- `longitudinal_signals` (multi-week pattern detectors; cross-cutting)
- `recent_completed_events` (post-race recovery — already used by `findPostRaceRecoveryContext` at wrapper:2151 but NOT in athlete_state)
- `arc_narrative_context` (deterministic narrative mode)
- `five_k_nudge` (already a signal; unused by engine today)

These are what Phase 0 channels.

### 2.3 `ArcContext` shape

`_shared/arc-context.ts:151-220` defines a 20-field interface. About half are baselines (already in `athlete_state`); the other half are dynamic observed state. Phase 0 channels the dynamic half as a curated subset, NOT the full ArcContext.

---

## 3. Resolved open questions

### Q1: Where does the engine receive Arc?

**Decision: request body.** A new optional `arc?: ArcChannelPayload` field on `CombinedPlanRequest`.

**Reasoning:**
- The wrapper already fetches Arc at `create-goal-and-materialize-plan:1201, 2061`. Refetching inside `generate-combined-plan` would (a) double the Arc query cost, (b) couple the engine to the Arc query path (and Supabase service-role auth), (c) violate the existing "engine is a pure function of its inputs" pattern that supports the preview-mode contract + the existing test fixtures.
- Request-body passing is consistent with how `learned_fitness`, `performance_numbers`, etc. already flow through `athlete_state`.
- Legacy callers (tests, telemetry, eval scripts) pass `arc: undefined` and get exactly today's behavior.

**Trade-off accepted:** the wrapper is now responsible for the Arc fetch. Other future callers of `generate-combined-plan` (none today) would need to fetch Arc themselves OR pass `undefined` and accept that they get baseline-only behavior. Documented in the engine's request-shape docstring.

### Q2: Full vs. curated `ArcContext`?

**Decision: curated subset.** A new type `ArcChannelPayload` exposing exactly the dynamic fields the planner will consume across Phases 1-4.

**The curated shape (locked at Phase 0):**

```ts
export interface ArcChannelPayload {
  /** Phase 1 (run pace), Phase 3 (cycling fitness), Phase 4 (swim) all read from snapshot. */
  latest_snapshot: AthleteSnapshot | null;

  /** Phase 3 — cycling form band derived from snapshot CTL/ATL/TSB. */
  cycling_fitness: { ctl: number; atl: number; tsb: number; form: 'fresh' | 'neutral' | 'fatigued' } | null;

  /** Phase 4 — swim session counts; full swim aggregation pending Phase 4 build. */
  swim_training_from_workouts: SwimTrainingFromWorkouts | null;

  /** Cross-cutting — multi-week pattern detectors, available to any phase that needs them. */
  longitudinal_signals: LongitudinalSignals | null;

  /** Already used by `findPostRaceRecoveryContext` in the wrapper; channeled so the engine can
   *  also consult it directly post-Phase-0. */
  recent_completed_events: CompletedEvent[];

  /** Deterministic narrative mode (post-race vs. pre-race vs. mid-season). Future phases may
   *  consult; channeled now to avoid re-extending the type per phase. */
  arc_narrative_context: ArcNarrativeContextV1 | null;

  /** 5K nudge signal — already computed in Arc; currently unused by engine. Channeled for
   *  future use without further schema work. */
  five_k_nudge: ArcFiveKLearnedDivergence | null;
}
```

**What is NOT channeled (and why):**

- `athlete_identity`, `disciplines`, `training_background`, `units`, `gear` — static / slow-moving baseline data; already in `athlete_state` or `goals.training_prefs` where the engine reads it.
- `learned_fitness`, `performance_numbers`, `equipment`, `effort_paces`, `dismissed_suggestions` — already in `athlete_state` per wrapper:1585-1612.
- `active_goals`, `active_plan` — engine already receives goals in the request body; active plan is a wrapper-level concern.
- `athlete_memory` — already passed as a top-level request field.
- `run_pace_for_coach`, `arc_narrative_context` (string formatters) — coach-display helpers; not engine consumers. (Exception: `arc_narrative_context` ABOVE — the narrative-mode classification is useful to engine, the prose formatters are not. Spec channels the structured field, not the prose.)
- `user_id`, `built_at` — already in request body or trivially derivable.

**Reasoning for curation over full pass-through:**
- Engine signature stays grokkable. A 20-field interface in the request body is fine; a 20-field engine-internal Arc dependency is harder to reason about.
- Phase consumers in Phases 1-4 destructure exactly what they need; the curated subset documents what the planner cares about.
- Adding fields later is a one-line type extension; subtracting fields from a full pass-through is a breaking change. The curated subset starts small and grows.

### Q3: Behavior-neutral test format

**Decision: deterministic JSON hash of `sessions_by_week` per fixture.**

**Mechanism:**

1. Each fixture (existing + new pin tests) runs the engine in **preview mode** (`preview: true`), capturing the `sessions_by_week` output.
2. The output is serialized with a stable JSON serializer (sorted keys at every level) and SHA-256 hashed.
3. Two assertions per fixture:
   - **`arc: undefined`** → produces hash `H₀`. This is the pre-Phase-0 baseline.
   - **`arc: <fully populated ArcChannelPayload>`** → produces hash `H₁`. **MUST equal `H₀`.**
4. Any divergence between `H₀` and `H₁` fails the test with a diff showing which session(s) changed.

**Why hashing:**
- Catches accidental consumption: if any engine code path reads `arc.cycling_fitness.form` even once during plan generation, plan output may differ between `arc: undefined` and `arc: populated`, and the hash differs.
- Tolerates legitimate refactor noise that doesn't change plan output (e.g. internal struct reorganization, comment changes, log-line additions).
- Cheap to maintain. Fixture diff makes the failure mode obvious.

**Fixture scope:** the existing e2e tests already exercise a meaningful range of athlete shapes:
- `bike-volume-ramp.test.ts` — 70.3 long-ride ramp.
- `run-volume-ramp.test.ts` — Plan #78 demographics; CTL 60, 11hr/wk intermediate.
- `swim-volume-ramp.test.ts` — focus + race swim intent.
- `d031-convergence-e2e.test.ts` — Olympic 13-wk close, advanced race_peak (rebuild loop reproducer).
- `swim-css-rest-lerp.test.ts` — 70.3 build phase.

Phase 0 adds a single new test file `arc-channel.test.ts` that runs each of these fixtures twice (`arc: undefined` vs. `arc: populated`) and asserts hash equality. **Existing tests stay unchanged** — Phase 0 doesn't touch them.

**Populated payload values:** the test builds a plausible non-empty `ArcChannelPayload` per fixture (using fixture-appropriate snapshot data, e.g. CTL=60 for Plan #78). The point is to verify the engine doesn't consume the data, not to test plausibility of the data itself.

**What this test cannot catch:**
- Non-determinism the test doesn't see (e.g. `Date.now()` in plan output). Existing tests have already weeded this out; Phase 0 doesn't introduce new non-determinism.
- Behavior changes from refactor that happen to ALSO be byte-identical (e.g. swap two equivalent branches). The hash gate only catches output divergence, not code-path equivalence. Acceptable.

### Q4: Default value (`arc?: undefined` vs. `arc = {}`)?

**Decision: `arc?: ArcChannelPayload` (optional, undefined when absent).**

**Reasoning:**
- The engine code that reads `arc` MUST be explicit about handling the undefined case. `arc?.cycling_fitness?.form` reads cleanly; consumers in Phases 1-4 fall back to baselines when undefined.
- Empty-object default would silently turn a "consumer accidentally reads a field" bug into a "consumer accidentally reads `undefined.form`" runtime error — easier to catch than a silent behavioral drift, but harder to test for than the current byte-identical hash.
- The hash test pins behavior-neutrality regardless of the default: `arc: undefined` and `arc: populated` both produce `H₀` post-Phase-0, by construction (no consumer reads).
- Convention matches the existing optional-field pattern in `CombinedPlanRequest` (e.g. `athlete_memory?: AthleteMemory`).

**Engine-side pattern (locked):** when a Phase 1+ consumer wants to read Arc, the pattern is:
```ts
const observedRunPace = arc?.latest_snapshot?.run_threshold_pace_sec_per_km;
if (observedRunPace == null) {
  // fall back to baseline (athlete_state.learned_fitness.run_threshold_pace_sec_per_km).
}
```
Never `arc.latest_snapshot.run_*` without the `?.` chain. Documented in the spec; lint-enforceable if needed.

---

## 4. Implementation surface

### 4.1 Files touched

- **`supabase/functions/generate-combined-plan/types.ts`**:
  - Add new `ArcChannelPayload` interface (curated per Q2 above).
  - Add `arc?: ArcChannelPayload` to `CombinedPlanRequest`.
  - Import the dependent types (`AthleteSnapshot`, `SwimTrainingFromWorkouts`, `LongitudinalSignals`, `CompletedEvent`, `ArcNarrativeContextV1`, `ArcFiveKLearnedDivergence`) from `_shared/arc-context.ts`. Confirm no circular import: `types.ts` already imports from `_shared`? Check during implementation; if circular, copy the type shapes locally with a comment pointing at the canonical source.

- **`supabase/functions/generate-combined-plan/index.ts`**:
  - Destructure `arc` from the request body at line ~63: `const { user_id, goals, athlete_state, athlete_memory, start_date, generation_trade_offs, arc } = body;`.
  - No engine logic reads `arc`. The destructuring exists solely to make the field reachable.
  - Pass `arc` into `buildWeek` calls via the existing `options` parameter (extended one field).

- **`supabase/functions/generate-combined-plan/week-builder.ts`**:
  - Extend the `options` parameter of `buildWeek` with `arc?: ArcChannelPayload`.
  - No consumer reads `arc` in Phase 0. The field threads through but is unused.
  - Future phases destructure `opts.arc` at the relevant call sites.

- **`supabase/functions/create-goal-and-materialize-plan/index.ts`**:
  - At the existing `invokeFunction('generate-combined-plan', { ... })` call site (line ~1563), add the `arc` field built from `arcForCombined`:
    ```ts
    arc: {
      latest_snapshot: arcForCombined.latest_snapshot,
      cycling_fitness: arcForCombined.cycling_fitness,
      swim_training_from_workouts: arcForCombined.swim_training_from_workouts,
      longitudinal_signals: arcForCombined.longitudinal_signals,
      recent_completed_events: arcForCombined.recent_completed_events,
      arc_narrative_context: arcForCombined.arc_narrative_context,
      five_k_nudge: arcForCombined.five_k_nudge,
    },
    ```
  - The wrapper already fetches Arc; this just channels the dynamic subset into the engine.

- **`supabase/functions/generate-combined-plan/arc-channel.test.ts`** (NEW):
  - Implements the byte-identical contract test (Q3).
  - Imports the fixtures from existing e2e tests (or builds equivalent ones inline). Runs each fixture twice; asserts hash equality.

### 4.2 Files NOT touched

- `_shared/arc-context.ts` — no changes. Phase 0 channels existing Arc fields; doesn't modify Arc itself.
- Any other engine file (`science.ts`, `validate-training-floors.ts`, `swim-program-templates.ts`, etc.) — no changes. Consumers are added per Phase 1-4.
- Existing test files — no changes. The new `arc-channel.test.ts` is purely additive.

---

## 5. Test gate (the entire definition of behavior-neutral)

Implementation passes the gate when:

1. **Full suite green.** `generate-combined-plan/` + `_shared/` + `materialize-plan/` + `src/lib/` test sweep matches the pre-Phase-0 count (last verified at 924/0). Specifically: no existing test changes its output.

2. **`arc-channel.test.ts` green.** At least one assertion per fixture in the list above (5 fixtures × 2 modes = 10 assertions minimum). All hashes match between `arc: undefined` and `arc: populated`.

3. **Schema-level back-compat.** A legacy caller (any test or eval script that today calls `invokeFunction('generate-combined-plan', { user_id, goals, athlete_state, ... })` without an `arc` field) produces the same output post-Phase-0 as pre-Phase-0. This is implied by (1) but called out explicitly.

4. **No new non-determinism.** The hash test would catch this, but the spec calls it out: no `Date.now()`, no `Math.random()`, no environment-dependent reads introduced.

If any assertion fails, the implementation is rejected — back to spec. No "we'll fix it in Phase 1" allowed.

---

## 6. Anti-regression invariants

These properties must hold across Phase 0 and every subsequent phase:

- **Engine signature backward-compat.** `arc` field stays optional. A future phase that REQUIRES Arc data must declare so explicitly (e.g. by failing fast when `arc == null`); the default never silently changes.
- **Curated subset stays curated.** Adding a field to `ArcChannelPayload` requires the field's purpose to be documented (which phase consumes it, what for). Don't accidentally bloat into "pass everything Arc has."
- **Hash test stays load-bearing.** Phase 1+ tests adding consumers MUST update the hash test to reflect that `arc: populated` and `arc: undefined` now produce different outputs FOR THE CONSUMED FIELD. The Phase 0 hash test is the contract; consumers are explicit additions to it.
- **No re-fetch inside the engine.** `generate-combined-plan` never calls `getArcContext()` directly. The wrapper fetches; engine consumes from request body. This protects the engine's pure-function-of-inputs property + the preview-mode contract.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Behavior change leaks in.** A consumer reads Arc accidentally; output diverges. | Hash test catches it at the test-gate level. Phase 0 ships only when all hashes match. |
| **Request payload schema break.** Legacy caller without `arc` field rejected by the engine. | `arc?` optional, undefined when absent. Existing callers pass `undefined` automatically; backward-compat verified by full suite green (any breaking schema change would break existing tests). |
| **Curated subset misses a future phase's needs.** | Adding fields is a one-line type extension. The subset is starter-curated; phases extend as needed. |
| **Wrapper / engine type drift.** `ArcChannelPayload` lives in engine types; wrapper builds it manually. If Arc adds a new field that Phase 1+ wants, both sides must be updated. | Drift caught by TypeScript compile errors when consumer adds a field to the type without wrapper supplying it. |
| **Circular import.** `generate-combined-plan/types.ts` ↔ `_shared/arc-context.ts`. | Investigate at implementation time. If circular, copy the type shape into engine types with comment pointing at the canonical source (standard pattern; see `weekInPhaseInline` in `validate-training-floors.ts` from D-027). |

---

## 8. Commit + ship sequence

Following the same pattern as D-028/D-029/D-030/D-031:

1. **This spec doc.** Commit `docs/PHASE-0-ARC-CHANNEL-SPEC.md`. (THIS COMMIT — pre-implementation.)
2. **User reviews.** Gate.
3. **Implementation commit.** Code + new test file. Single commit covering all four files.
4. **Deploy.** `generate-combined-plan` (engine) + `create-goal-and-materialize-plan` (wrapper). Both functions.
5. **Push.** main.
6. **Close-out commit.** D-032 entry in `DECISIONS-LOG.md` + ENGINE-STATE Solid entry + work order status update.

---

## 9. Approval gate

**Required from user before implementation:**

1. Confirm Q1 (request body, not engine refetch).
2. Confirm Q2 (curated subset; the 7 fields listed in section 3.Q2).
3. Confirm Q3 (deterministic JSON-hash test; fixture list in section 3.Q3).
4. Confirm Q4 (`arc?: ArcChannelPayload`, optional with undefined default).
5. Confirm or amend the curated subset's field list. The spec proposes 7 fields; user may add/remove.
6. Confirm the file-touch list in section 4.1.

Once approved, implementation proceeds per section 4.1; test gate per section 5; ship per section 8.

---

## 10. Open question for the user (final)

**Section 3.Q2 lists 7 fields in the curated subset.** I've justified each (or its exclusion). Two judgment calls worth confirming:

- **`recent_completed_events`** is currently used by the WRAPPER (`findPostRaceRecoveryContext` at create-goal:2151). It's not used by the engine today. Channeling it now means the engine *could* consult it post-Phase-0 (e.g. Phase 2 strength might want to know about a recent IM finish). Including it is forward-looking. Excluding it is YAGNI-strict. I've included; flag if you'd rather wait.
- **`arc_narrative_context`** + **`five_k_nudge`** are similarly future-facing. No phase consumes them yet. Same trade-off.

If you'd prefer the most-conservative-curated subset (only what Phases 1-4 explicitly consume), the answer is: `latest_snapshot` + `cycling_fitness` + `swim_training_from_workouts` + `longitudinal_signals`. The other three are arguably YAGNI.

**I'd lean conservative — start with 4 fields, add the others when a phase actually consumes them.** Confirm preference.
