# SLICE 4a — Finer increment for light lifts; the builder must not lay out a stall (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
Terminal, one stage. Ships behind fixtures (Constitution Law 6). Strength-system change — **ground every rule in the 5/3/1 book** (`/Users/michaelambp/Downloads/531_2nd_Edition_Hard_Copy.pdf`) + 5/3/1 Forever; cite pages.

## The goal, in one line
A light lift must be able to keep climbing across the block. Today the builder moves only in **5-lb steps**, and a lift whose max is small has a growth band smaller than one step — so it hits the 90% ceiling in one cycle and **holds flat for the rest of the block, decided at build time.** That is a layout defect, independent of whether the max is accurate.

## Why (verified this session on Michael's live plan + data)
- Working number starts at 85% of max, capped at 90% (`wendler-531.ts` `WORKING_NUMBER_PCT_OF_1RM = 0.85`, `TM_CEILING_PCT_OF_1RM = 0.90`). The growth band is **5% of the max, in pounds.**
- The increment is a fixed +5 upper / +10 lower, floored at one 5-lb step (`INCREMENT_LB = 5`, `cycleIncrementLb`, `cappedCycleIncrementLb`, `roundDownToIncrement`). There is **no sub-5-lb jump**.
- Michael's overhead press: max on file **100** → band is **5 lb** (85→90). One +5 step fills it, then it holds. Bench (max 150 → band 7.5 lb) has room, so it keeps climbing. Same rule, same step — the smaller max stalls because its band is smaller than the step. **Not a stale-max problem; a granularity problem.**

## What the book says (cite, don't paraphrase into a new rule)
- **p29, "Even Smaller Increments?"**: *"a 2.5 pound increase for the bench and military press… provided you have access to 1.25 pound plates for your upper body movements. If you'd like to do this, by all means have at it."* Wendler explicitly blesses +2.5 upper-body jumps.
- Plate reality: a pair of 2.5-lb plates = **+5** on the bar (common). A **+2.5** bar jump needs **1.25-lb plates, one per side** (uncommon micro plates). So +2.5 is equipment-gated.

## Existing infra — TRACE before building (do not rebuild)
- `supabase/functions/shared/strength-system/loading/wendler-531.ts` — `INCREMENT_LB`, `cycleIncrementLb`, `cappedCycleIncrementLb`, `roundDownToIncrement`, the ceiling/hold logic that reports `kind: 'ceiling'`.
- `strength-primary-plan.ts` — the `kind: 'ceiling'` warning ("reach 90%… stop climbing… fresh test").
- **Equipment capture — FIND IT FIRST.** Does the app already know an athlete's available plates (wizard/baseline/equipment profile)? Grep for equipment/plate fields. `+2.5` is only loadable with 1.25-lb plates, so this build depends on knowing that. If it's captured, gate on it. If it isn't, that capture is a prerequisite — surface it, don't assume.

## The work
1. Allow a **2.5-lb increment for upper-body lifts** (bench, press) when (a) the athlete has 1.25-lb plates AND (b) a +5 step would overrun the 85%→90% band. Round to 2.5, not 5, in that case only. Everything else unchanged.
2. **The builder must not emit a block that holds a lift flat for the rest of the block.** With the finer step a light lift climbs within its band. If it *legitimately* reaches the ceiling (truly at 90% of the recorded max), that is a **calibration signal, not a silent hold** — hand it to Slice 4b (the retest/raise offer), don't freeze-and-warn.
3. Without micro plates, +5 stays the floor (honest — you can't load less). In that case the lift may still cap; that too routes to 4b, not a silent stall.

## Fixture (Law 6 — permanent regression)
- OHP max 100 **with** 1.25-lb plates → climbs in +2.5 steps across the block, does not flatline after one cycle.
- OHP max 100 **without** micro plates → +5 floor stands (can't load 2.5); the cap becomes a 4b calibration signal, not a silent hold.
- Bench max 150 → unchanged (band 7.5, +5 fits) — byte-identical to today.
- Lower-body lifts unchanged unless equipment + band say otherwise.
- Deterministic.

## Do NOT touch
- The 90% ceiling invariant itself (it's the safety cap; heavily decided) — only the *step granularity* under it changes.
- The e1RM formula/reserve gate, the overload verdict, the max-on-file value (that's 4b).

## Acceptance
Rebuild a light-press plan for an athlete with micro plates → the press climbs the whole block. Michael's plan no longer lays out a flat press/squat by construction. Device pass. Fold into a D-NNN, delete this file.
