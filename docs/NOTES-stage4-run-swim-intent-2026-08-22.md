# Stage 4, the outstanding half — the RUN and the SWIM

**2026-08-22.** The rides were done on 2026-08-21 (`NOTES-stage4-ride-intent-2026-08-21.md`); this
follows that pattern exactly. Runs first, then swim.

## STATE — three ways, all three NO

| | |
|---|---|
| **pushed** | **NO.** Nothing committed. |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Nor has anything from the six stages — see the banner. |

**Sweep: 0 of the 61 moved. Byte-identical.** 61 built, 0 failed, `budget-equals-built: 0 violations`.

---

## What shipped into the tree

`AthleteWeeklyIntent` has all three keys now — and ⛔ **every key was added in the same pass as its
readers.** The previous session refused to add `run` and `swim` early precisely because a field
nothing reads is the starved-input disease this repo's own banner opens with.

**Deleted, in the same session.** Seven names are gone from the composer as independent derivations:

`askedRunMiles` · `runSelected` · `longRunPin` · `askedRunDays` · `runFreq` · `runHasLongDay` ·
`easyRunsWanted` — plus the five direct `args.swimDays` / `args.targetWeeklyMiles` /
`args.easyPaceMinPerMile` / `args.enduranceFrequency` / `args.longRunDay` reads scattered across
1,200 lines. They survive only inside comments explaining what they were.

**All five hops wired, same as the rides:**

| hop | file | what changed |
|---|---|---|
| wizard | `NonRaceBuilder.tsx` | run + swim pickers read `RUN_DAYS_CHOICES` / `SWIM_DAYS_CHOICES`; the `run_days` gate fixed (below) |
| wizard model | `suggest-hard-days.ts` | **already done** — `easyCount` has called the shared `easySessionsWanted` for both sports since the ride half |
| router | `create-goal…` | `gsTargetWeeklyMiles`, `gsRunDaysGiven`, `endurance_frequency`, `swim_days` all call the normalisers |
| generator | `generate-strength-plan` | same, **and it announces a defaulted run count** |
| composer | `strength-primary-plan.ts` | `runIntent` + `swimIntent`, built once |

**Net: 686 lines added, 104 deleted.**

### Symmetric where the fact is the same, honest where it is not

All three disciplines answer *how often*, *which day is long*, *did the athlete choose this*. They
differ on VOLUME because the athlete does — the run is typed in **miles** against a pace, the bike in
**hours**, the swim is a bare **count**. ⛔ Not flattened into one `volume` field: a number whose unit
lives in a neighbouring field is the miles-vs-hours confusion this object exists to end.

⛔ **Two asymmetries are real and are documented rather than smoothed over:**

1. **The run has no `declared`.** The bike has two gates — *did they give us a bike* and *is there
   riding in this block* — because a bike-primary athlete who typed no hours is selected without
   being declared, and the two drive different emitters. The run has one gate. A second for symmetry
   would be a field with no question behind it.
2. **`hasLongDay` means different things.** A long RIDE exists only when the athlete PINNED a day —
   the engine never invents one. A long RUN exists whenever a session is left over, pinned or not,
   because an unpinned long run falls to `DEFAULT_LONG_DAY`. Making them agree would either invent a
   long ride nobody asked for or delete the long run of every athlete who never answered. **Pinned by
   a test that asserts they disagree.**

### Q-270's four-deep default chain, closed

The run count's `2` was supplied at `create-goal`, twice inside `generate-strength-plan`, and again
as the composer's `DEFAULT_ENDURANCE_SESSIONS` floor. Four independently reasonable clauses which
together meant a dropped answer could never surface — and only `create-goal` ever said anything.

It is `RUN_DAYS_DEFAULT`, stated once, and **`generate-strength-plan` now announces it** when a
run-shaped block arrives with no count. ⚠️ It is Hickson's maintenance dose, so it is defensible — and
still ours, which is what `askedDaysSource: 'default'` exists to say.

---

## ⛔ ONE BEHAVIOUR CHANGE — the `run_days` payload gate

`NonRaceBuilder` shipped `run_days` only when `state.posture?.strength === 'develop'`, while
`target_weekly_miles` beside it shipped **ungated**. The trace report §2.5a flagged it and could
neither find a path to the bad state nor prove there wasn't one:

> *"On Strong Focus strength is always `develop`, so it works — by coincidence, not by construction."*

⛔ **A routing key used as a discipline gate.** The failure it allows is silent and expensive: the
miles arrive, the count does not, and the athlete's typed mileage is divided across the DEFAULT two
runs instead of the four they picked. Nothing anywhere reports it — the plan just looks plausible.

