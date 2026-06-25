# SPEC — Fitness-Verdict Reconciliation (the N-way meeting room)

**Status:** Spec / design note — NOT built, no code. This is the spec the spine↔projection reconciliation builds from. It is deliberately scoped as an **N-way adjacency**, not a two-way diff, because a third fitness verdict (the goal-predictor block trajectory) is a real axis that must be able to drop in as a peer later without re-architecting the room.

**Origin:** Investigation 2026-06-24 (code-traced). Three fitness "brains" were mapped; the conclusion is **three distinct axes, two independent brains, and a third that is real but not yet seatable.** This spec captures that so a future session doesn't (a) design a hardwired two-way comparator and tear it up when the third arrives, or (b) seat a readiness clone in the third chair by mistake.

**Read first:** D-210 (`DECISIONS-LOG.md` — spine-stays-descriptive; this spec *extends* that rule from "intent adjacent to spine" to "N fitness verdicts adjacent, none folded"), `docs/SPEC-athlete-state-spine.md` (the descriptive-spine contract), `docs/ENGINE-STATE.md` (the spine→goals arc is OPEN).

---

## 0. The problem

There are **three** computations of "how's the athlete's fitness" running in parallel, on three different substrates, that never cross-check each other:

| Verdict | Question it answers | Direction | Source | Persisted? |
|---|---|---|---|---|
| **Spine** (`state_trends_v1`) | per-discipline fitness trend ("swim is sliding") | backward | observed rows (`assembleStateTrends`) | yes (per-week snapshot) |
| **Projection / readiness** | whole-race finish time vs target ("on-track / behind") | forward | `learned_fitness`/VDOT/FTP/HR-drift | finish time yes; verdict runtime-only |
| **Goal-predictor** (`block_verdict`) | is this 4-week block converting work into adaptation fast enough ("rate") | mid-block slope | `block_adaptation_cache` deltas, profile-weighted | substrate yes (24h TTL); verdict runtime-only |

The high-value signal is the **disagreement** between them — "on-track for your finish time, **but** swim fitness is sliding." Today nothing surfaces it. The spine→goals feedback arc is documented OPEN.

---

## 1. The three verdicts, mapped (the build substrate)

### Spine — per-discipline trend (descriptive, backward)
- `_shared/state-trend/assemble.ts:172-205` — `DisciplineTrendCache = {verdict, pctChange, provisional}` per discipline; `StateTrendsV1`; `rollupFitnessDirection` collapses to one `fitness_direction`.
- Written to `athlete_snapshot.state_trends_v1` (`compute-snapshot/index.ts:673`). Read at coach (`coach/index.ts:2705`, rolled up), State (`useStateTrends`), workout-detail (`:403`, one discipline).
- **In the Arc it rides inside `latest_snapshot` via `select('*')` (`arc-context.ts:804`) but is NEVER surfaced** — only `ctl/atl/tsb` are pulled out (`:996-1009`). This unsurfaced presence is the seam Piece 2 uses.

### Projection / readiness — whole-race finish (forward)
- Single writer of `goals.projection`: `_shared/recompute-goal-race-projections.ts`. Tri → `projectRaceSplits` (`race-projections.ts`); run → `computeRaceReadiness` (`race-readiness/index.ts`).
- The `on_track / ahead / behind / well_behind` verdict: `race-readiness/index.ts:293-305` (asymmetric bands on predicted-minus-target). **Run-only, and runtime-only** (travels in the coach `race_readiness` payload; not persisted to the goal row — the row stores finish time + splits + confidence).
- **Critical shape limit:** tri carries per-leg *minutes* (`swim_min`/`bike_min`/`run_min`) but **no per-discipline verdict** — legs are summed; nothing flags the dragging discipline. The projection knows *time per leg*, never *which leg is the fitness risk*.
- Read at Arc (`active_goals[].projection`, `arc-context.ts:301`), coach (`:5135`), course-strategy, State.

