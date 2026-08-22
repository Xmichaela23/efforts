# Stage 2 — the sports stop clumping

**2026-08-21 · one stage, notes written before the next starts.**
Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` stage 2. Evidence: `REPORT-session-structure-and-clumping-2026-08-20.md` §1.

## STATE — three ways, all three NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. Stages 4 and 5 are also still unpushed in this tree. |
| **deployed** | **NO.** No edge function, no Netlify, no iOS. |
| **verified on a device** | **NO.** No plan built on a phone. Everything below is tests, probes and the sweep. |

## The sweep — 58 of the 61 moved, and every one of them improved

⚠️ **This stage is MEANT to move shapes** — a spread term that changed nothing changed nothing.

| | |
|---|---|
| shapes that changed | **58 of 61** |
| adjacency improved / unchanged / **worse** | 51 / 10 / **0** |
| total adjacency, week 1 | **117 → 39** |
| across all 12 weeks (732 week-instances) | **1419 → 471, worse in 0** |
| shapes that lost a blank day | **0** |
| shapes with no blank day at all | **0** (before: 0) |

### One before/after — `M__hybrid-balanced_2hard_vo2`, week 1

```
BEFORE  (adjacency 2)                          AFTER  (adjacency 0)
  Monday     Bench Press                         Monday     Bench Press
  Tuesday    Back Squat  +  Hill Repeats         Tuesday    Deadlift+Press  +  Threshold Ride
  Wednesday  Easy Run                            Wednesday  Easy Run
  Thursday   —                                   Thursday   —
  Friday     Deadlift+Press  +  Threshold Ride   Friday     Back Squat  +  Hill Repeats
  Saturday   Long Ride                           Saturday   Long Ride
  Sunday     Long Run                            Sunday     Long Run
