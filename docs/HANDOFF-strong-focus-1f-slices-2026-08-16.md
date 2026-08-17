# HANDOFF — finishing §1f, in five slices (2026-08-16)

**Parent:** `docs/WORKORDER-strong-focus-concurrent-2026-08-16.md` §1f / §1f-0 / §1f-1 / **§1h**.
**Roles:** Michael is the architect. The chat holds this plan. **Each slice below is one terminal
session** — take one, finish it, stop. Do not merge two.

⛔ **THE WORK ORDER IS THE INSTRUCTION; THIS FILE IS THE ORDER AND THE STATE.** Where a slice names a
work-order section, open it — the section carries the decisions and the sourcing, and this file
deliberately does not repeat them.

⚠️ **SLICES 5 AND 4 BOTH EDIT `assistance-catalog.ts` AND `strength-primary-plan.ts`. Never run them
in the same session.** (The earlier slice 2 / slice 4 overlap in `NonRaceBuilder.tsx` is closed —
slice 2 is shipped and took the dose note with it.)

---

## Where the tree is

`3dc2c0d1`. Committed, **not pushed, not deployed.** Deploy list so far when the day ends:
`generate-strength-plan` + `create-goal-and-materialize-plan` (slice 3), plus every importer of the
touched `_shared`/strength-system files from slice 1 — resolve with the grep in CLAUDE.md.

✅ **SLICE 1 IS DONE.** The clustering is fixed and its two tests are green. It left one thing
standing that the next sessions must not undo: **`week-solver.ts` now carries TWO flexible rankings**
(`shape-first`, the untouched default, and `separation-first`, which the strength composer opts
into). They were proved contradictory — no single ordering satisfies both the marathon and the
strength suites — so this is a deliberate fork, not a half-finished refactor. ⛔ **Do not collapse
them, and do not add a third.** See `SolverInput.flexibleRanking`.

**The engine half of §1f-0 is DONE and committed.** Every Strong Focus block is three lifting days:
**Squat · Bench · Deadlift + Press.** The `liftingDays` argument is deleted from
`StrengthPrimaryArgs` — not defaulted off, *deleted* — and every branch that read it is
unconditional. Do not reintroduce it. Do not add a four-day path "for later".

**⚠️ BASELINE AS OF `45c59661` — measure this yourself before you change anything, and do not trust
the numbers below if they disagree with what you see:**

| command | result |
|---|---|
| `deno test --allow-all --no-check supabase/functions/shared/strength-system/` | **421 passed, 0 failed** |
| `deno test --allow-all --no-check supabase/functions` | 2956 passed, **3 failed** — the standing d031-convergence |
| `deno test --allow-all --no-check src` | 680 passed, **3 failed** — standing (non-race-goal-seeds ×2, club-anchor ×1) |

⚠️ **Those 6 standing failures fail on a clean tree.** Anything beyond them is yours.

---

## Slice 1 — the easy sessions bunch up — ✅ DONE at `b130fb4d`

> **Shipped.** `competingShared` now asks the law whether a stack actually competes, and the ranking
> is caller-scoped through `SolverInput.flexibleRanking`. `easy-session-spread.test.ts` gained a
> guard for the one ordering that no test held — verified by re-introducing the regression, which
> failed that test alone while the other 420 passed. **Everything below is the brief it was built
> from, kept for the reasoning.**

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

## Slice 2 — the plan builder screen — ✅ DONE at `45c59661`

> **Shipped.** 8 steps, three accessory cards, `state.liftingDays` gone, and the copy names the
> deadlift+press pairing instead of counting days. `strength-focus-copy.shape.test.ts` was pinning
> the wrong sentence and moved with it. ⚠️ `LIFT_DAYS` was deliberately NOT narrowed — that is
> **slice 5**. **Everything below is the brief it was built from.**

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

**And the wizard's pull-up dose note, which is §1h's but lives in this file.**
`NonRaceBuilder.tsx:3307` and `:3309` call `weeklyVolumeFor(pullupMaxReps, 4)` with a hardcoded 4.
Drop the argument so the note reads whatever the library now splits three ways. ⚠️ **This is here and
NOT in slice 4 on purpose** — it sits at `:3304-3312`, inside the block this slice rewrites, and two
sessions editing the same lines is how the line numbers in this document stop being true. Slice 4
owns the library and the engine; this slice owns every line of `NonRaceBuilder.tsx`.

