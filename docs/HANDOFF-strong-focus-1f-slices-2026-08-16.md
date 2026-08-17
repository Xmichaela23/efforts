# HANDOFF — finishing §1f, in four slices (2026-08-16)

**Parent:** `docs/WORKORDER-strong-focus-concurrent-2026-08-16.md` §1f / §1f-0 / §1f-1.
**Roles:** Michael is the architect. The chat holds this plan. **Each slice below is one terminal
session** — take one, finish it, stop. Do not merge two.

---

## Where the tree is

`198dd774` — *strength: the lifting week is three days in the tests too (§1f-0)*. Committed, **not
pushed, not deployed.**

**The engine half of §1f-0 is DONE and committed.** Every Strong Focus block is three lifting days:
**Squat · Bench · Deadlift + Press.** The `liftingDays` argument is deleted from
`StrengthPrimaryArgs` — not defaulted off, *deleted* — and every branch that read it is
unconditional. Do not reintroduce it. Do not add a four-day path "for later".

**Test state, and it is the baseline every slice measures against:**

| command | result |
|---|---|
| `deno test --allow-all --no-check supabase/functions/shared/strength-system/` | 418 passed, **2 failed** (slice 1) |
| `deno test --allow-all --no-check supabase/functions` | 2953 passed, **5 failed** = 3 standing d031-convergence + slice 1's 2 |
| `deno test --allow-all --no-check src` | 680 passed, **3 failed** — standing (non-race-goal-seeds ×2, club-anchor ×1) |

⚠️ **The 6 standing failures fail on a clean tree.** Anything beyond them is yours.

---

## Slice 1 — the easy sessions bunch up

**⛔ THIS IS THE ONE THAT IS NOT IN THE WORK ORDER.** It surfaced during §1f-0's test surgery and it
is a real, live defect, not a four-day artefact.

**What the athlete sees.** Two easy runs on Saturday and Sunday back to back, with Thursday empty.
Two easy rides on Wednesday and Thursday, with Sunday empty.

**⚠️ IT IS PRE-EXISTING, AND THE PROOF IS RUN, NOT REASONED.** Both cases were rebuilt on the
pre-change engine with `liftingDays: 3` and produced **byte-identical clustered weeks.** The
four-day path spread correctly; the three-day path never did, and because four was the default
nobody ever saw it. Deleting the option did not cause this — it made it the only behaviour any
athlete gets.

**The mechanism**, read from `supabase/functions/_shared/week-solver.ts:817` (the tie-break chain
below `let best`): ranking is `restShortfall` → **`shared`** → `streak` → `gaps` → `avoided` /
`afterLong` → **`selfAdjacent`**. `shared` counts sessions put on an already-occupied day. At four
lifts the week was crowded enough that stacking was forced, `shared` tied, and spread decided. At
three there is a spare day, so a `shared: 0` arrangement becomes reachable and wins **before `gaps`
or `selfAdjacent` are ever consulted.** Bike case: it takes Wed+Thu+Sat (`shared: 0`, adjacent) over
Mon+Wed+Sat (`shared: 1`, properly spread, Monday stacked onto the bench day).

The file's own header says stacking an easy session onto a lift day *"is legal and is what buys the
spread"* — that is exactly what the ranking now refuses to do.

**Done means:** `easy-session-spread.test.ts:93` (`run 3d · long Wed`) and `:98` (`bike only 3d`) go
green, and **nothing else in the three suites above moves.**

⛔ **DO NOT WEAKEN THE TWO ASSERTIONS.** The file's header explains at length why the "the week was
full" escape hatch was removed rather than kept: the relaxed version passed the old broken composer
too. A relaxed assertion here is what hid this class of defect the first time.

⚠️ **The blast radius is real and the file says so.** `week-solver.ts:440` records that deleting
`upperToNearestLiftPenalty` changed **36 of 43 three-day solver scenarios and not one test
noticed.** Re-ranking `shared` is the same kind of move. Run the full `supabase/functions` suite,
not just the strength directory, and read `place-week.test.ts` and `placement/solver-parity.test.ts`
before touching the order.

⚠️ **`shared` was deliberately ranked below `restShortfall`** — the comment at `week-solver.ts:780`
says sharing *"protects the rest day on a full week"*. That reasoning is sound and must survive.
What was never reasoned about is `shared` vs `gaps`/`selfAdjacent`, because at four lifting days it
could not come up.

---

## Slice 2 — the plan builder screen

Work order §1f-0 ("what goes") + all of §1f-1. **One session: every line is in two files, and
splitting it would have two sessions editing the same lines.**

**Delete the "Lifting days" step.** `src/components/NonRaceBuilder.tsx` — the `'lifting'` step key
at `:705`, the `out.push('lifting')` at `:727`, and the whole screen at `:3057`. ✅ Step numbering is
derived (`stepNo` at `:1295`, `steps.length`), so the wizard renumbers itself — no hardcoded counts
to chase.

**Delete the state.** `:587` (`liftingDays: 3 | 4` and its stale doc comment at `:586` — *"the two
upper lifts share a day; the test week still runs four"*, wrong pair **and** the four-day test week
was deleted 2026-08-05), the `liftingDays: 4` seed at `:1263`, the conditional `lifting_days: 3`
write at `:1024`.

**The accessory picker shows THREE cards, unconditionally** — Squat · Bench · Deadlift + Press.
There is no setting left to read.