```

Before: Tue hard **run** beside Wed easy **run**, and Fri threshold **ride** beside Sat long **ride** —
two same-sport pairs. After: the two hard sessions swap days, so the runs are Wed/Fri/Sun and the
rides are Tue/Sat. **Thursday's rest day is untouched, and so is the lifting week's shape.**

---

## What was built

`sportAdjacency` in `_shared/week-model/resolve.ts`: for each sport, the DAYS carrying at least one
endurance session of it, then the cyclically adjacent pairs among those days.

```
as built     runs {Mon,Tue,Wed,Sun} rides {Fri,Sat}  ->  (Mon,Tue)(Tue,Wed)(Sun,Mon)(Fri,Sat) = 4
alternating  runs {Mon,Wed,Fri,Sun} rides {Tue,Sat}  ->  (Sun,Mon)                            = 1
```

⚠️ **Per day, not per session.** Two runs on one Tuesday is one run-day; `sameSportDoubles` (weight
20) owns that case because it is data loss downstream, not a shape question.

⚠️ **Cyclic**, because the week repeats — the same shape `stressorStreakExcess` already uses.

**`interleaving` and `clustering` are deleted, absorbed into it** — the report's own instruction. Why
each was blind:
- `interleaving` asked *"is one sport bracketed by the other"*. A span, not neighbours. A week with an
  easy run early and the long run on Sunday answers YES for nearly every ride placement, so the
  **clumped week scored the maximum**.
- `clustering` only saw units whose sessions are **all `easy`**, so a hard Tuesday made Mon-Tue-Wed
  invisible. ⚠️ Its name is why nobody looked further for three months.

---

## ⛔ THE WEIGHT IS 4, NOT THE 6 THE BRIEF PROPOSED — AND THE REASON IS A MEASURED CLIFF

The brief's bound was `2w < 40`: moving one session into a blank day removes at most two adjacencies,
and the blank day is worth 40. That bound is real and 6 satisfies it.

⛔ **It is not the binding constraint.** `resolve` scores the WHOLE week, so a spread term can pay to
move a **lift** — and the terms holding the lifting week's shape are far weaker than 40. `bunching`,
which prefers heavy legs more than the 48h floor, is weighted **1**.

Measured across the weight range, everything else untouched:

| weight | result |
|---|---|
| 2, 3, 4 | 51/61 improve, 0 worsen, 0 rest days lost, **the bar never moves** |
| 5 and up | the bar moves: Wendler's L·U·L three-day week (2nd ed. p.11) came back **L·L·U**, and heavy legs went from 72h apart to 48h — one adjacency bought for one point of `bunching` |

At 6 the suite showed it directly: `⛔ THE THREE-DAY WEEK ALTERNATES WHEN NOTHING PINS IT` and
`heavy leg days are held apart — 48h is the floor, and the solver must beat it` both failed.

⛔ **Raising `bunching` to protect the bar instead was tried and is worse.** At `bunching * 8` the
alternation comes back and a week loses its second rest day to crowding; escalating it (`** 2 * 6`,
the `crowding` shape) does the same. **Every variant traded one regression for another.** The answer
was to make the new term weak enough, not the other terms stronger.

**4 is the highest weight at which this term can only ever choose between weeks that place the bar
identically** — which is what "a preference that sits below the law" is supposed to mean. At 4 the
report's two weeks separate by 12 points where they used to tie at 54.

---

## ⛔ A FINDING THAT NEEDS A RULING — Q-215 HAS NO MECHANISM, AND HAS NOT SINCE THE SWAP

Two tests failed at weight 6 and I traced why rather than tuning past them:

- `⛔ Q-215 SURVIVES — a clean upper day is preferred over a heavy-leg day on a tie`
- `⛔ A CLEAN UPPER DAY IS PREFERRED OVER A HEAVY-LEG DAY WHEN THEY OTHERWISE TIE`

Q-215's mechanism is the composer's two-solve comparison: solve once, then solve again with the heavy
leg days passed as `flexibleAvoid`, and take the avoided answer when it costs nothing. ⛔ **The
week-model adapter ignores `flexibleAvoid`** — its own header says so (*"`flexibleRanking`,
`flexibleAvoid`, `preferredClearance` … have no equivalent here and are IGNORED, not emulated"*).

**Measured: `flexibleAvoid` changed the answer in 0 of 126 shapes.** The two solves are identical, so
`takeAvoided` is always true and the composer returns the same week it already had — at twice the
solve cost.

⚠️ **So those two tests were passing by coincidence**, and at weight 6 my term moved the coincidence.
They pass again at 4, also by coincidence.

⛔ **This is a fourteenth dead branch and it belongs to the same class stage 5 cleared.** It is NOT
fixed here — stage 2's scope is the spread term, and re-expressing Q-215 as a real resolver term is a
product decision about ordering (does "an easy run prefers a clean upper day" outrank "the runs
spread"?). **Michael's call.** Recommendation: express it as a small resolver term BELOW
`sportAdjacency`, and delete the inert two-solve comparison either way.

---

## A test that encoded the superseded measure

`run and ride ALTERNATE across the free days...` (`strength-primary-plan.test.ts`) asserted that a
ride falls strictly **between** the first and last run. ⛔ That is `interleaving()` in test form.

It **passed** on `runs Wed/Fri/Sat + rides Thu/Fri` — the rides adjacent to each other — and **failed**
on `runs Wed/Fri/Sat + rides Mon/Wed`, which is the better week by any reading of what the test says
it is for. A test written on a blind measure inherits the blindness. Rewritten to assert cyclic
same-sport adjacency: rides never consecutive, runs at most one adjacency.

⚠️ **The run allowance of one is deliberate.** With three runs and a long day pinned to the weekend
there is not always a fully alternating answer, and forcing one would be the spread term outbidding
the athlete's own long day.

---

## Verification

| suite | before | after |
|---|---|---|
| `_shared/` | 1847 passed, 1 failed | **1855 passed, 1 failed** (+8 new) |
| `shared/strength-system/` | 574 passed, 0 failed | **574 passed, 0 failed** |
| `src/` under deno | 712 passed, 3 failed | **712 passed, 3 failed** |
| `npx vite build` | clean | clean |
| `tsc --noEmit -p tsconfig.app.json` | 312 errors | **312 errors** |

The 4 failures are pre-existing and stash-verified in earlier sessions:
`_shared/anchor-resolver-lint.test.ts`, `src/lib/club-anchor.test.ts` ×1,
`src/lib/non-race-goal-seeds.test.ts` ×2.

`score` and `sportAdjacency` are now **exported for tests**. ⚠️ The trace report had to measure this
defect on *"a copy with the private terms exported; the repo is untouched"* — a finding that needs a
modified copy of the file to reproduce is a finding nobody can pin. Nothing in production calls
either; `resolve` is the entry point.

### New tests — `_shared/week-model/sport-adjacency.test.ts` (8), all mutation-tested

| mutation | result |
|---|---|
| the term removed (`* 0`) | 6 failed |
| adjacency not cyclic | 2 failed |
| the `all-easy` load filter comes back (`clustering`'s blindness) | 2 failed |
| sports not distinguished | 5 failed |
| one entry per session instead of per day | 2 failed |
| the term also charges the day itself | 2 failed |
| weight raised to 14 / 44 (outbids the day off) | 1 failed |

⛔ **Three of those mutations survived the first draft and the tests were rebuilt, not the results
excused.** Recorded because the pattern is the point:

1. **The per-day claim** was asserted through the total score, where `sameSportDoubles` at 20 swamps
   anything this term does. Two different per-session mutants passed. Now asserted on
   `sportAdjacency` directly.
2. **The day-off bound** was asserted as "six runs + a blank day beats seven runs" — but the extra run
   ADDS adjacency, so the term agreed with the rest day for the wrong reason and **weight 100 passed
   it.**
3. **The second attempt** ran through `resolve` with four runs and three lifts — and the rest day
   there is held by the `minRest` floor (a −500 penalty on `recoveryDaysOf`), not by `blank * 40`, so
   the weight never got to compete. **Weight 100 passed that too.**

   It is now asserted as the arithmetic it actually is: the most this term can swing between two
   arrangements of the SAME sessions must stay under 40.

---

## For stage 3 (next)

- **`interleaving` and `clustering` no longer exist.** If anything reaches for them, it wants
  `sportAdjacency`.
- **`score` is exported.** Measure against the real scorer; do not copy the file.
- ⛔ **Q-215 needs a ruling** (above) before anyone "fixes" the two tests that depend on a coincidence.
- ⚠️ Stage 4's run and swim halves are still owed; `AthleteWeeklyIntent` has a `bike` key only.