**Now gated on `state.runDays >= 1`** — the athlete answered the question. ⚠️ `state.runDays` is only
ever set by the strength path's own cards, so this can only ADD the field where it was being dropped;
it never removes it, and `create-goal` reads `run_days` on the Get Strong branch alone.

⚠️ **The sweep cannot see this** — it calls the composer directly. Flagging it as the one behaviour
change, exactly as the ride half flagged its.

### What was NOT changed, and why

- **The schedule row's run arm stays `[2, 3, 4]`, and the standalone run step too.** One run a week
  is a legal answer the wire accepts and the composer builds (2026-08-19), but the range a SCREEN
  offers is a product question and this row has never offered 1. ⛔ **A screen offering FEWER than the
  wire accepts rewrites nothing** — the ride's defect was the opposite direction. Raising it is
  Michael's call, and the lint names both literals so they cannot be "tidied" either way.
- **The swim gets nothing but consolidation** (standing decision, D-323 §5 — booked, not coached).
  The screen offers 1/2/3 and the wire has always accepted 4; that asymmetry is the safe direction
  and is how a goal row stored under an older picker still rebuilds.
- **`swim_volume` is not in the object.** It is collected and stored and has no reader; putting it in
  would be the starved-input pattern again. It joins when something consumes it.
- **`suggest-hard-days`'s `hasRun`** is a fourth statement of "is the athlete running", but on the
  wizard's inputs (a COUNT) rather than the composer's (MILES). Forcing them into one shape would
  mean lying about one of them. **Left, and recorded here** rather than half-wired.

---

## Verification

| suite | before | after |
|---|---|---|
| `shared/strength-system/` | 580 passed, 0 failed | **584 passed, 0 failed** (+4) |
| `_shared/` | 1855 passed, 1 failed | **1863 passed, 1 failed** (+8) |
| `src/` under deno | 717 passed, 3 failed | **719 passed, 3 failed** (+2) |
| sweep | 61/61 | **61/61, 0 of 61 moved, byte-identical** |
| `npx vite build` | clean | clean |
| `tsc --noEmit` | 312 errors | **312 errors** |
| `npx eslint NonRaceBuilder.tsx` | 1 error 1 warning | **same, both pre-existing** |

The 4 failures are pre-existing and stash-verified in earlier sessions.

### The byte-identical gate

`athlete-weekly-intent.test.ts` keeps the composer's seven original run expressions **verbatim** and
runs both against **2,520 shapes** (5 mileages × 3 paces × 4 long-day values × 7 frequencies × 2
primary-sport values × 3 hard-run counts). The count is asserted so the table cannot silently empty.

### Mutations — every new test, and three survivors recorded

Nine against the module, all caught: the run range floored back to 2 · `0` counted as an answer · the
defaulted frequency selecting the run · a hard run no longer selecting it · the long run needing a pin
· the hard runs not subtracted · the pace fallback replacing the stated pace · the swim gaining a
default · the swim wire clamp dropped.

Six against the composer wiring; **three survived the first pass and two of those became new tests**:

| mutation | first pass | after |
|---|---|---|
| `paceKnown = true` (the "we are guessing" note vanishes) | **580 green** | 1 failed |
| the durations ignore the stated pace | — | 1 failed |
| the swim count hardcoded to 1 | **580 green** | 1 failed |

⛔ **The two survivors that are recorded rather than closed:**

1. **`weeklyRunHours` reading `paceOrFallback` instead of the stated pace.** It genuinely moves the
   endurance TIER — 20 miles with no stated pace resolves `base` correctly and `strength` under the
   mutant, because `hours == null` fails the `hours < 4` AND-gate — and **the composed plan is
   identical either way**: same movements, same sets, 20 assistance reps in week 2 in both. The tier
   is an argument to `assistanceTotalReps` and never reaches the plan output. The code is still
   right and must not be simplified: §0h is that unknown means *"we have not asked"*, never *"they do
   nothing"*. ⚠️ **Finding: `endurance-tier.test.ts` covers the resolver and nothing covers what the
   composer feeds it.**
2. **`if (swimIntent.selected)` → `if (true)`.** Survives because `askedDays` is 0 and
   `swimSessions(free, 0)` builds nothing. The gate is redundant with the count — kept because it
   reads as the question being asked, not because it is load-bearing.

Four against the client lint, all caught, including the posture coupling returning.

---

## What stage 4 owed and now does not

⛔ **`AthleteWeeklyIntent` is complete: `run`, `bike`, `swim`.** The nine-name chain the trace report
measured is one object at every hop, every default is stated once and announced when it fires, and
every old variable is deleted rather than left beside the new one.
