# SPEC — E3b: budget-anchored volume (the hours budget sizes the week)

**Status: SPEC — review before cut. Not approved, not implemented.** REWRITTEN 2026-06-28 — the earlier "bottom-up from the long-run ramp, total emerges" model was **overturned**; the anchor is the **hours budget**, not the ramp. The ramp survives as the long-run *shape inside the budget*. Realizes SUB-DECISION B for `sustainable`. Companion: `SPEC-shared-endurance-model.md`, `SPEC-e3a-nonrace-zones.md`, `ISLANDS-ORIENTATION.md`, `non-race-goal-plan-contract.md` ADDENDUM.

---

## 1. The design conviction this spec SERVES (locked, not discovered)

**Computed vs. chosen — the load-bearing split:**
- **The engine owns RECONCILIATION** — *does the plan fit the stated budget?* Glass-box on conflict, never silently exceed. Deterministic math. The model decides this.
- **The faders own ALLOCATION** — *where the stretchy endurance time goes (run vs. bike).* This is **user preference, not a fitness fact the model can derive.** Two athletes with identical goals and identical 6 hours can want opposite splits and both be correct. **The model must not auto-allocate this.** The faders are load-bearing on purpose.

**The budget shape the plumbing carries:**
- **Strength = near-fixed reservation.** Sessions × ~1hr, a flat-ish cost off the top — not a curve. **Reserved first.**
- **Endurance = the remainder.** `budget − strength reserve` = the stretchy pool.
- **The faders divide that remainder across endurance disciplines.** Cycling is the high-variance one (a ride absorbs hours running never will) — the whole reason the faders exist.

## 2. The data contract (verified — `non-race-intake.ts:28-69`)
`allocateTime(budgetHrs, program, runLeanPct)` emits **hours-per-discipline**, strength pre-reserved:
```
{ budgetHrs, strengthHrs (off the top), enduranceHrs (= budget − strength),
  runHrs (= endurance × runPct), rideHrs (= endurance × ridePct), warning }
```
This is exactly §1's shape. The engine consumes the **per-discipline endurance hours** (`runHrs` for run; `rideHrs` reserved for the future bike engine). **Strength is already subtracted** — the engine does no split.

**Reconciliation owed:** `strengthHrs` is currently `STRENGTH_PROGRAM_HRS` (program-keyed placeholder). Per §1 the reserve is **engine frequency × ~1hr** — compute it from the actual `strength_frequency` the engine runs, so the budget holds against reality, not a table guess.

## 3. The splice + the thread
- **Splice point:** `sustainable.ts:317 calculateWeeklyMileage` → produces `weeklyMiles` (`:157`) → `fillWithSimpleEasyRuns(…, weeklyMiles − used)` (`:196`). The hours budget **drives this target**, replacing the `WEEKLY_MILEAGE` table.
- **The thread (4 hops, all gaps today):** `training_prefs.weekly_hours_available` (goal) → `runRetestBody` (create-goal `~2374`) → `GeneratePlanRequest` → `generatorParams` → `sustainable`. Carry **per-discipline endurance hours** (`runHrs`), not a single number, so bike plugs in later.
- **The unit bridge:** `runHrs → weekly mileage target` via pace — `weeklyMileTarget = runHrs × 60 ÷ paceMinPerMile`. Pace from the athlete's VDOT (`paceZonesFromVdot`, wired in E3a); **no-pace fallback = the existing `getEasyPaceMinPerMile()` fitness default** (`milesToMinutes`, `base-generator:850`), flagged as an estimate.

## 4. Worked example — the budget visibly holding
**Athlete: 8 hr/week budget, durability strength 3×/wk.**
- Strength reserve = `3 × ~1hr = 3 hr` (off the top).
- Endurance remainder = `8 − 3 = 5 hr`.

**Fader A — run-only capacity (runLean 100%):** `runHrs = 5`, `rideHrs = 0`.
- Run week sized to **5 hr**. At ~9:00/mi easy → ~33 mi target. Long-run (distance-precise spine ramp, e.g. 9 mi) fits; easy fills the rest. **Budget: 3 (strength) + 5 (run) = 8 ✓**

**Fader B — same goal, same 8 hr, runLean 60%:** `runHrs = 3`, `rideHrs = 2`.
- Run week sized to **3 hr** (~20 mi). Bike (later engine) gets **2 hr**. **Budget: 3 + 3 + 2 = 8 ✓**
- A and B are the **same athlete, same goal** — the 100/0 vs 60/40 split is the **user's choice**, not derived. Both correct. *This is why the faders exist.*

**Reconciliation (glass-box):** if the distance-precise long-run alone exceeds the run budget — e.g. a marathon-shape 18 mi long-run ≈ 2.7 hr against a 3 hr run budget leaves ~0.3 hr for everything else → **flag**: *"your long-run target needs ~N hr; your run budget is M — we'll grow toward it within your time, or raise the budget."* **Never silently exceed.**

## 5. Run + bike now (allocation model not run-only)
The thread carries `{ runHrs, rideHrs }`. **Today:** run engine consumes `runHrs`; `rideHrs` is computed + carried but has no consumer yet (bike engine is later). **Design rule:** the allocation contract, the reconciliation, and the budget-holding math are **discipline-general** — when the bike engine lands, it consumes `rideHrs` through the same path with zero rework. Do **not** bake run-only assumptions into the cap/reconciliation logic.

## 6. What's retired
- `WEEKLY_MILEAGE` table + `calculateWeeklyMileage`'s table lookup → replaced by the hours→miles target.
- `LONG_RUN_PROGRESSION` table + `getLongRunMiles` → replaced by the spine ramp (`longRunMilesForWeek`), as the long-run **shape inside the budget**.
- The ACWR/peak-fitness governors that fed the old weekly target → dead for `sustainable` (placeholder coefficients; the budget is the anchor now).

## 7. Races (completion) move too — guard-tested, not byte-identical
`sustainable` serves non-race AND race-completion. Both gain the budget anchor (race goals carry `weekly_hours_available` too; the long-run stays distance-precise, the week caps to budget). **Guard-test the completion-race delta (D-216 pattern).** `performance_build` (speed races) untouched — separate E4. Race-week clamps preserved.

## 8. The two edges (decided here, not in prod)
1. **No pace data → no hours↔miles conversion.** Fallback: the existing `getEasyPaceMinPerMile()` fitness default; flag the week as an estimate. (Pace has no age-est tier; this is the floor.)
2. **Strength reservation basis.** Reserve = engine `strength_frequency × ~1hr`, computed consistently — not the program-table placeholder — so the whole-week budget holds against what the engine actually runs.

## 9. Verification
- **Budget holds:** for a sweep of (budget × strength freq × fader split), assert `strength + Σ endurance-discipline hours ≤ budget`, never exceeded; conflicts flagged not swallowed.
- **Non-race:** snapshot a budget-anchored week — long-run distance-precise (spine), week capped to `runHrs`, total ≤ budget.
- **Race-completion:** guard test on the volume delta (table → budget).
- **Untouched:** `performance_build` byte-identical; combined/tri 486/486.

## 10. Out of scope / deferred
- The bike engine (consumes `rideHrs` later).
- Wiring the intake faders to *supply* the budget (engine-first: prove the consumer with an injected budget; the faders are thin plumbing after). **Requirement: a sane no-budget default** so other `generate-run-plan` callers don't break.
- The forgiving/sharp ramp-tier *values* (dial still neutral).
- The `weekInPhaseForTimeline` recovery-non-resetting index (use it for the spine ramp; full timeline-helper unification later).
