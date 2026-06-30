# STATE — Non-race "Get Stronger", end of 2026-06-29

The session audit + handoff. Where Get Strong (Program 1) actually stands, what's deployed vs staged, the bugs found, and the one real piece left. Read with `SPEC-product-shape.md` (the locked product).

---

## The one-line truth
The whole **pipe works** — builder → goal → plan → calendar, in-app — and the **strength engine produces real 5×5** (proven on the deployed engine). But the plan it produces is still **run-primary** (a Marathon Completion run plan with strength overlaid), because the non-race run path (`(b)-run`) is a **stopgap** that borrows the race run engine. **Making strength the spine is the one real build left.** Everything else this session was clearing the path to that.

## What WORKS now (verified this session)
- **Materialization pipe** — a non-race run goal flows end-to-end: `create-goal` → `(b)-run` → `generate-run-plan` → `activate-plan` → `planned_workouts` → calendar + Goals active-plan. **Identical pipe to marathon/season** (all call `activate-plan`). Proven: goal `636339fc` materialized 77 planned workouts.
- **In-app builder** — embedded in the Goals tab (`GoalsScreen` → `NonRaceBuilder`), keeps nav/banner; "Add Goal" opens it. Replaced the orphaned `/goals/build` route. (committed, **not deployed**.)
- **Disciplines ungated** — matrix + seed offer all four; nobody is pigeonholed runner/cyclist. (committed, **not deployed**.)
- **Strength engine = real 5×5** — `generate-run-plan` v146 emits Squat/Bench/Row/OHP/Deadlift for `five_by_five`/`strength_focus_build`; freq-4 U/L/U/L proven; all 4 Q-093/Q-088 locks fixed + **deployed**.
- **The CONDUCTOR** — phase→protocol arc (base→power→sharpen), built + tested, **staged not deployed** (`strength-arc.ts` + overlay wiring).

## DEPLOY STATE (important)
- **Edge functions DEPLOYED:** `generate-run-plan` **v146** (Q-093/Q-088 locks); `create-goal-and-materialize-plan` **v226** (smart-server developer resolution; still has throwaway `[DIAG]` logs — the clean v227 is committed but the deploy was gated).
- **Committed, NOT deployed (staged for review):** the conductor (`generate-run-plan/strength-overlay.ts` + `strength-arc.ts`), the create-goal cleanup (v227), all client changes (builder embed, ungate — these need a **Netlify** deploy / the push triggers it).
- **Owed deploys when you're back:** `generate-run-plan` (conductor), `create-goal` (v227 clean). Both byte-identical for existing plans.

## Bugs found + fixed this session (the path-clearing)
1. **Q-093 — 3 stacked locks** (non-race run strength → durability): tier gate (`runRetestBody` sent no `strength_tier`) + `five_by_five` not run-centric + the HTTP validation allowlist. All fixed + deployed (v145/v146). The live probe caught locks 2 & 3 that local tests bypassed.
2. **Q-088 Lock 4** — HTTP validation hard-capped `strength_frequency` at 3. Fixed (v146).
3. **Equipment mis-classification** — `equipmentTierFromArc` didn't recognize "Commercial gym" → bodyweight → durability. Fixed (string match). The deeper fix: **smart-server developer resolution** — the engine now picks the developer from reliable server-side equipment when strength develops (`create-goal` v226), per the spec's "dumb client" principle.
4. **Routing** — non-race run-shaped goals route `(b)-run` (NOT combined); the `:2178` "must route combined" comment is stale (T-3/D-218). Confirmed by trace.

## Program 1's shape — BUILT (Option B), staged
**UPDATE (later 2026-06-29):** the strength-primary path is now **built** (chose Option B — sport-agnostic). See `SCOPE-strength-primary-shape.md` (BUILT). The conductor sequences the protocol; the strength-primary engine makes strength the **spine**:
- **`composeStrengthPrimaryPlan`** (`shared/strength-system/strength-primary-plan.ts`) — the conductor's arc (base→power→sharpen→retest) IS the structure; maintenance endurance (run/bike/none) on the off-days; clean grid, no doubling; **5/5 tests**.
- **`generate-strength-plan`** — new edge engine; persists the standard plan row; type-checks.
- **`create-goal`** — Get Strong (strength develops + endurance held + barbell) routes here BEFORE `(b)-run`/combine. Bodyweight → `(b)-run` durability still.
- **OWED on deploy:** deploy the new engine + create-goal; verify `activate-plan` materializes the session shape (maintenance run/bike sessions are simple — may need a token/default); the 1RM-retest terminal is v1 (deload + label) — full re-baseline is the next refinement (gap #4).

This **supersedes the `(b)-run` stopgap for Get Strong** (the stopgap stays for endurance-develop run goals). The old run-primary symptoms (marathon label, doubling, days ignored) don't apply to the strength-primary path.

## HELD (do not touch)
- **Bike / multi-sport non-race** (F-9 combined engine) — separate cut, fragile surface, 486-guard each step.
- **Hypertrophy build** — parked; resolved by balanced-with-upper (D-220).

## Where to pick up
1. Deploy the staged conductor + clean create-goal (when ready) — byte-identical, low-risk.
2. Then the real build: **scope the strength-PRIMARY plan shape** (strength as spine, maintenance endurance underneath, 1RM retest terminal), replacing the `(b)-run` marathon stopgap. The conductor + the strength engine + the contract row are the pieces; this is the assembly.

*Session commits: the Q-093/Q-088 fixes, the equipment/seed/embed/ungate fixes, the smart-server resolution, the conductor + arc, and the product-shape + contract-row specs. All on `main`.*
