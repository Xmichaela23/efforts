# SLICE a — Replace the invented 1RM ceiling with Wendler's reset (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
Terminal, one stage. Engine only — NO UI, NO writes to the athlete's numbers (that is slice b).
Ships behind deno fixtures (Constitution Law 6). Strength change — **ground in the book**
(`/Users/michaelambp/Downloads/531_2nd_Edition_Hard_Copy.pdf`); cite pages.

## Audience — THIS IS THE INTERMEDIATE PLAN (Michael, 2026-08-12)
Run 5/3/1 exactly as the book writes it for an intermediate lifter. A true beginner is a SEPARATE
offering (a beginner plan, built later — Wendler's own p90 full-body variant / a faster linear
progression); do NOT bend this plan to protect a novice. That is why the step-shrink comes out below:
there is no light-beginner edge case to defend here, because beginners don't run this plan.

## The goal, in one line
Do as Wendler says, in the shape the modern 5/3/1 apps use: the training max climbs with **no cap tied
to the 1RM on file**, but the climb is **earned each cycle by the heavy set** — beat the target and it
goes up, only-just-make-it or fall short and it **holds at the same weight** (a free re-try, no
penalty), fall short of that same held weight **again** and it drops 10% and rebuilds. Removing the cap
dissolves the "week 7 == week 11" freeze; the hold-then-drop brake replaces it. **No grinding upward:
the number stops rising the instant the athlete stops beating the target.**

⚠️ **"Grind for two months" is the WRONG mental model and must not creep into the code.** A shortfall
never keeps adding weight into a wall — it HOLDS (repeats the same weight). The verified field norm:
StrongLifts repeats the weight after any failed workout and only deloads after the SAME weight fails
3× (support.stronglifts.com); Juggernaut holds the training max when you hit the minimum or fewer, and
only resets after barely-hitting across more than one cycle (liftvault.com). Both = hold first, drop
on the confirmed second miss.

## Why (verified this session)
- **The freeze is structural, not personal.** A block collapses into identical cycles whenever ONE
  plate-step covers the 5-percentage-point gap between the 85% start (`WORKING_NUMBER_PCT_OF_1RM`) and
  the 90%-of-1RM ceiling (`TM_CEILING_PCT_OF_1RM`). Upper: freezes at a 1RM ≲ 100. Lower: ≲ 110. It
  hits the next 100-OHP athlete and 110-squat athlete before they lift a thing. Worked trace:
  - OHP 1RM 100 → base TM 85 → cycle 2 steps to 90 (= ceiling) → cycle 3 wants 95, truncates to 90.
    Week 7 top set and week 11 top set both 85 lb.
  - Squat 1RM 110 → base TM 90 → cycle 2 → 95 (= ceiling) → cycle 3 wants 100, truncates to 95.
    Week 7 and week 11 both 90 lb.
- **The ceiling is an app invention; Wendler has none.** p30: "You keep on increasing the max you're
  working from every four weeks *until you can no longer hit the prescribed sets and reps*." The brake
  is a miss, not a number on file.
- **The circularity the ceiling was built to stop is already handled elsewhere.** Traced every write
  of `user_baselines.performance_numbers`: the only strength writes are the athlete's own typed number
  and `save-baseline-test`. **Nothing takes a strength AMRAP and writes it back as the 1RM** — the
  old auto-writeback was deleted (`adapt-plan`, see CLAUDE.md topology note). The displayed e1RM record
  already obeys the trusted-rep ceiling (D-417, `trustedMaxRepsFor` `wendler-531.ts:445`). So the cap
  guards a door already bricked up.

## What the book says (cite; don't invent thresholds)
- **p30** — advancement is the default, a miss is the event: climb every cycle until you can't hit the
  prescribed reps.