⚠️ **AND THE FOURTH CARD IS NOT COSMETIC — IT SILENTLY EATS PICKS TODAY.** `by_day.press` is a
stored preference the engine can never honour: the press has no day of its own, and the shared day
takes the **deadlift's** assistance block (§1e — Wendler's stacked day is the mains plus ONE round,
p.77). An athlete choosing three press-day movements right now has all three discarded with no
message. This is pinned by `assistance-collision.test.ts` ("the composer gives each lifting day ITS
OWN picks"), which asserts those picks reach nothing — **update that test when the card goes.**

**The copy that is live and wrong today** (all plain string literals — ⛔ **none of it deletes
itself**, the work order's guess that it would was wrong; every one needs a hand edit):

| where | what it says | why it is wrong |
|---|---|---|
| `NonRaceBuilder.tsx:3120` | "Bench and press share a day" | the engine pairs **deadlift + press** |
| `NonRaceBuilder.tsx:3130` | "Squat · Deadlift · Bench + Press" | same wrong pair |
| `NonRaceBuilder.tsx:3203` | "Four lifting days, each with a push, a pull and…" | three |
| `NonRaceBuilder.tsx:3209` | "…on all four days" | three |
| `NonRaceBuilder.tsx:3265` | "…the pull category to chins on all four days" | three |
| `NonRaceBuilder.tsx:3308` | "It replaces your pull pick on all four days" | three |
| `strength-focus-copy.ts:87` | "Four lifting days, placed around your endurance." | **this is the plan's own description, shown to every athlete** |
| `strength-focus-copy.ts:136` | "Four lifting days, placed around the endurance you keep" | same |

⚠️ `src/lib/strength-focus-copy.shape.test.ts:42` **pins the wrong sentence**, so the test currently
enforces the error. It changes with the copy.

**Done means:** the wizard is 8 steps, three accessory cards, no "four lifting days" or "all four
days" anywhere in `src`, the deadlift+press pairing named correctly, and `src` back to its 3
standing failures.

---

## Slice 3 — the setting's plumbing, and old plans

**Strip `lifting_days` from the server side.** `supabase/functions/generate-strength-plan/index.ts`
`:34` (the comment block), `:49` (destructure), `:150` (`liftingDays: Number(lifting_days) === 3 ? 3
: 4` — passes a field the composer no longer accepts).
`supabase/functions/create-goal-and-materialize-plan/index.ts:2743-2744` (the conditional
`lifting_days: 3` write).

⚠️ **LEGACY FOUR-DAY BLOCKS EXIST** — every block built before today. `rematerialize-strength-block`
must not choke on one. Pre-launch with one athlete this is small, but **name it rather than discover
it.**

⛔ **THE `_shared` DEPLOY TRAP APPLIES.** See `CLAUDE.md`. Editing a shared file changes nothing in
production until every function importing it is redeployed. Find them with
`grep -rln "<file>" supabase/functions --include=index.ts`. Deploy is Michael's call — do not run it.

**Done means:** no `lifting_days` left in `supabase/functions`, an old four-day block rematerializes
without throwing, and the suites hold their baseline.

---

## Slice 4 — the chin count

⛔ **DECIDED 2026-08-16 (work order §1f-0): THE WEEKLY TOTAL HOLDS AND THE PER-DAY NUMBER RISES** —
roughly 25 → 35 on three days. The adaptation driver is accumulated weekly volume at sub-maximal
effort, not a per-day figure, and the reps are split however the athlete likes anyway. **Do not
re-decide this.**

⚠️ **AND FIXING THE DEFAULT ALONE WILL NOT CARRY IT.** `weeklyVolumeFor` divides the weekly total by
its `liftingDays` parameter (`src/lib/pullup-progression.ts:130`, default `4`; `:137`) — and **three
call sites pass a literal `4`**, so they would keep the old divisor no matter what the default
became, dropping the weekly total by a quarter. That is the opposite of the decision.

- `supabase/functions/shared/strength-system/strength-primary-plan.ts:582` — **the engine**
- `src/components/NonRaceBuilder.tsx:3307` and `:3309` — the wizard's dose note
- `src/lib/pullup-progression.test.ts:55, 65, 75, 83, 91` pass `4` and move with them

⚠️ **THE GRIP ROTATION IS FOUR GRIPS FOR FOUR DAYS** — `pullup-progression.ts:64`: *"Four days, four
grips, so a block never runs the same grip twice in a week."* With three sessions the fourth grip is
never reached (`strength-primary-plan.ts:584-585`). Decide whether that is fine (three distinct
grips a week still satisfies Forever p.26's "vary the grip") or whether the rotation should advance
across weeks. **Ask Michael — do not pick silently.**

⛔ **THE BEGINNER ON-RAMP OWNS ITS OWN DOSE** and is not held to the 25 floor: a band-assisted
athlete gets ~15 a day on three days. A floor for a movement someone cannot yet perform one clean
rep of is a wall, not a floor.

**Done means:** one athlete's weekly chin total is unchanged before and after, the per-day number
rose, the wizard's dose note matches what the engine builds, and the grip question has an answer
from Michael.

---

## Order, and why

1. **Slice 1 first** — riskiest, and its "done" is already written as two red tests. Keep it clear
   of screen edits so a scheduling change is not tangled with a UI change.
2. **Slice 2** — the most visible, and self-contained in two files.
3. **Slices 3 and 4** — either order.

## Do not

- Do not reintroduce `liftingDays` in any form, including a constant or a "for later" branch.
- Do not weaken slice 1's two assertions to get green.
- Do not touch `generate-triathlon-plan` (it builds tri eventually) or propose swim work.
- Do not commit, push or deploy without Michael. Edits are free.
