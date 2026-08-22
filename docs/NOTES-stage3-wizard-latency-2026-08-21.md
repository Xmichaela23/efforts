# Stage 3 — the day pickers stop lagging (plus three rulings)

**2026-08-21.** Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` stage 3.
Evidence: `REPORT-session-structure-and-clumping-2026-08-20.md` §2.

## STATE — three ways, all three NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. Stages 2, 4 and 5 are also unpushed in this tree. |
| **deployed** | **NO.** No edge function, no Netlify, no iOS. |
| **verified on a device** | **NO.** ⛔ And this stage is the one where that matters most — see *What is not verified*. |

**Sweep: 0 of the 61 moved.** This stage changes WHEN the solve runs, not what it returns, and all
three rulings are behaviour-neutral for the composer. The Q-215 deletion was isolated and measured
separately: **0 of 61.**

---

## THE THREE RULINGS

### 1. The ride count is 4 — both remaining pickers raised

`NonRaceBuilder`'s schedule-step count row and its standalone bike step both offered 1/2/3 while the
volume card offered 1/2/3/4 and the wire validator accepted 4. Both now read `RIDE_DAYS_CHOICES`.

Michael's framing, recorded because it is the reason this was not a design change: *"fixing an
internal contradiction — the volume card and the validator already say 4, and Viada's cycling
programs use five or six rides a week."* Four was never a stretch; it was a stale cap.

**All six statements of that range now read one constant.**

### 2. `RIDE_HOURS_DEFAULT = 2` is kept, and now says where it comes from

It was flagged on 2026-08-21 as *"the last unowned number on the ride chain"*. The ruling is to keep
it and record the provenance: it is **the bottom of Viada's own entry-level cycling dose** — roughly
an hour for the hard ride and an hour to ninety minutes for the easy one, across two rides. Viada's
Level 1 cycling endurance (p239) is a 60–100-min easy ride below 75%, with a comparable quality
session beside it.

⚠️ It is still ours and still says so: `hoursSource: 'default'` is stamped on it and
`generate-strength-plan` logs when it fires. A defensible default is still a default.

### 3. The Q-215 double-solve is deleted — and it took a third solve with it

The composer solved the week, then solved it again with the heavy leg days as `flexibleAvoid`, then
compared. ⛔ The adapter ignores that field — **measured: 0 of 126 shapes changed.**

Michael declined the offer to re-express it as a resolver term: *"What it was trying to do — keep
heavy leg days apart — is already done live by `bunching`. Rebuilding it means two owners for one
fact, which is the disease this work order exists to cure."*

⛔ **AND A THIRD SOLVE WENT WITH IT, which I had not counted.** A lift-only pre-solve stood above it
for one reason: Q-215 needed the heavy-leg days before it could ask for them to be avoided, and lift
days only come out of a solve. **So every composed block ran three solves and two of them changed
nothing.** The composer now runs exactly one.

⚠️ **This did NOT help the wizard, and my own comment claimed it would — corrected.** The three solves
were server-side. The wizard makes its own call into `week-model/resolve`.

---

## ⛔ RE-MEASURED FIRST, AS INSTRUCTED — AND THE PROBLEM WAS NOT MOSTLY GONE

Desktop V8 (Deno 2.9), Michael's shape — 2 hard days, 4 runs, 2 rides, mean of 5 runs after a warm-up:

```
  nothing picked        457-472 ms        long run picked    50.6 ms
  both long days pinned     4.9 ms        fully pinned        0.1 ms
```

**Essentially unchanged from the 472 ms the trace report measured.** Stages 2, 4 and 5 did not touch
it, and neither did deleting the composer's two redundant solves.

⚠️ Why the unpinned case is the expensive one: `resolve` exhaustively searches only the units that can
break the law, and with nothing picked that is three lifts + two hard days + both long days — seven
free constrained units, 7^7 candidates. Pin the long run and it is 7^6 and 50 ms.

### ⛔ AND THE REAL DEFECT WAS WORSE THAN THE REPORT'S NUMBER

The report measured the schedule card. It did not measure the steps before it. The memo was
**ungated**, and its dependency list includes `runDays`, `rideDays` and `swimDays`:

```
  volume step: tap "4 runs"       78.5 ms
  volume step: tap "2 rides"     922.5 ms     <-- on a screen that never reads the answer
  hard-day step: add hard run    823.6 ms
  hard-day step: add hard ride   693.1 ms