### Goal-predictor — block adaptation rate (mid-block slope)
- `_shared/goal-predictor/index.ts:285` `buildBlockVerdict` — profile-weighted linear model on three block deltas (`aerobic_efficiency_improvement_pct`, `long_run_improvement_pct`, `strength_overall_gain_pct`), seeded 50, "on track" ≥60. Inputs from `block_adaptation_cache` via `getBlockAdaptation` (`_shared/block-adaptation/index.ts:265`), flattened in `generate-overall-context/index.ts:246-253`.
- `block_verdict` is **runtime-only**; the substrate cache is persisted (24h TTL).
- Read on **exactly one surface** — the Block Summary Tab (`BlockSummaryTab.tsx:387/408`, via `generate-overall-context`, the only caller that passes `block`).
- **Its inputs are spine-family observed deltas, reweighted by goal profile** — so it is *downstream of the observed substrate*, not an independent sensor. Distinct axis (rate ≠ trend ≠ finish), non-independent source.

---

## 2. Decision: the room is N-shaped, not two-way (D-210 extended to three)

Build the cross-check read-model as an **N-way adjacency**, never a hardwired spine-vs-projection diff:

- A **set of sibling verdicts** (spine per-discipline · projection whole-race · [reserved: goal-predictor block-rate]), each read from its own source.
- A **divergence read computed *above* them** — a separate, third-class field that observes where the siblings disagree. It does not live inside any sibling.
- **Nothing folds into anything.** This is D-210's spine-stays-descriptive rule generalized: N fitness verdicts sit adjacent; the divergence read sits over them; no verdict is computed-from or written-into another.

**Leave a named, empty third slot** for the goal-predictor in the read-model shape from day one — so seating it later (Piece 4) is a drop-in, not a re-architecture.

**Why N-way and not two-way (the structural guarantee):** the three axes are mutually non-expressible — the projection has no per-discipline verdict, the spine has no finish time, the block-rate has neither. None can be derived from another without loss. That mutual non-expressibility is *exactly* what makes folding lossy and adjacency correct — the same reason D-210 keeps intent out of the spine.

---

## 3. Piece 1 — Seat the two now (spine ↔ projection, ships in this build)

Not blocked on the third brain. Two real independent verdicts; the high-value disagreement is fully expressible with them.

1. **Surface `state_trends_v1` as its own typed `ArcContext` field**, beside `active_goals[].projection`. Today it rides untyped inside the `select('*')` blob (`arc-context.ts:804`) — pull it out as a first-class field. **Read-only, no write coupling.** The Arc is the clean adjacent assembly home (both verdicts already co-exist there; the projection is surfaced, the spine is not — close that gap).
2. **Add the net-new cross-check** that holds the projection's whole-race verdict beside the spine's per-discipline verdicts and emits the **divergence signal** as a sibling-over field:
   - **Tri — verdict-over-share:** spine per-discipline verdict × the projection's per-leg minute share → "swim sliding, and swim is N% of your projected time." (This is where the spine supplies the per-discipline verdict the projection structurally lacks.)
   - **Run — direct:** one discipline; the spine's run verdict directly qualifies the run projection.
   - Observe-don't-diagnose: it *names* the divergence, never reconciles it into one number.
3. **Unwind the existing fold at `coach/index.ts:1097`** (`buildRaceReadinessDrivers`) — today the spine `fitnessDirection` is injected as a "Fitness trend" driver row *inside* `race_readiness`. Read `fitnessDirection` **adjacent** to `race_readiness` instead. This is undoing a D-210 violation already in the code, not new work to avoid.
4. **Write-path guard:** never write any spine-derived verdict into the persisted `goals.projection` / `goals.race_readiness_projection`. The goal row stays free of observed-fitness state; the spine stays read-only from `state_trends_v1`.

---

## 4. Piece 2 — The third brain is a separate, sequenced item (FILE, do not build)

