# Stage 5 — delete what the last swap left behind

**2026-08-21 · one stage, notes written before the next starts (work order rule 1, as revised today).**
Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` stage 5. Evidence: `REPORT-session-structure-and-clumping-2026-08-20.md` §2.1, §2.2.

## STATE — three ways, all three NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. Stage 4's ride work is also still sitting unpushed in the same tree. |
| **deployed** | **NO.** No edge function, no Netlify, no iOS. |
| **verified on a device** | **NO.** No plan built on a phone. Everything below is code, tests, probes and the sweep. |

**Sweep: 0 of the 61 moved.** Byte-identical. 61 built, 0 failed, `budget-equals-built: 0 violations`.
Nothing deleted was reachable, so nothing could move — that is the claim and the sweep is what backs it.

---

## ⛔ MICHAEL'S RULING, AND IT CHANGED THE STAGE

Asked before building, as the stage required. He ruled:

> *"No dropping sessions. Delete the yield loop. Always build the week the athlete asked for and tell
> them what it costs."*

And on the copy: *"The existing yield copy says a session 'was left out' — rewrite it, since nothing
is left out now. It should say what's tight and why."*

⚠️ **He first said to REVIVE the yield and then reversed it on the measurement below.** Recording both
halves because the reversal is the useful part: the loop was not revivable at the trigger it was
written for.

### What the measurement showed

The old trigger, `unsolvable`, meant **no legal week exists**. The week-model adapter has two returns
and cannot produce it. The live equivalent, `compromised`, means something different: *here is the
best week, and here is the debt still outstanding on it.* Under the debt model that is the **normal**
outcome of a crowded week, not an impossibility.

Measured over every distinct-day anchor shape on the three-day lift week:

| | shapes | clean | breached | a yield would fire on | …dropping BOTH hard days |
|---|---|---|---|---|---|
| two hard days + both long days | 840 | 84 (10%) | 756 | 476 (57%) | **280** |
| one hard day + both long days | 210 | 70 (33%) | 140 | 70 (33%) | 0 |
| one hard day, long run only | 42 | 28 (67%) | 14 | 14 (33%) | 0 |

**Every breach in that space is an 18h or 24h residual. Not one is the 48h impossibility the old copy
described.** And the loop dropped from the END of the anchor list, not from the cause: long run Mon,
long ride Tue, hard run Wed, hard ride Sat — the breach is the squat against the long RIDE, and the
loop takes the Saturday ride and then the Wednesday run, neither implicated.

⚠️ **Michael's own week — the case named in the composer as the reason the loop existed** (hard ride
Tue, hard run Fri, long ride Sat, long run Sun) — **solves clean today, no breach, nothing to yield.**
The debt model permits a heavy lower lift to share a day with a hard ride behind a gap where the old
slot model banned it outright.

⚠️ **`week-solver.ts:299` already said this.** *"THE MENU IS TWO OPTIONS… Dropping a session is NOT on
it and never will be — see §5.2b. Three shipped modules subtracted silently."* The ruling agrees with
a rule the codebase had already written down.

---

## The proof, per branch, before removal

**The root fact.** `_shared/week-model/solver-adapter.ts` has exactly **two** `return` statements —
`{ status: 'solved' }` and `{ status: 'compromised' }` — and there is **no `throw` anywhere in
`week-model/`**. So the only other exit is an exception, which would reach the caller as a crash, not
as `unsolvable`.

| # | branch | why it is dead | action |
|---|---|---|---|
| 1 | the hard-day yield `while` loop | trigger cannot occur; `yieldedHardDays` always `[]` | **deleted** (ruling above) |
| 2 | `heavyLegDaysForAvoid`'s unsolvable ternary | same | collapsed |
| 3 | `selfAdjacentCount`'s guard | same | deleted |
| 4 | `impactAfterLongRun`'s guard | same | deleted |
| 5–7 | `plain.status !== 'unsolvable'` ×2, `avoided.status !== 'unsolvable'` | same | collapsed |
| 8 | the yielded-hard-day filter in the read-back | `yieldedLabels` always empty | deleted |
| 9 | `solved.status === 'unsolvable'` in the read-back | same | deleted |
| 10 | the `placeLiftingWeek` fallback in `placedWeek` | same | **deleted — the second placer is out of the bundle** |
| 11 | `solverRefusal` | breach arm unreachable; else arm is `solved.notes`, and the adapter returns `notes: []` on BOTH returns → `[]` always | deleted |
| 12 | `dayForLiftTest`'s ternary | same | collapsed |
| 13 | `solvedFlexible`'s ternary | same | collapsed |

### ⛔ A THIRTEENTH THE REPORT MISSED — the reduction ladder

`solveWithFlexible`'s `for (let n = flexibleWanted.length; n >= 0; n--)` dropped one easy session off
the tail each pass until the solver stopped refusing. **Every path through the body returns on the
first iteration**, so the counter has never decremented. The report counted twelve `if`s; this one is
a loop, which is why it was not on the list. Collapsed to a straight line — a loop that runs exactly
once reads as a live fallback and is not one.

⚠️ **The ride-shortfall note depended on it**, which is why the report measured that note firing on 0
of 61. **Left in place for stage 6**, which owns the compromise channel — deleting it too would
remove the only thing that could ever tell an athlete a session did not fit.

### ⛔ THE TYPE WAS WHAT KEPT ALL THIRTEEN COMPILING

`solveWithWeekModel` was declared `: SolverResult`, a union carrying an `unsolvable` arm this adapter
has never returned — a fact its own comment stated in prose while the type contradicted it. That gap
is why every dead `if` type-checked, narrowed correctly and read as live.

**It now returns `WeekModelResult = Extract<SolverResult, solved | compromised>`.** Writing a
fourteenth `status === 'unsolvable'` test against this adapter now fails to compile. ⚠️ The
`unsolvable` arm stays in `SolverResult` itself — the real `week-solver` returns it and
`assign-days-solver` / `strength-system/placement` still read it.

### `place-week.ts` — 436 → 126 lines, NOT deleted, and the report's line was imprecise

The report says *"`place-week.ts` — 436 lines — is reachable only from the dead branch."* Only the
PLACER is. The file also exports `DayName`, `DAYS`, `EndurancePin` and `MIN_STACK_GAP_H`, all
imported and live in the composer. Proven per symbol:

| symbol | production readers | outcome |
|---|---|---|
| `placeLiftingWeek` | 0 (composer's call was the dead arm) | deleted |
| `requiredClearanceHours` | 0 — a one-line wrapper on `requiredAdjacencyHours` | deleted |
| `resolveStacking`, `stackGapHours`, `clearanceHours`, `lowerDayPenalty` | 0 | deleted |
| `MAX_ACTIVE_DAYS`, `LiftSlot`, `StackResolution`, `PlacedWeek` | 0 | deleted |
| `DayName`, `DAYS`, `EndurancePin`, `MIN_STACK_GAP_H` | composer | **kept** |

⚠️ Every apparent hit outside the file was a **comment**, checked one at a time — `week-solver.ts`
mentions `place-week.resolveStacking` in prose, `schedule-session-constraints.ts` mentions
`requiredClearanceHours`, three test files mention `MAX_ACTIVE_DAYS` in comments. Only
`place-week.test.ts` imported them.

### The dead import

`easyRunAnchorAdjacencyPenalty` was imported at `strength-primary-plan.ts:107` and **never called** —
the four other mentions are comments recording that the second scorer it belonged to was deleted. The
import alone pulled all **2,434 lines of `_shared/week-optimizer.ts`** into the strength bundle. Gone.
⚠️ The function is not deleted; `week-optimizer` is live on the race/tri/combined path.

---

## The copy, rewritten

**Was** (never printed — it was fed by `yieldedHardDays`, which the dead loop never filled):

> *"Your hard run was left out this block: … there was no day left that kept heavy legs 48h clear of
> the long run. The lifting keeps its spacing; the hard session is the one that gives way."*

**Now** — `tightWeekCompromises`, first in the list, `kind: 'cost'`, fires when the week comes back
`compromised`:

> *"Everything you asked for is built this week, and it is tight. Your long days and hard days are
> where you put them, so the lifting sits closer to them than its clearances ask for — each shortfall
> is named with the hours outstanding and the day it clears. Nothing was dropped to make the week
> fit."*

The per-breach lines from the resolver follow it, carrying the unit, the hours and the clearing day.
Rendered under one "What this week costs" paragraph by `strength-focus-copy.ts`.

⛔ **It names the situation, not the numbers, deliberately.** Restating them would mean parsing our
own prose, and `strength-focus-copy.ts` carries the scar from exactly that: a dedup keyed on wording
broke silently the day the wording was tightened. If this line ever needs a number, give the adapter
a structured field.

---

## ⚠️ A FINDING THAT CONTRADICTS THE REPORT

Report §2.3: *"THE ENTIRE COMPROMISE CHANNEL IS SILENT — MEASURED, 61 OF 61."*

**That is true of the sweep and false of the space.** Built 10,976 shapes by hand: **10,080 carried a
compromise.** The channel is loud. The 61 sweep shapes simply do not contain a crowded week — every
one of them places its long and hard days sensibly.

⛔ **This matters for stage 6**, whose whole premise is that silence is ambiguous. It is not ambiguous
for breaches — they fire, and they fire correctly. What remains unobserved is the ride-shortfall note
and the no-rest-day note. Stage 6 should build its over-subscribed week from the shapes above rather
than from the sweep.

---

## Verification

| suite | before | after |
|---|---|---|
| `shared/strength-system/` | 583 passed, 0 failed | **574 passed, 0 failed** (−13 deleted `place-week.test.ts`, +4 new) |
| `_shared/` | 1844 passed, 1 failed | **1847 passed, 1 failed** (+3 new) |
| `src/` under deno | 712 passed, 3 failed | **712 passed, 3 failed** |
| sweep | 61/61 | **61/61, 0 of 61 moved** |
| `npx vite build` | clean | clean |
| `tsc --noEmit -p tsconfig.app.json` | 312 errors | **312 errors** |

The 4 failures are pre-existing and were verified by stashing in the previous session:
`_shared/anchor-resolver-lint.test.ts` (the `lthr::TrainingBaselines.tsx` ledger entry named in the
ENGINE-STATE banner), `src/lib/club-anchor.test.ts` ×1, `src/lib/non-race-goal-seeds.test.ts` ×2.

**Net: 342 lines added, 724 deleted** under `supabase/functions`, plus the 199-line dead test file.

### New tests, and every one mutation-tested

**`shared/strength-system/hard-day-no-yield.test.ts`** (4) — the ruling itself. Mutations, all caught:

| mutation | result |
|---|---|
| the tight line never fires | 2 failed |
| the tight line fires on every week | 1 failed |
| the frame is placed last instead of first | 1 failed |
| the copy claims a session was left out / gives way | 2 failed |
| the copy trips the voice check ("Focus on…") | 1 failed |
| a hard day is dropped again (`gatedHardDays.slice(0,1)`) | 1 failed |

**`_shared/schedule-session-constraints.clearances.test.ts`** (3) — ⚠️ **a MOVE, not a new test.**
These assertions lived in the deleted `place-week.test.ts` and reached the shared table through the
dead wrapper. The wrapper was dead; the law is not. Deleting a dead engine must not quietly delete
the only assertion that its law still holds. Mutations, all caught:

| mutation | result |
|---|---|
| long-run clearance 48h → 24h | 1 failed |
| quality-run clearance 24h → 0h | 1 failed |
| `long_ride × lower_body_strength` made asymmetric | 1 failed |
| the 6h floor stops being scoped to leg-vs-leg | 1 failed |
| `requiredAdjacencyHours` drops its leg gate | 2 failed |

**The descent invariant, re-pointed** (`strength-primary-plan.test.ts`) — it ran through
`placeLiftingWeek`, so it enumerated an engine that has not built a week since the swap, AND it
enumerated four separate lifts, a shape deleted on 2026-08-16. It now asks `solveWithWeekModel` with
the three lifts the composer actually sends. **The invariant survived the engine change: 0 of 10
shapes would jog.** A `heavy.length === 2` assertion was added so it cannot pass vacuously.

| mutation | result |
|---|---|
| `descentIsJogged` reads the long-RIDE clearance | 3 failed |
| `descentIsJogged` uses `some` instead of `every` | 1 failed |
| adapter maps `long_run` to an `easy` load | **survived** |

⚠️ **That last one survived and it is not a weak test — it is the wrong probe.** The invariant holds
because the live model places a heavy day ON the hill day as an ordered stack, so the gap is 0 and the
descent is walked whatever the long run costs. Recorded rather than papered over: this test does not
cover the 48h long-run clearance, and a future reader should not assume it does. That clearance is
covered directly in the new clearances test.

---

## For stage 2 (next), and what it will trip over

- **`solveWithWeekModel` returns `WeekModelResult`, not `SolverResult`.** `status === 'unsolvable'`
  against this adapter no longer compiles. That is deliberate.
- **`solveWithFlexible` no longer loops.** If stage 2's spread term needs to compare candidate weeks,
  it has one solve to work with, not a ladder.
- **`place-week.ts` is a vocabulary file now** — `DayName`, `DAYS`, `EndurancePin`,
  `MIN_STACK_GAP_H`. It places nothing.
- **The compromise channel is live and loud** (see the finding above). A new score term that changes
  placement will change breach text on crowded weeks even when the sweep stays byte-identical.
- ⚠️ **Stage 4's run and swim halves are still owed.** `AthleteWeeklyIntent` has a `bike` key only.