```

**Tapping a ride-count chip on the volume step cost 922 ms on a desktop** — three to five times that
on a phone — for a suggestion nobody reads until two screens later. That is the chip that "lingers".

⚠️ Nothing outside the `schedule` step consumes the result: the two long-day pre-fills, the hard-day
pre-fill and the health badge are all already gated to it. The memo simply was not.

---

## What was built

**a. The solve is gated to the step that reads it.** Off `schedule`, `IDLE_WIZARD_WEEK` stands in —
the same no-opinion shape `solveWizardWeek` already returns from its own catch, with a stable
identity so the pre-fill effects do not re-fire. ⛔ **This deletes the 922 ms, 823 ms and 693 ms taps
outright rather than making them faster.**

**b. It is deferred off the paint.** `React.useDeferredValue` re-renders with the previous input
first, so a tap paints immediately and the new solve runs at low priority.

**c. And the first render of the step is armed a frame later.** ⚠️ `useDeferredValue` alone does not
cover this: on React 18 it returns the value unchanged when there is no previous one, so arriving at
the schedule card would still pay the full unpinned solve before its first paint. (React 19's
`initialValue` argument exists for exactly this; this project is on 18.3.1.) `solveArmed` flips on the
next animation frame instead. **The card paints once with no suggestion and the days fill in.**

⚠️ Deferred, not debounced — a debounce delays the answer by a fixed amount whether or not it is
needed. And it does not make the solve interruptible: React cannot slice a synchronous `useMemo`.
What it buys is that the TAP is never behind it.

---

## The empty `taken` — a bug on one row, a ruling on the other

The work order asked for a decision before a change. **Both, and they are different:**

**`taken={{}}` on the LONG-DAY rows is a bug.** The comment directly above it says *"`anchor-days.ts`
answers this for all three, so the lock is not re-derived here. A day another anchor holds renders
NAMED, never merely dead"* — and the code passed an empty object. Evidence it is the code that was
wrong, not the comment:
- `anchorDaysTaken` exists and has six tests, including the exact case (`{longRunDay:'sunday'}` →
  `{sunday:'long run'}` for the long-ride question).
- The `DayPicker` calls on the standalone run and bike steps **in this same file** already pass it.
- `strength-primary-plan.ts` keeps a backstop for this collision and its own comment says where the
  fix belongs: *"the real fix is at input — the day picker greys out and locks a day another anchor
  already holds, so the collision is never entered."*

**`taken={{}}` on the HARD-DAY row is intended.** Its own comment is a ruling: *"⛔ NOTHING IS
DISABLED. The other slot's day is NOT locked: two hard sessions on one day still builds as one, and
the PLAN says so — a lock made it look like a broken button."* Two hard days on one date is a legal
week the composer reports on; two LONG days on one date is the pin collision.

⛔ **So the two rows now disagree on purpose, and a test exists to stop the next session "making them
consistent".**

⚠️ `taken` locks as well as labels (`WeekDayRow`: `off = disabled || !!heldBy`), and the active
question's own day is never in it — so the athlete can always release what they chose.

---

## ⚠️ WHAT IS NOT VERIFIED, AND IT IS MORE THAN USUAL

⛔ **Every change in this stage except the Q-215 deletion lives in React, and React does not run
here.** `npx vitest run` fails on all 363 files (its ESM loader rejects the `https:` deno-std imports
the shared modules use; there is no vitest config and no `test` script). `deno test src/` runs the
pure modules but cannot render a component.

**So these are asserted at the source and NOT executed:**
- that the tap paints before the solve (`useDeferredValue`),
- that the schedule card's first paint no longer waits (`solveArmed` on the next frame),
- that the long-day rows now render the other anchor's day as taken.

⛔ **A device check is what would settle it**, and the shape to use is the one measured above: keep
run + bike, four runs, two rides, two hard days, and tap the ride-count chip on the volume step. It
should be instant now; it was 922 ms on a desktop.

⚠️ The measurements themselves are honest — they run the real `resolve` with the real unit shapes —
but they measure the SOLVE, not the render.

---

## Verification

| suite | before | after |
|---|---|---|
| `src/` under deno | 712 passed, 3 failed | **717 passed, 3 failed** (+5 lint) |
| `_shared/` | 1855 passed, 1 failed | **1855 passed, 1 failed** |
| `shared/strength-system/` | 574 passed, 0 failed | **574 passed, 0 failed** |
| sweep | 61/61 | **61/61, 0 of 61 moved** |
| `npx vite build` | clean | clean |
| `tsc --noEmit -p tsconfig.app.json` | 312 errors | **312 errors** |
| `npx eslint` on `NonRaceBuilder.tsx` | 1 error 1 warning | **same, both pre-existing** |

The 4 failures are pre-existing and stash-verified in earlier sessions.

### New tests — `src/lib/wizard-day-lock.lint.test.ts` (5), all mutation-tested

⚠️ **A SOURCE LINT IS WEAKER THAN A RENDER TEST AND THE FILE SAYS SO.** It proves the call is
written, not that the screen behaves. `_shared/anchor-resolver-lint.test.ts` is the precedent — this
repo already guards a rule it cannot execute by reading the source.

| mutation | result |
|---|---|
| the long-day lock reverts to `{}` | 1 failed |
| the hard-day row gains a lock (the "consistency" mistake) | 1 failed |
| the step gate removed | 1 failed |
| the deferral removed | 1 failed |
| the frame-arm replaced with `setTimeout` | 1 failed |
| the schedule row's ride chips back to `[1,2,3]` | 1 failed |
| the bike step's chips back to `[1,2,3]` | 1 failed |

⚠️ One earlier draft of the ride-picker rule passed on the schedule row because it looked for
`RIDE_DAYS_CHOICES.map` and that row reads the constant inside a ternary. It now asserts both halves:
the constant is present AND no literal range survives in the same window.

---

## For stage 6 (next)

- ⛔ **Do not measure the compromise channel on the sweep.** Stage 5 measured 10,080 of 10,976
  hand-built shapes carrying a compromise; the 61 sweep shapes simply contain no crowded week.
  Report §2.3's "silent on 61 of 61" is true of the sweep and false of the space.
- **What is still genuinely unobserved** is the ride-shortfall note and the no-rest-day note. The
  reduction ladder that would have produced the first is gone (stage 5 §13th branch), left in place
  deliberately for stage 6 to decide on.
- ⚠️ **Stage 4's run and swim halves are still owed.** `AthleteWeeklyIntent` has a `bike` key only.
