# Handoff — unify plan-gen placement (ALL plan types) + deploy the strength-crash fix (2026-08-07)

**Role:** focused **engineer stage**, server-side only. A parallel chat owns the wizard UI — **do NOT touch client code** (`src/components/NonRaceBuilder.tsx`, `wizard/StepLayout.tsx`, etc.). This stage is the strength system + the plan generators, with `deno test` + a gated deploy.

**Scope: uniform placement across ALL plan types** — run, combined/multi-sport, triathlon, duathlon. The reference (the "good" one) is Strong Focus / the run plan. The trace below is done; **two of its claims are marked UNCONFIRMED — verify before acting on them.**

---

## The finding

The marathon race flow (`create-goal-and-materialize-plan` → `generate-combined-plan`) produced a bad week on a real build (Auto run days, `days_per_week` 5, long run Sun, durability strength):
- **Lower-body strength placed ON the long-run day (Sun)** — violates the lower-body-vs-long-run spacing (24–48h).
- **Easy runs clumped Mon–Thu**, then Fri/Sat rest — no dispersion.

### CONFIRMED: strength placement is forked
Strong Focus and the run plan use `strength-system/placement` (`simplePlacementPolicy`, keeps lower work clear of the long run):
- `shared/strength-system/strength-primary-plan.ts` (reference)
- `generate-run-plan/strength-overlay.ts:12,14`

`generate-combined-plan/week-builder.ts` uses **its own** strength placement (~lines 280–492) and imports **no** `strength-system/placement`. That is why lower body landed on the long-run day.

### UNCONFIRMED: the run-dispersion cause
The dispersion helper `easyRunAnchorAdjacencyPenalty` / `easyRunHardAnchorMinGap` **is** applied inside `_shared/week-optimizer.ts:1410-1414` (`deriveOptimalWeek`), which the combined-plan **does** use. So the earlier "combined-plan never disperses" claim was wrong. The clumping is real; the cause is not pinned. **Verify:** are the marathon easy runs placed by the optimizer (and the penalty just too weak / tie-break only), or placed elsewhere in `week-builder.ts` bypassing it?

---

## Task 1 — DONE ✅ (commit `a2d772ee`, all 7 functions deployed 2026-08-07). Only Tasks 2–3 remain.

### ~~Task 1~~ — DEPLOY the already-made strength-crash fix (first)

Edited on disk (verify, then deploy):
- `shared/strength-system/protocols/intent-taxonomy.ts` — registered `LOWER_HYPERTROPHY` (`StrengthIntent` union + `INTENT_DEFS`); made `isLowerIntent`/`isUpperIntent`/`isFullBodyIntent` **total** (`INTENT_DEFS[intent]?.category`).
- `shared/strength-system/protocols/performance-neural.ts:162` — dropped `as any`.
- `shared/strength-system/protocols/strength-focus-split.ts:35` — updated stale note.

Why: "Keep it heavy" (`neural_speed`) emits `LOWER_HYPERTROPHY`, unregistered → `INTENT_DEFS[intent].category` threw → whole build crashed (`Cannot read properties of undefined (reading 'category')`).

Deploy (the `_shared` trap; all 7 that bundle `strength-system`):
```
create-goal-and-materialize-plan generate-combined-plan generate-run-plan generate-strength-plan generate-triathlon-plan materialize-plan rematerialize-strength-block
```
Verify: build a marathon with **"Keep it heavy"** → preview must build (no `category` error).

---

## Task 2 — UNIFY placement across all plan types

Target: every generator uses the SAME placement Strong Focus uses. Mirror `strength-primary-plan.ts`.

