# Finish the swaps — the plan, 2026-08-20

> ## ⛔ RE-ORDERED 2026-08-21 — THE RUN ORDER IS NOW **1 · 4 · 5 · 2 · 3 · 6**
>
> **Stage 1 shipped. Stages 4 and 5 now come before 2 and 3.** Michael's ruling: *"whatever supports
> the build so we aren't crazy glue and taping it together."*
>
> **Why.** A new base plan — **The Standing Plan** — is going to be built on this engine, so
> "finished" now means *fit to build a new composer on*, not just *the eight bugs are closed*.
> - **Stage 4** must land first: writing a new composer while "how many rides" travels under nine
>   names bakes that mess into the engine we are calling final.
> - **Stage 5** must land before or with the new composer: adding one while four dead placement
>   engines are still reachable makes it six.
> - **Stages 2 and 3 are deferred, not dropped.** The Standing Plan prescribes which endurance
>   session sits on which day, so the scorer carries less weight for the base than it did for Strong
>   Focus. Still needed for pivots and for athlete day-shuffling.
>
> ⚠️ **The product direction is not specced and not started.** Nothing in this work order changes
> except the order. Do not begin new-plan work from this banner.

Six stages. One terminal session each. **They run in the re-ordered sequence above.**

**The evidence for all of it is `docs/REPORT-session-structure-and-clumping-2026-08-20.md`.**
Read that first. This file is the sequence, not the findings.

---

## Why this exists

Four bugs were found on 2026-08-19 and four more on 2026-08-20. Every one of them is the same
thing: two copies of one fact, and code comparing them.

- how many rides the athlete asked for — nine names
- how long a session is — three places say it, and the last one silently wins
- which day the barbell goes on — five engines, two different laws
- the athlete's threshold pace — the learner said one thing, the typed 5K another, nothing compared them

Nothing in the code stops a second copy being made. So every session that adds a screen adds one,
reasonably, and the disagreement only shows up months later.

**The engines are not the problem. Not retiring them is.** `week-model` is the fifth placement
engine. The other four are still live and reachable — about 7,000 lines. A new screen has to pick
one, and the pick is invisible.

⛔ **So this is not new architecture. It is finishing three swaps that were started and left.**

---

## The rules, all six stages

0. ⛔ **THE ORDER IS 1 · 4 · 5 · 2 · 3 · 6** (re-ordered 2026-08-21 — see the banner at the top).
1. **ONE STAGE AT A TIME. Finish it, stop, write the notes, then take the next instruction.**
   ⚠️ **Revised 2026-08-21 (Michael): a single terminal may carry several stages** — it does not have
   to be a fresh session each time. What is NOT optional is the pair above: **one stage at a time,
   and the notes written before the next one starts.** The notes exist to put facts on disk before a
   context window loses them; a long-running session needs that discipline MORE, not less.
2. **Each terminal writes its own notes** — findings, what shipped, what is still unverified — into
   its own dated file in `docs/`. Do not edit another stage's file.
3. **When your stage ships, replace the banner at the top of `docs/ENGINE-STATE.md`** with the next
   stage's job. One banner. Delete the old one, do not stack it.
4. **The 61-shape sweep is the gate.** `~/.deno/bin/deno run --allow-read --allow-write
   scripts/dump-plans.ts`. Say how many of the 61 changed and why. If a stage is not meant to change
   any, all 61 must be byte-identical.
5. **Mutation-test every new test.** Break the code the test covers; if the test still passes, the
   test is worthless. Two of three test files written on 2026-08-19 passed with the code deleted.
6. **Report the three states separately: pushed · deployed · verified on a device.** Never "shipped".
7. **Do not tune anything to Michael's numbers.** His exports are how bugs are found, not what
   correct looks like. Verify across the sweep and a range of athlete shapes.
8. **Edits are free. Commit, push and deploy wait for Michael. Every time.**

---

## Stage 1 — sessions get a warm-up, and one place owns their length

**Start here. This is the safety one and the smallest.**

Today a quality session states its length three times: the number the weekly budget subtracts, a
duration field, and the token that expands into steps. `materialize-plan:3745` recalculates the
duration from the expanded steps and overwrites the rest — so only the token is real, and the budget
subtracts a number nobody keeps.

Measured, from the report:

```
session            budget   token expands to   short
Threshold Run        45           23            22
Threshold Ride       45           24            21
Bike Intervals       45           32            13
Flat Sprints         35           14            21
```

The hill sessions bracket themselves and match to the minute. These four came from the 08-17/18 work
and do not.

⛔ **Flat Sprints is the dangerous one.** Six maximal 12-second efforts with no warm-up. It reaches
the watch that way — `send-workout-to-garmin:714` has a warm-up array and it is sent empty.

⚠️ **And the run week leaks the same 21 minutes with nobody noticing**, because running is measured in
miles: 18 asked, about 16.3 built.

**Build:** one thing that takes the core prescription plus the available budget and returns both the
whole session and the minutes the budget should subtract — from the same calculation. A session with
no warm-up stops being possible rather than being guarded against.

⚠️ **There must be a floor.** A week whose budget is entirely eaten by the long day must still not
prescribe a bare maximal sprint. The floor is the minimum; leftover budget decides how much more.

**Gate:** extend `dump-plans.ts` to assert that what the budget spent equals what actually got built.
⛔ **This check is half the value of the stage** — it is what would have caught this on 08-18, and
without it the same class returns.

⛔ **Do not** change which day anything lands on. Placement is stages 4 and 5.