**Done means:** the wizard is 8 steps, three accessory cards, no "four lifting days" or "all four
days" anywhere in `src`, the deadlift+press pairing named correctly, the dose note passing no
hardcoded 4, and `src` back to its 3 standing failures.

---

## Slice 3 — the setting's plumbing — ✅ DONE at `5b4c7e12`

> **Shipped.** Four lines, two files; the wire is dead at both ends and grep finds only comments. No
> tolerance path, per 2026-08-17. The flagged test residue (dead `liftingDays` passed to the
> composer) was cleaned at `3dc2c0d1`. The stale "old four-day block rematerializes" done-line below
> is history — the 2026-08-17 decision replaced it.

## The original slice 3 brief — the setting's plumbing, and old plans

**Strip `lifting_days` from the server side.** `supabase/functions/generate-strength-plan/index.ts`
`:34` (the comment block), `:49` (destructure), `:150` (`liftingDays: Number(lifting_days) === 3 ? 3
: 4` — passes a field the composer no longer accepts).
`supabase/functions/create-goal-and-materialize-plan/index.ts:2743-2744` (the conditional
`lifting_days: 3` write).

⛔ **NO LEGACY SUPPORT — decided by Michael 2026-08-17.** The work order's line about
`rematerialize-strength-block` tolerating old four-day blocks is DROPPED. Three days is the only
shape offered; Michael's own four-day block gets deleted and rebuilt, not protected. **Do not write
a tolerance path, and if one exists, do not extend it.**

⛔ **THE `_shared` DEPLOY TRAP APPLIES.** See `CLAUDE.md`. Editing a shared file changes nothing in
production until every function importing it is redeployed. Find them with
`grep -rln "<file>" supabase/functions --include=index.ts`. Deploy is Michael's call — do not run it.

**Done means:** no `lifting_days` left in `supabase/functions`, an old four-day block rematerializes
without throwing, and the suites hold their baseline.

---

## Slice 4 — the chin count — ✅ DONE at `1d9bfe9b`

> **Shipped, and the set is closed — all five slices are committed.** 100 a week builds (33·33·34),
> grips rotate across weeks with the chin-up genuinely prescribed, and the weighted day is pinned BY
> NAME to the squat day (Michael 2026-08-17) after the positional constant silently moved it onto
> the merged day. Verified on built blocks. **Remaining: push + deploy, which is Michael's call.**

⛔ **SPEC'D IN FULL AT WORK ORDER §1h — READ THAT, IT IS THE INSTRUCTION.** Both fixes are decided;
nothing here is an open question any more. Summary only:

**The divisor.** 100 a week ÷ 4 days, with only 3 days built → the athlete gets **75**. Verified, not
suspected. Weekly 100 holds; the split becomes **33 · 33 · 34**, and that overrides the round-to-fives
rule at `pullup-progression.ts:138` on purpose. Fixing the default at `:130` alone changes nothing —
callers pass a literal `4`: `strength-primary-plan.ts:582` (**the engine**) and
`pullup-progression.test.ts:55, 65, 75, 83, 91`.

⚠️ **`NonRaceBuilder.tsx:3307` and `:3309` PASS THE SAME LITERAL `4` AND ARE SLICE 2'S**, not yours —
they sit inside the block slice 2 rewrites. If slice 2 has already run, confirm they were done; if it
has not, leave them.

**The grip.** Underhand was mapped to the press day, which no longer exists, so three days build
overhand · neutral · wide and **the chin-up progression never prescribes a chin-up.** Fix is
`grips[absoluteSessionIndex % 4]` rotating across weeks, `GRIP_ROTATION` reordered to
`['pull','neutral','wide','chin']`, index derived from `(week - 1) * 3 + dayPosition` so the composer
keeps needing no memory of other days.

⛔ **`WEIGHTED_DAY_INDEX = 2` IS NOT PART OF THIS.** Separate control, still valid, do not re-point it.

⛔ **THE BEGINNER ON-RAMP OWNS ITS OWN DOSE** and is not held to the 25 floor: a band-assisted athlete
gets ~15 a day on three days. A floor for a movement someone cannot yet perform one clean rep of is a
wall, not a floor.

**Done means:** an athlete on the full dose gets 100 reps a week built (not 75), all four grips appear
across a block with underhand among them, the wizard's dose note matches what the engine builds, and
`src` holds its 3 standing failures.