1. **Strength (sport-agnostic — do this everywhere):** adopt `strength-system/placement` (`simplePlacementPolicy`) in `generate-combined-plan`, replacing its own strength placement (~280–492). Lower work must respect long-run spacing.
2. **Run dispersion:** first pin the UNCONFIRMED cause above, then make the combined-plan actually disperse easy runs (strengthen/apply the penalty on the real placement path).
3. **Triathlon / multi-sport — the "all plans" part, and it's bigger:**
   - Strength placement (#1) generalizes as-is — apply it to the triathlon path too.
   - **Endurance dispersion is RUN-ONLY** — `easyRunAnchorAdjacencyPenalty` has no bike/swim equivalent. Triathlon needs bike/swim dispersion (the optimizer already carries `quality_bike` / `long_ride` anchors to build against). Add the equivalents, or generalize the helper to any discipline.
   - **`generate-triathlon-plan` is a SEPARATE generator** that uses none of this (no `strength-system/placement`, no dispersion). Decide: route it onto the same placement, or (per CLAUDE.md's fragmentation note) fold it toward `generate-combined-plan`. This is the largest piece — scope it explicitly.

Constraints:
- `_shared/week-optimizer.ts` stays the **sole day-authority** (CLAUDE.md) — this is about which placement *helpers* each generator applies, not a new authority.
- `deno test` the `_shared` strength tests + generator fixtures before deploy.
- Same 7-function deploy list (plus any generator you touch).

**Acceptance:**
- Marathon (Auto days, `days_per_week` 5, long run Sun, "Keep it heavy"): easy runs **dispersed**, **no** lower strength on the long-run day.
- Triathlon: strength off the long-run/long-ride day, and easy bike/swim not clumped.

---

## Science grounding — keep it polarized + smart

The placement RULES are literature-backed even though the current penalty weights are hand-picked heuristics (`easyRunAnchorAdjacencyPenalty` +4s in `week-optimizer.ts:104-135` are ours, uncited). Ground the rules, keep the weights as tuning params:

- **Seiler — polarized / 80-20:** easy days truly easy, distributed so the hard days can be hard. → the basis for *spreading* easy runs (and easy bike/swim) rather than clumping them.
- **Recovery kinetics** (DOMS peaks 24–48h; muscle glycogen resynthesis ~24h): → **48h between hard/long sessions**; don't stack them.
- **Hickson (1980), concurrent-training interference:** strength blunts endurance and vice versa. → the basis for keeping **lower-body strength clear of the long run / quality day** (the currently-broken half). This is the "why" behind `strength-system/placement`'s long-run guard.
- **Bowerman → Daniels hard-easy:** the origin principle the adjacency penalty encodes.

Net intent: **polarized distribution + hard-easy spacing + Hickson-grounded strength separation.** Don't tune to any single athlete.

## Task 3 — unify plan deletion (destructive; careful)

Deleting a plan is two inconsistent paths, and the planner one orphans the goal:
- **Focus / Goals delete** = `deleteGoal` → `delete-goal` edge fn — the robust op (handles no-plan / standalone / combined+rebuild). This is the correct one.
- **Weekly-planner delete** = `AppLayout.handlePlanDeleted:1453` — bulk-deletes workouts by **name-matching "Week 1–4"** then `deletePlan(planId)`. It **never touches the goal** → the goal survives as a **phantom** on Focus.

Fix:
1. **Route the planner delete through `delete-goal`.** The plan carries `goal_id` (`AllPlansInterface.tsx:1639`) — when present, call the goal teardown instead of `deletePlan` + the name-pattern hack. Retire the name-match workout deletion.
2. **Verify `delete-goal` robustly deletes an already-orphaned goal** (a phantom created by the old path, whose plan is gone / plan-ref dangling). Michael reports the Focus delete currently *fails* on such a phantom — `delete-goal`'s "goal had no plan → just delete goal" branch should cover it; if it errors on a dangling plan-ref, fix that. This is why existing phantoms won't clear.
3. Acceptance: deleting from **either** surface removes goal + plan everywhere; no phantom left on Focus; existing phantoms are deletable.

Server involved (`delete-goal`, `delete-plan`); gated deploy.

## Do NOT
- Touch client wizard code — the parallel chat owns it.
- Change the week-optimizer's role as sole day-authority.
- Delete this file until Task 2 ships; then fold the substance into a `D-NNN` (spec lifecycle).