---

## Stage 2 — the sports stop clumping

The week builds three runs Monday to Wednesday, then two rides Friday and Saturday.

The term meant to prevent that scores a clumped week and a perfectly alternating week **identically**
— the report ran the real scorer and every term in the vector came out the same, 54 against 54. The
winner is decided by which candidate happened to be enumerated first.

`interleaving()` asks "is one sport bracketed by the other". A week with an easy run early and the
long run on Sunday always answers yes, so every ride placement scores maximum.

⚠️ **`clustering()` looks like it already covers this and does not** — it only sees back-to-back days
between units whose sessions are ALL easy and the same sport. A hard Tuesday is invisible to it.
⛔ Read both before writing a third. The obvious name is taken by something narrower.

**Build:** count consecutive same-sport days, cyclically. The report measured 4 against 1 between the
two weeks.

⛔ **Weight it below the day off.** The ordering set on 2026-08-19 is `overCap 60` > `blank 40` >
`lockedDayExtras 24 + crowding 6`. A spread term that outbids 40 will start eating rest days, which
is the exact mistake made and caught that day.

**Gate:** the sweep. Say how many of the 61 moved and show one before/after.

---

## Stage 3 — the day pickers stop lagging

Michael: *"long run and ride sorta linger until they are clicked a couple of times."*

Reproduced. It is not a state bug — the taps register. `solveWizardWeek` runs the full placer
synchronously while the screen is drawing. Measured on his shape: **472 ms with nothing picked**,
53 ms once the long run is picked, 5 ms with both, 0.1 ms fully pinned. The card opens with nothing
picked, so the first tap is the slowest thing in the wizard. A phone is likely 3-5× that.

**Also found:** `NonRaceBuilder:4767` says `anchor-days.ts` locks the anchors, and the code below it
passes an empty `taken` — which is why the long run and long ride can both read Sunday.

**Build:** get the solve off the drawing path. Decide whether the empty `taken` is a bug or intended
before changing it — the comment and the code disagree and only one of them is right.

---

## Stage 4 — one shape for what the athlete asked for

**This is the big one. One sport at a time. Do not do all three in one session.**

"4 runs a week" travels under nine names across three deploy boundaries. Three separate "default to
2" clauses sit on that chain and only one of them logs when it fires — so a dropped answer never
appears as missing, it appears as a plausible plan built on a number nobody chose.

The three sports do not even share a shape: run is four loose numbers, bike is a nested object plus a
duplicate owner for its volume, swim is a bare count. The 1-4 limit is written out twice.

**Build:** one object, filled in once when the wizard finishes, with hard days already subtracted.
Everything downstream reads it and never recalculates.

**Order:** rides first — that chain is already fully mapped in the report. Then runs. Then swim.

**Gate:** all 61 shapes byte-identical at every step. This stage changes no behaviour at all.

⛔ **Then delete that sport's old variables in the same session.** A stage that adds the new thing and
leaves the old one is how there came to be five placement engines.

---

## Stage 5 — delete what the last swap left behind

**Riskiest. Do it last, and only after stages 1 and 4 have been seen working on a device.**

The engine swap left twelve unreachable branches. `solveWithWeekModel` has two returns and neither is
`unsolvable` — its own comment says so. The composer tests for that word thirteen times.

⛔ **One of those dead branches is a rule Michael made.** The loop at
`strength-primary-plan.ts:3309` drops a hard day when the week cannot hold everything — *the hard day
yields, the bar does not*, with his own week named as the case. **It has not run since the swap.**

`place-week.ts` — 436 lines — is reachable only from the dead branch.
`easyRunAnchorAdjacencyPenalty` is imported and never called, which drags all 2,434 lines of
`week-optimizer` into the bundle.

⛔ **NEEDS MICHAEL BEFORE IT STARTS:** should an engine-chosen hard day still yield when the week
cannot hold it, or is build-and-warn now the rule for both? His 2026-08-17 ruling was about days the
athlete pinned. **Recommendation: build-and-warn for both, delete the loop, and re-express the case
it protected as a scored preference.** Not decided yet.

**Gate:** delete only what is provably unreachable. Prove it per branch, in writing, before removing
it.

---

## Stage 6 — does the app still say when it had to compromise

Across all 61 shapes, zero compromise notes of any kind. No breach, no shortfall, no rest-day note.

⚠️ **Context the report does not have:** on 2026-08-19 that channel fired on 27 of 61, and **every one
was a false ride-shortfall note that was fixed that day** (`76e66f4a`). So zero is the expected
result of that fix — not proof the channel is broken. But nothing has exercised it honestly since.

**Do:** build one deliberately over-subscribed week by hand and see whether it speaks. If it does not,
find out why. `D-325 §7` is *state the cost, never refuse* — right now it never refuses and never
states a cost, and silence cannot tell those apart.

---

## Two smaller things, whichever stage touches them

**a.** The wizard preview said `Flat Sprints 35m`, the built plan said `14m`. Stage 1 probably makes
this one question: if the preview was estimating a wrapper the composer never built, **the preview was
right**. Confirm rather than assume.

**b.** The saved preference says the hard-run terrain is `hill_3min` while the plan correctly built
Flat Sprints. `qualityRunTerrain` defaults to `hill_3min` and the wizard stopped asking on 08-18; the
per-slot stamp was deleted that day but `NonRaceBuilder:1187` still seeds `preferred_days`. It matters
at `create-goal:2837`, the older fallback, which would stamp a hill session over the sprints.