**Work item (gated behind Piece 1's N-way room existing):** wire `block` from `getBlockAdaptation` into coach's `runGoalPredictor` call (`coach/index.ts:2441/2451`) so `block_verdict` is *produced where the spine and projection already live*, then surface it as the **third sibling** in the N-way room.

**The rule it carries (non-negotiable):** the block-rate verdict stays a **distinct adjacent computation that reads the same observed substrate and reweights it** — never computed-from, never folded-into the spine, despite sharing inputs. Sharing inputs ≠ being the same verdict; the goal-profile reweighting and the rate/slope semantics are what make it its own axis. (The temptation will be "just derive it from the spine deltas" — that loses the axis.)

---

## 5. ⚠️ THE TRAP — do not seat a readiness clone in the third chair

On **coach** and **training-context**, `runGoalPredictor` is currently called **without the `block` argument** (`coach/index.ts:2451`, `generate-training-context/index.ts:946`). `buildBlockVerdict` returns **null when `!block`** (`goal-predictor/index.ts:292`), so on those surfaces only the **weekly readiness** verdict survives — and it folds into `heartLungsStatus` (`generate-training-context:965-976`).

**Therefore:** anyone "adding the goal-predictor to the room" **without first doing Piece 4's `block`-arg wiring** will be adding a **duplicate of readiness**, not the third axis. The third chair would silently fill with a readiness clone, and the N-way room would look complete while carrying only two real signals plus a copy.

**Named warning for future sessions:** the third sibling is valid ONLY if `block_verdict` is non-null in the shared scope. If you're wiring the goal-predictor in and `buildBlockVerdict` is returning null, STOP — you're missing the `block` arg, and you're about to seat a clone. Verify the block-rate verdict is actually present before surfacing it as a peer.

---

## 6. Adjacent-vs-merge — where merges are tempting (hold the line)

- **`coach/index.ts:1097`** — spine already folded into `race_readiness` as a driver. Unwind (Piece 1.3); do not extend.
- **Coach single payload + `coach_cache`** — gravity toward one combined "agreement" object. Resist: emit the siblings as the existing separate fields and the divergence as a *third* adjacent field; don't rewrite either source.
- **Goal-predictor inputs share the spine substrate** — gravity toward "just compute block-rate from the spine." Resist (Piece 4 rule): distinct computation, adjacent.
- **Write-paths** — never persist a spine-derived verdict onto the goal row (Piece 1.4).

---

## 7. Status / D-log pointer

- **SPEC ONLY — not built.** Piece 1 (spine↔projection, N-way room) is the build target; Piece 4 (third brain) is filed-not-built, gated behind Piece 1.
- **Sign-off note:** the divergence read is display/synthesis only — it observes, it does not adjust prescription. (If it ever feeds an adjust action, that's a separate prescription gate, like the spine's Step-5.)
- **✅ Locked as D-212 (2026-06-24).** The load-bearing decision recorded there: **"three axes, two brains, N-way adjacency, the third stays a peer never a readiness clone."** See `DECISIONS-LOG.md` D-212 for the three whys + the trap.

---

## 8. Cross-references

- D-210 (`DECISIONS-LOG.md`) — spine-stays-descriptive; this spec extends it to N verdicts.
- `docs/SPEC-per-discipline-periodization.md` — the per-discipline phase primitive that will eventually feed the spine side of this room (the spine verdict gains per-discipline intent context there).
- `docs/SPEC-athlete-state-spine.md` + D-150/D-151 — the descriptive-spine contract.
- `_shared/state-trend/assemble.ts:172-205` (spine), `_shared/recompute-goal-race-projections.ts` + `race-readiness/index.ts:293-305` (projection), `_shared/goal-predictor/index.ts:285` + `_shared/block-adaptation/index.ts:265` (goal-predictor) — the three brains.
- `coach/index.ts:1097` — the existing spine-into-readiness fold to unwind.
- `coach/index.ts:2451` / `generate-training-context/index.ts:946` — the missing `block` arg (the trap).
