# SCOPE — Strength-Primary Plan Shape (the real Program 1; replaces the `(b)-run` stopgap)

**Status: BUILT (Option B) 2026-06-29 — staged, NOT deployed.** Michael chose B (strength-primary, sport-agnostic). Built:
- **`shared/strength-system/strength-primary-plan.ts`** — `composeStrengthPrimaryPlan`: the conductor's arc (base→power→sharpen→retest) as the SPINE + maintenance endurance (run/bike/none) underneath, on a clean strength-primary day grid (no doubling). Sport-agnostic. **Tested: 5/5** (arc timeline, spine sequencing, cyclist, strength-only, distinct days).
- **`generate-strength-plan/`** — the new edge engine: composes + persists the standard `plans` row + `sessions_by_week`, returns plan_id. Type-checks clean.
- **`create-goal` routing** — a Get Strong goal (strength develops + endurance held + **barbell**) now routes to `generate-strength-plan` BEFORE the `(b)-run`/combine forks. Bodyweight Get Strong still falls to `(b)-run` durability (no bodyweight strength-primary lane yet).
- **Materialization VERIFIED by trace** (`activate-plan/index.ts`): `mapType` maps `run`/`ride`/`strength` cleanly (185-196); strength sessions carry `strength_exercises` (595-598, same path the `(b)-run` strength uses); maintenance run/ride sessions are token-less → `steps_preset: null` (532) + **duration-based workload** (515-517) — they land as easy duration sessions on the calendar. No token/default needed.
- **OWED on deploy (live confirmation only):** (1) deploy `generate-strength-plan` (new) + `create-goal`; (2) build one Get Strong goal in-app and eyeball the calendar (the trace says it works; confirm live); (3) the **1RM retest terminal** is v1 (retest week = deload + "test top sets" label) — the full re-baseline (log a 1RM, re-anchor `userBaselines`) is the next refinement (audit gap #4, ties to Q-086).

The original scope (the fork + the levers) is preserved below for context.

---

**(Original scope — for context)** The conductor (phase→protocol arc) is built; this is the **shape** it runs inside.

---

## The problem (concrete)
The `(b)-run` path makes a **run-primary** plan and overlays strength. From `runRetestBody`:
- `distance: 'marathon'/'half'` (a proxy) → drives **marathon training volume** AND the **"Marathon Completion Plan" name** (`generators/simple-completion.ts:134`: `${distance} Completion Plan`).
- `approach: 'sustainable'` → a **build ramp**, not maintenance.
- `terminalShape: 'retest'` → a **run** retest (Build→Retest), not a strength 1RM re-baseline.
- Strength is overlaid into the run week → days-per-week and placement follow the *running* logic, hence the doubling + ignored days.

So "Get Stronger" produces a marathon plan with strength attached — the **inverse** of Program 1 (strength leads, endurance maintains, strength retest terminal).

## The four levers to flip for strength-primary
1. **Name** — "Get Stronger — N weeks" (or the goal name), not "X Completion Plan."
2. **Endurance = maintenance** — flat, easy, low volume (not a `sustainable` build ramp). The E3b budget already reserves strength off the top; the remainder should be a *maintenance* run, not a marathon build.
3. **Terminal = strength 1RM retest** (audit gap #4) — not a run retest. The block ends by re-baselining strength.
4. **Structure = strength-led** — the strength arc (conductor: base→power→sharpen) is the spine; endurance days fill around it; honor the requested days; no doubling.

## The architecture fork (YOUR call)
- **Option A — refine `(b)-run` to strength-primary.** Flip the four levers in `generate-run-plan` (maintenance approach, goal-named, strength-retest terminal, strength-led placement). **Cheapest.** But: `generate-run-plan` is fundamentally a *run* generator — it'll always be "a run plan with strength," and it **only serves run athletes** (a cyclist's Get Stronger still has no home). Good as a fast win for run athletes; not the real product.
- **Option B — a strength-primary path (sport-agnostic).** The **strength arc is the plan structure**; maintenance endurance (run *or* bike *or* none) is the accessory layer. Serves every Get Strong athlete, matches the spec's "strength is the spine." **Medium build** — a new compose path that puts the conductor's weeks first and slots maintenance endurance around them, then materializes through the same `activate-plan` pipe. **Recommended for the real Program 1.**
- **Option C — `buildCombinedPlan` non-race (one engine, two knobs).** The spec's end-state (`SPEC-non-race-goal-plan-contract.md`): the combined engine produces both tracks with the strength-role knob. **Biggest** (F-9, fragile surface, 486-guard). The proper long-term home; not the next step.

**Recommendation:** **B** for the real Program 1 (sport-agnostic, strength-spine), with the conductor already built to drive it. A is a stopgap-on-the-stopgap; C is the eventual merge. If you want run athletes working *this week*, A is the quick patch — but flag it as throwaway.

## Open questions (sign-off before build)
1. **A, B, or C?** (Recommend B.)
2. **Maintenance endurance dose** for a Get Strong block — reuse the contract-row cell (~2×/wk easy, run/bike), or define per the focus.
3. **The 1RM retest terminal** — what it measures + how it's scheduled (the block's last week = a strength test week; deload into it). Needs a small spec (audit gap #4).
4. **Days/week semantics** — for Get Strong, is "5 days" 4 strength + 1 endurance, or 4 strength + 1 endurance + flexibility? Define the split rule.

## What's already in hand (so B is assembly, not invention)
- The **conductor** (phase→protocol arc) — built, tested.
- The **strength lanes** (`strength_focus_build`/`power`, the U/L/U/L base + power) — built, proven live.
- The **materialization pipe** (`activate-plan` → `planned_workouts` → calendar) — works for any plan shape.
- The **maintenance endurance dose** — sourced in `SPEC-getstronger-contract-row.md`.
- The **frequency policy + budget** (E3b `budgetSplit`, the freq-4 gate) — built.

B = wiring these into a strength-spine compose path + the retest terminal. The pieces exist; it's the assembly the `(b)-run` hack skipped.

*Cross-ref: `SPEC-product-shape.md` (Program 1), `SPEC-getstronger-contract-row.md` (cells), `strength-arc.ts` (conductor), `STATE-nonrace-getstrong-2026-06-29.md` (state).*