- **p31** — the stall: take 90% of a fresh max and start over; **per lift** ("you only need to
  decrease the one stalled lift"); multiple lifts stalling → deload week + recalculate all.
- **p33** ("Having a Less Than Stellar Day") — one bad day is NOT a reset: "get your prescribed weights
  and leaving." The reset fires on a **pattern**, never one session.
- Field precedent for the pattern rule (verified 2026-08-12): StrongLifts deloads 10% after **three
  consecutive** failed sessions — pattern-gated, automatic. (support.stronglifts.com)

## Existing infra — TRACE before building (do not rebuild)
- **The reset math already exists.** `RESET_FRACTION = 0.10` (`wendler-531.ts:494`); `applyVerdict`
  reset branch (`wendler-531.ts:503`). Wendler's exact number.
- **The verdict pipeline already exists (D-341).** `verdictFrom95Set` (`wendler-531.ts:483`) →
  `applyVerdict` → `workingNumberForCycles` (`wendler-531.ts:548`); supplier `verdictForCycle`
  (`cycle-verdicts.ts:103`) reads the week-3 95%+ set; consumers `strength-primary-plan.ts:2275` and
  `rematerialize-strength-block/index.ts:167`.
- **The ceiling to remove:** `TM_CEILING_PCT_OF_1RM = 0.90` + `tmCeilingLb` (`wendler-531.ts:224-229`);
  the truncate/hold branch in `applyVerdict` (`wendler-531.ts:515-525`); the forecast passing `oneRM`
  for the ceiling (`strength-primary-plan.ts:2280`); the `ceilingHitAtCycle` / `ceilingLifts` /
  `strength_calibration` 'ceiling' emission (`strength-primary-plan.ts:2288-2306`, type at `:1290`).

## The work
1. **Remove the 1RM ceiling from the ladder.** In `applyVerdict`, an `advance`/`advance_untrusted`
   verdict steps by the increment and stops there — no `tmCeilingLb` clamp, no truncate, no
   `ceilingHit`. Drop the `oneRM` ceiling argument from the forecast call
   (`strength-primary-plan.ts:2280`). Delete `TM_CEILING_PCT_OF_1RM` / `tmCeilingLb` and the
   `ceilingHitAtCycle` plumbing.
1b. **Remove the step-shrink too — Wendler's increment is fixed for everyone.** Delete
   `cappedCycleIncrementLb` / `MAX_CYCLE_STEP_PCT` / `MIN_PLATE_STEP_LB`; the advance uses the plain
   `cycleIncrementLb` (+5 upper / +10 lower). **This is book-faithful, not an interpretation:** p90,
   "5/3/1 for Beginners" — *"I tell everyone to just do the program as is, regardless of training
   age"*; p107 FAQ — used with "both beginning and advanced lifters," same steady progression. Wendler
   gives lighter/newer lifters the SAME fixed jump. The shrink was a patch for the old brakeless
   system (a light TM walking past the 1RM with an AMRAP writing it back); with the ceiling gone, the
   writeback dead, and the hold-then-drop brake in place, a too-fast light-lifter climb is caught by
   the brake — Wendler's own self-correction — not by a smaller step. The conservative 85% start
   (already lower than his 90%) covers "don't get ahead of yourself" (p8).
2. **Pattern-gate the reset (p33).** A single missed measured set must resolve to `hold`, never
   `reset`. A `reset` fires only when the miss repeats across consecutive measured points. Implement
   with a named constant `STALL_CONFIRM_SESSIONS` (default **2**) so the count is a locked product
   decision, not a magic number. Ground: p33 (one is not enough) + StrongLifts's three-consecutive.
   - The measured point in this engine is the week-3 95%+ set (one per cycle), so "consecutive misses"
     = consecutive cycles failing the prescription. Keep it inside the existing `verdictForCycle` /
     `workingNumberForCycles` architecture; do not widen the signal to every working set in this slice.
3. **The calibration signal (D-421) is re-scoped, not deleted here.** Its 'ceiling' reason is now
   unreachable (there is no ceiling). Remove the ceiling emission; **leave the `plans.config`
   `strength_calibration` type/plumbing** — slice b repopulates it from the reset/bump events.

## Fixtures (Law 6 — permanent regressions)
- **100-OHP athlete no longer freezes** — top sets climb across cycles (TM 85 → 90 → 95); week 7 ≠
  week 11. **This is the permanent regression that proves the bug dead.**
- **110-squat athlete climbs** (TM 90 → 100 → 110, Wendler's fixed +10 lower), no identical cycles.
- **One missed week-3 set → `hold`** (no reset). p33.
- **Two consecutive missed week-3 sets → `reset` (−10%)**, that lift only.
- **On-target athlete → `advance`.**
- **Heavy lifter unchanged** — a 315-squat athlete's cycle weights are byte-identical to today (the
  ceiling never bound for him; assert removal changed nothing).
- Deterministic; pure engine, no stochastic path → no LLM recompute needed here.

## Do NOT touch
- The e1RM formula (D-339) and the trusted-rep ceiling (D-417).
- The 85% start (`WORKING_NUMBER_PCT_OF_1RM`) — Wendler's own lower-band advice for athletes with
  other demands; not the freeze cause.
- The overload verdict (D-418), the strength record/rep-PR display (D-420), the logger's celebration.
- Any write to the athlete's numbers or any UI — that is slice b.

## Supersede on ship
- The **90%-ceiling decision** — it has no standalone D-entry; it lives as dated block comments at
  `wendler-531.ts:172-229` (2026-07-27 / 2026-07-28). Annotate them "superseded — cap removed, see
  D-NNN." Grep the logs for a matching entry and back-annotate if one exists.
- **D-421** — re-scope: the ceiling-pin trigger is retired; the calibration signal moves onto the
  reset/bump events (slice b). Back-annotate D-421.

## Deploy targets (after Michael's push/deploy go — he deploys nothing himself)
`generate-strength-plan`, `create-goal-and-materialize-plan`, `materialize-plan`,
`rematerialize-strength-block`, `coach` (every importer of the shared strength-system).

## Acceptance
Deno fixtures green (incl. the 100-OHP regression). One Michael-driven acceptance run: regenerate a
strength block at a low OHP/squat max and confirm the cycles climb instead of repeating. Fold into a
D-NNN, delete this file.