---

## Slice 5 — the accessory picks are keyed by LIFT, not by DAY — ✅ DONE at `a7b9b96c`

> **Shipped.** Three keys by day, press bucket deleted, picks verified reaching the merged day on a
> built plan. Two exposed crashes fixed (the unguarded `BALANCED_WEEK[day]`, the `?? 'press'`
> fallback). ⚠️ **For slice 4:** the grip rotation now indexes four grips by three days — `wide` is
> unreachable, and the chin-up returning is a side effect of the narrowing, NOT §1h done. Line
> numbers in `pullup-progression.ts` and `strength-primary-plan.ts` have moved. The default week
> carries no abs movement — pinned by test, content call deliberately left to Michael.

**Decided by Michael 2026-08-16, on reading slice 2's report.** The store is called `by_day` and it
is keyed by lift: `LIFT_DAYS = ['press','bench','squat','deadlift']`
(`src/lib/assistance-catalog.ts:49`). That was only ever correct while four lifts meant four days.
There are three days now, so **the press key is a bucket nothing can ever read** — the merged day
takes the deadlift's block (§1e), and an athlete's press-day picks are discarded in silence.

**The fix: three keys, one per day.** Squat · Bench · **Deadlift + Press**. ⛔ **The press key is
DELETED, not kept.**

⛔ **THERE IS NOTHING TO MIGRATE AND NO COMPATIBILITY TO HOLD. Pre-launch, one athlete, no external
users.** An earlier draft of this slice proposed keeping the fourth key so existing blocks would
still load — that is exactly what the work order's standing constraint forbids: *"one law, one owner,
one implementation… if a change cannot delete what it replaces, stop and say so."* **Do not write a
fallback, a shim, or a read-path that tolerates the old shape.**

**Where it reaches** (this is why it is its own session, not a rider on slice 2 or 4):

- `src/lib/assistance-catalog.ts` — `LIFT_DAYS:49`, the `LiftDay` type, `by_day` on the prefs type
  `:342`, `normalizeAssistancePrefs`'s loop `:415-451`, `BALANCED_WEEK` / `buildDefaultWeek` `:483`,
  `resolveDayAssistance` `:587`. ⚠️ The comment at `:404` says *"all four days"* and becomes true as
  "three" only after this lands — it moves **with** this slice, not before it.
- `src/lib/exercise-alternatives.ts:277` and `exercise-alternatives.test.ts:236` — same sentence,
  same timing.
- `liftDayForMainLift` — `'Overhead Press' → 'press'` has to resolve to the merged day now.
- The engine: `strength-primary-plan.ts` reads the picks per lift and then merges. ⚠️ **The merge's
  "assistance comes from the first lift's resolution" step may become unnecessary** once the day owns
  one block — check before deleting it; §1e's *one round per stacked day* rule must still hold.
- `assistance-collision.test.ts` — "the composer gives each lifting day ITS OWN picks" currently
  pins that press-day picks reach nothing. **That assertion inverts here**: there is no press key to
  choose from, so the test should pin three keys and no fourth.

**Done means:** three keys everywhere, no `press` key in the type or the stored shape, an athlete's
picks for the deadlift+press day reach the built session, and the three suites hold their baseline.

⚠️ **Baseline for slice 4 is measured at `a7b9b96c`: 422/0 · 2957/3 · 680/3.**

## Order, and why

1. ✅ **Slice 1** — done at `b130fb4d`.
2. ✅ **Slice 2** — done at `45c59661`.
3. **Slice 3 next** — small, server-only, and it clears the last `lifting_days` references. Nothing
   depends on it, so it is the cheap one to get out of the way.
4. **Then slice 5, then slice 4.** ⚠️ **Both edit the engine and the same library neighbourhood —
   run them in separate sessions, never together.** Slice 5 changes the shape the picks are stored
   in; slice 4 stops keying grips by day at all. Neither depends on the other, but two sessions in
   `assistance-catalog.ts` and `strength-primary-plan.ts` at once is how the file:line references in
   this document stop being true.

## Do not

- Do not reintroduce `liftingDays` in any form, including a constant or a "for later" branch.
- Do not weaken slice 1's two assertions to get green.
- Do not touch `generate-triathlon-plan` (it builds tri eventually) or propose swim work.
- Do not commit, push or deploy without Michael. Edits are free.
