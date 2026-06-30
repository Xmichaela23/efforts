# SCOPE — Strength-Primary Plan Shape (the real Program 1; replaces the `(b)-run` stopgap)

**Status:** SCOPE for review (2026-06-29). The conductor (phase→protocol arc) is built; this is the **shape** it runs inside. Decision needed on architecture (§Fork). Do not build until reviewed — the fork is a real choice.

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
