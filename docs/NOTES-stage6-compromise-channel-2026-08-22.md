# Stage 6 — does the app still say when it had to compromise

**2026-08-22 · the last stage of the six.**
Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` stage 6. Evidence: `REPORT-session-structure-and-clumping-2026-08-20.md` §2.3 — **and its premise is wrong; see below.**

## STATE — three ways, all three NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. Stages 2, 3, 4 and 5 are unpushed in the same tree. |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Nothing from any of the six stages has been seen on a phone. |

**Sweep: 0 of the 61 moved.** ⛔ **And that is the finding, not a clean bill of health.** Every one of
the 61 keeps at least one rest day and builds every ride day asked for, so neither note can fire on
any of them. The sweep is structurally blind to both — which is exactly how a note that was broken for
months stayed green.

---

## The answer to the stage's question, note by note

### ⛔ THE NO-REST-DAY NOTE WAS BROKEN. Measured: silent on 25,088 of 25,088.

Across 37,632 shapes (3–4 runs × 3–4 rides × 0/2/4 swims × every long-day and hard-day placement),
**25,088 built a week with no rest day at all**, and the note **stayed silent on every single one.**

Two causes, and both are the same mistake. The check read:

```ts
const occupied = new Set([...strengthDays, pickedLong, ...easyRunDays, ...rideDays]);
```

1. **It could not see a HARD day or a SWIM day.** A week whose seventh square carried either counted
   that square as empty. The measured misses are mostly a Sunday swim.
2. **It only ran when the athlete kept a BIKE** — the whole block sits inside `if (rideIntent.declared)`.
   A runner with no bike could fill all seven days and never be told. Nothing about a rest day is a
   cycling question.

⚠️ **And the old comment already said the right thing**, which is why this is a fix and not a
redesign: *"ASKED OF THE WEEK, NOT OF ONE VARIABLE … Count the days that carry something and let the
answer come from the week itself."* It then counted four variables. **A list of sources is one
variable wearing a wider coat** — it can only ever be as complete as the last person to remember to
add to it, and swim and the hard days joined the week after it was written.

**Fixed:** the check moved below the swim emitter and reads `weekSessions` — the finished week. If a
day carries anything at all it is not a rest day, whatever put it there.

| | before | after |
|---|---|---|
| full weeks (3–4 runs, 3–4 rides) | 25,088 | 25,088 |
| the note fired | **0** | **25,088** |
| bike-less full weeks | 217 | 217 |
| the note fired | **0** | **217** |

**The copy was rewritten too.** It read *"Your N ride days and M run days fill all seven"* using the
**requested** numbers, so on the day it did fire it could have named a count the calendar did not
show — and it named two disciplines out of four, the same blindness one layer up. It now counts off
the built week:

> Every day this week carries a session — 3 running, 1 swimming, 3 lifting — so there is no full rest
> day. That is the one cost here that is not about arrangement: the block is built around a day with
> nothing on it.

Passes the voice check.

### ✅ THE RIDE-SHORTFALL NOTE IS QUIET BECAUSE THERE IS NOTHING TO SAY — and it is wired

Measured across 10,584 crowded shapes: **the athlete gets every ride day they asked for, every time.**
Zero shortfalls, zero firings. On 2026-08-19 this note fired on 27 of 61 and every one was false
(`76e66f4a`); **silence is that fix working**, exactly as the work order predicted.

⛔ **It is not decorative, and that is proven rather than assumed.** The collapse it guards — two easy
rides placed on ONE day, so `rideDays` dedupes and the athlete silently gets fewer — **is reachable in
the resolver**: 1,050 of 38,416 over-subscribed adapter shapes produce it, and 2,780 put an easy ride
on the long-ride day. It is unreachable from the composer only because `easyWanted` caps the flexible
ride count low enough that the solver always finds distinct days.

**Mutation proof it fires:** capping the ride fill loop at two days made a 4-ride week build 2, and
the plan came back carrying *"You asked for 4 ride days; the week had room for 2 once the lifting and
your fixed days were placed."*

⛔ **So it is KEPT.** Raise the ride ceiling past 4, or stop subtracting the hard ride, and the
collapse returns. The invariant test is what would notice; the note is what would tell the athlete.

### The third note

**The hard-day yield note is gone for good** — stage 5, Michael's ruling: nothing yields. Its
replacement (`tightWeekCompromises`) fires and is pinned in `hard-day-no-yield.test.ts`.

---

## ⛔ THE WORK ORDER'S PREMISE, CORRECTED FOR THE RECORD

§2.3 says *"THE ENTIRE COMPROMISE CHANNEL IS SILENT — MEASURED, 61 OF 61."*

**True of the sweep, false of the space.** Stage 5 measured 10,080 of 10,976 hand-built shapes
carrying a compromise; this stage measured 88,928 of 100,352. **The breach half is loud and correct.**

⚠️ The lesson is the one this whole work order keeps finding: *the sessions with tests are the
sessions that work*, and here *the shapes in the sweep are the shapes that behave*. The 61 are a good
regression net and a poor detector — every one of them is a sensible week. **Neither of the two notes
could ever have fired on any of them**, so 61 green shapes were never evidence about either.

---

## Verification

| suite | before | after |
|---|---|---|
| `shared/strength-system/` | 574 passed, 0 failed | **580 passed, 0 failed** (+6 new) |
| `_shared/` | 1855 passed, 1 failed | **1855 passed, 1 failed** |
| `src/` under deno | 717 passed, 3 failed | **717 passed, 3 failed** |
| sweep | 61/61 | **61/61, 0 of 61 moved** |
| `npx vite build` | clean | clean |
| `tsc --noEmit` | 312 errors | **312 errors** |

The 4 failures are pre-existing and stash-verified in earlier sessions.

### New tests — `compromise-channel.test.ts` (6), all mutation-tested

| mutation | result |
|---|---|
| the rest-day note never fires | 4 failed |
| the note fires on every week | 1 failed |
| back to the hand-listed subset (blind to swim) | 4 failed |
| the counts come off the ask again | 1 failed |
| the copy trips the voice check ("Focus on recovery") | 1 failed |
| the ride fill loop drops a day | 1 failed |

⚠️ **The last one is doing double duty** and it is the honest way to test a note that cannot fire: it
proves the invariant test notices a loss AND, run by hand, that the shortfall note speaks when one
happens.

---

## ⛔ THE SIX-STAGE WORK ORDER IS COMPLETE — AND NOTHING HAS BEEN SEEN ON A DEVICE

| stage | what | pushed | deployed | verified |
|---|---|---|---|---|
| 1 — session wrapper | warm-ups, one owner of duration | **yes** (`024d9152`) | **yes** 2026-08-21 | **no** |
| 4 — ride intent | one object for the ride ask | **yes** (`807216b8`) | not by these sessions | no |
| 5 — dead engines | 13 dead branches, the yield deleted | **yes** (`807216b8`) | not by these sessions | no |
| 2 — clumping | `sportAdjacency` replaces two blind terms | **yes** (`807216b8`) | not by these sessions | no |
| 3 — wizard latency | solve gated + deferred; Q-215 deleted | **yes** (`807216b8`) | not by these sessions | no |
| 6 — compromise channel | the rest-day note fixed | **no — uncommitted** | no | no |

⚠️ **Michael committed and pushed stages 2–5 himself as `807216b8` on 2026-08-21**, between that
session and this one; `main` is level with `origin/main`. This stage's own work is uncommitted.

⛔ **PUSHED IS NOT DEPLOYED, AND NOT ONE STAGE HAS BEEN SEEN ON A DEVICE.** Stages 2–5 touch
`strength-primary-plan.ts`, `create-goal-and-materialize-plan`, `generate-strength-plan`,
`_shared/week-model/` and the client — none of those edge functions were deployed by these sessions
and the client has not gone to Netlify. Everything the six stages claim is claimed on tests, probes
and the sweep.
