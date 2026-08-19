# 2026-08-19 — what shipped on the builder, and the pace job that follows

Two halves. **Part 1** is the record of today's fixes — read it so you do not re-find them.
**Part 2** is the next job, written for a session that has not seen any of this.

Everything below was found by Michael on a device or in an exported plan. Not one came from a test.

---

# PART 1 — WHAT SHIPPED (do not re-litigate)

Nine commits, `141e0e6c` → `fe0d8b0f`. Four docs, five code.

## The pattern behind four of the five bugs

**Code comparing two different representations of one concept.** Not a missing feature — a
translation error between two copies of the same fact. Worth holding while reading the rest:

| bug | representation A | representation B |
|---|---|---|
| ride shortfall note | `wantDays` (counts the hard ride) | `rideDays` (does not) |
| solver crowding | placements | stressors |
| accessory line | the joined name `Deadlift + Overhead Press` | the individual lift names |
| wizard row | the DEFAULT rule | the CHOICE rule, in one expression |

The fifth (threshold pace) is a different disease: a derived value with **no invariant**.

---

## 1. The scheduler counts stressors, and the blank day is expensive — `dc916b56`

**PUSHED · DEPLOYED (`generate-strength-plan`) · NOT VERIFIED ON A SCREEN**

`resolve.ts` counted calendar days (occupied or not) and placements (a coupled squat + hard run is
one). Neither is what fatigue tracks. `isStressor` now splits the five loads: `heavy_lower`,
`hard_cardio`, `long_run`, `long_ride` cost the athlete a day; **`upper` and `easy` do not**.

⛔ **No `COST` cell moved. Layer 1 is untouched and its 18 tests still pass.**

**The weight ordering is Michael's ruling, and every number is set to produce it:**

```
overCap 60          three real stressors on one day is worse than losing the day off
blank   40          the athlete keeps one square with nothing on it
lock    24 + crowding 6 = 30, which LOSES to 40
```

Gap-filling buys at most 30; the blank day costs 40 to give up. So a low-CNS press moves into a dead
zone **only** when the alternative is a capped day at 60.

⚠️ **The first version weighted the blank day at 3 and the suite caught it** — 37 of 61 sweep shapes
came back with no blank day, failing `a week with room KEEPS its rest day`. Michael: *"stripping away
an athlete's only true day off just to make the weekly layout look perfectly symmetrical is a failure
of coaching."* **Those tests are the record of this decision. Do not relax them.**

**Measured:** 3 of 61 shapes changed, all two-hard-run weeks — the threshold run moves off Monday to
midweek, cutting a four-day stressor run to three, blank Thursday untouched. 58 byte-identical.

⚠️ **The cap and the streak terms never fire on any shape the composer can emit** — the three-day
Wendler structure never puts three stressors on one day. Their arithmetic is pinned by direct unit
tests; their WEIGHTS are not, and nothing would catch a future retune. Accepted deliberately:
dormant guards until a four-day lifting block or six-day endurance schedule creates the collision.

⚠️ **The first set of tests for this was VACUOUS.** Zeroing each new weight broke nothing — `crowding`
and Layer 1 were already producing every asserted outcome. Rewritten to call the terms directly,
which is why `overCap`, `lockedDayExtras` and `stressorStreakExcess` are exported. **Mutation-test
any new scoring term before believing its test.**

## 2. The High intensity row could not be opened — `6386df81`

**PUSHED (client, live on Netlify) · VERIFIED BY MICHAEL**

On the Schedule step, tapping **High intensity days** stored `'hard'`, and the render gate read:

```js
scheduleQuestion && scheduleQuestion !== 'hard' && rows.some(...) ? scheduleQuestion : <first non-hard>
```

`!== 'hard'` existed to stop the card **auto-opening** on the optional question. Written as *never*
open on `hard`, it also refused a deliberate tap. **Neither hard session's day picker was reachable**
— and the collapsed row still summarised `Run · Tue · Ride · Fri`, so it read as answered.

Split into `src/lib/schedule-ask.ts`: `defaultScheduleAsk` excludes `hard`; `resolveScheduleAsk`
honours a tap unconditionally. 10 tests, mutation-checked.

⚠️ **The existence check is NOT the bug and Michael ruled it stays.** Posture is editable on an
earlier step; without it, walking Back and dropping the bike leaves `ride` open on a card with no
ride row.

⛔ **The extraction is what made it testable** — the rule lived inline in a 5,800-line render body.

## 3. The week grid was unreadable — `adbeba56`

**PUSHED (client) · VERIFIED BY MICHAEL**

Day names sat at `white/40` against session text at `white/85` — dimmer than the rest-day dash. A week
is read day-first; the column you scan BY was chrome. Now `white/75`, rows `text-sm`, accessory line
`white/55`. Michael: *"don't hide the days of the week."*

`WeekGrid` has two call sites, both in `NonRaceBuilder` — the "Your week" step and the final review
card. **They change together. That is the point of it being one component.**

## 4. The paired lift day leaked both main lifts — `76e66f4a`

**PUSHED (client) · NOT VERIFIED ON A SCREEN**

```
before: Deadlift · Overhead Press · Deadlift · DB Shoulder Press · Barbell Row · Back Extension
after:  DB Shoulder Press · Barbell Row · Back Extension
```

The filter compared each exercise against the session's WHOLE name, and on the three-day week's
double session that name is `Deadlift + Overhead Press`. Neither main lift equals it. The repeat was
First Set Last, a second row also named `Deadlift`. Monday and Tuesday were always clean, which is
why it survived. Splits on ` + ` and dedupes.

## 5. The ride shortfall note was false — `76e66f4a`

**PUSHED · DEPLOYED (`generate-strength-plan`) · NOT VERIFIED ON A SCREEN**

A week with `Wed Easy Ride · Fri Threshold Ride · Sat Long Ride` — three ride days against an answer
of three — printed *"You asked for 3 ride days; the week had room for 2."*

`rideDays` holds the long and easy rides; the hard ride is a separate anchor and never in that list.
`askedRideDays` includes it. `strength-primary-plan.ts:4516` compared them (`:4492` before the fix's comment block).

⚠️ **Every other count in the file already subtracts** — `runFreq` (`:3142`), `ridesWanted` (`:3168`),
and the comment above `ridesWanted` states the rule outright. This was the one line that ignored it.

⛔ **Not only a note.** `wantDays` caps the fill loop, so the inflated ask could take an extra
flexible day: long + easy + easy + hard = four sessions against three.

**Measured:** 27 of 61 sweep shapes carried this note. All 27 false. Now zero.

⚠️ **The note may now be unreachable.** Across the sweep and six hand-built over-subscribed weeks
(4 runs + 4 rides, two hard runs, long run and long ride pinned to the same day) **every shape builds
every ride day asked for**. It is NOT deleted — `week-model` lays every free unit in somewhere, so a
flexible ride cannot currently go unplaced, but that is a property of today's solver, not a law. An
invariant test guards it: whenever it fires, the number must match the calendar.

## 6. Threshold pace slower than easy pace — `fe0d8b0f`

**PUSHED · DEPLOYED (`learn-fitness-profile`) · NOT VERIFIED — see Part 2**

Covered in full below, because it is where the next job starts.

---

# PART 2 — THE NEXT JOB: WHICH PACE IS TRUE

## The finding

Real baselines, 2026-08-19:

| number | value | where it comes from |
|---|---|---|
| easy pace | 12:35/mi | **measured** — median of 10 runs at or below 89% of threshold HR (Friel Z2), as of Aug 4 |
| threshold pace | 14:44/mi | **measured, contaminated** — 2 runs |
| 5K time | 25:21 (8:10/mi) | **typed once.** Nothing measures it. No date on it |
| threshold HR | 151 bpm | **measured** — median of 20-60 min efforts at 85-92% of observed max |

Threshold slower than easy is physiologically impossible. **It shipped at `medium` confidence, which
the resolver treats as trusted and feeds to plan generation.**

## What was already fixed (`fe0d8b0f`)

The learner took any run ≥15 min whose AVERAGE HR sat within ±5 bpm of threshold HR, then took the
median of that run's AVERAGE PACE across the whole activity. **A hill-repeat session averages near
threshold HR and its average pace includes the walk-back descents.** Two were enough — the minimum
was 2.

⛔ **The guard is an invariant, not a contamination list.** Detecting hills, then intervals, then
stops is a guard per source, forever. *A threshold effort is faster than an easy effort* holds for
every athlete, so: easy pace is learned FIRST; a candidate slower than the athlete's own easy pace is
dropped BEFORE the median; two runs is now `low`, not `medium`.

⛔ **A second guard was written and deleted the same hour.** A check on the median, after the filter.
Mutation testing showed removing it broke nothing — every surviving candidate is already faster than
the ceiling. **Unreachable defence is how guards multiply. The test protects the rule now.**

⚠️ **One case is deliberately unguarded:** with fewer than three easy runs there is no easy pace, so
no ceiling, and the read publishes unfiltered. Inventing a ceiling would be the fabrication LAW 2
already deleted from that file.

## ⛔ THE PROBLEM THAT REMAINS, AND IT IS THE JOB

**When the learned value abstains, the fallback derives from the TYPED 5K — and a typed 5K goes stale
as fitness changes.** Michael's has:

- his 5K implies an easy pace of **~10:42/mi**
- ten measured runs say **12:35/mi**
- Michael, asked: **"my fitness has dropped."**

So the fallback is now **too FAST** where the old bug was too slow. Too-fast threshold in a
strength-led block is the more expensive error — the session stops being threshold and starts eating
the lifting.

⚠️ Exposure today is small: the hard run is Hill Repeats (no pace target by design) and the hard ride
is watts. It bites on a flat threshold run.

## The facts you need, already gathered

**1. Easy ≈ 1.19 × threshold, and it is stable.** From the app's OWN pace table
(`generate-run-plan/effort-score.ts:65`), `base ÷ steady`:

```
vdot 30  1.196     vdot 36  1.193     vdot 42  1.191
vdot 32  1.196     vdot 38  1.191     vdot 44  1.191
vdot 34  1.191     vdot 40  1.191     vdot 48  1.190
```

For Michael: 12:35 ÷ 1.19 = **~10:34/mi**. Against 14:44 (broken) and 8:58 (from the stale 5K), the
middle one is closest to today.

⚠️ **The weakness, and it must be said on screen:** the ratio assumes the athlete runs easy runs at
proper easy pace. Someone running extra easy — heat, hills, discipline — gets a threshold read back
that is too slow. **Easy pace is partly a choice; a race time is not.** That is why deriving from a
performance is normally stronger — and why Michael's point still stands: most athletes log far more
Z2 than they log 5K tests, so the measured number has more data behind it.

**2. The divergence number already exists.** `RUN_PACE_DIVERGENCE_THRESHOLD = 0.04` — ±4% sustained,
at `generate-combined-plan/science.ts:34`. It was chosen deliberately for exactly this question.
⛔ **Reuse it. Do not invent a second one.** Michael's numbers are ~18% apart; it would trip easily.

**3. The typed 5K carries no date.** `user_baselines.updated_at` covers the whole row.
⚠️ **The per-field pattern already exists** — `swimPace100_updated_at` (`TrainingBaselines.tsx:677`).
Stamping the 5K when typed is a small change on an established pattern.

**4. Staleness is detectable two ways** — by date (needs #3) and **by disagreement** (works today:
the 5K-implied easy pace vs the measured one). The second is how this was found by hand.

**5. There is a machine for this and it never runs here.** `resolveRunEasyPace`
(`generate-combined-plan/science.ts:110`) reconciles baseline vs observed with a streak gate, a
median gate, and an **ACWR gate so accumulated fatigue is not misread as fitness decline**. It is
good. It is on the RACE path only; Strong Focus never calls it. ⛔ **Read it before writing anything
new — its three anti-volatility layers are the hard part and they are already solved.**

**6. The swim side already does the strong version.** `_shared/swim/swim-css-learner.ts` fits a
threshold from best efforts across durations, requires ≥2 distinct durations, a monotonic curve, a
plausible D' and an R² floor, and **abstains and publishes nothing** otherwise. The same maths is
critical speed for running. ⛔ **This is the real long-term answer and it is already written for one
discipline.** It is the `TARGET-ARCHITECTURE` yardstick — *"make X look like run"* — running backwards.

## What to build (Michael's call, 2026-08-19)

**Three states, each said plainly rather than picked silently:**

1. **Measured** — enough clean runs; here is your threshold
2. **Worked out from your easy pace** — say so, do not present it as measured
3. **Not enough data** — say that, and **show no number**

**Plus a flag:** *"your 5K doesn't match your recent runs — worth a retest."*

⛔ **The point of the flag is that today the app picks a source silently and the athlete never learns
the two numbers disagree.** Michael only found it because he looked.

**Order:** easy-pace derivation as a floor first, so a stale 5K can never prescribe something too
fast. The running best-effort fit is the durable answer and is its own later job.

## What NOT to do

- ⛔ **Do not tune anything to Michael's numbers.** His export is the symptom, not the spec. Verify
  across the 61-shape sweep and a range of paces. If a fix only works at his pace it is the wrong fix.
- ⛔ **Do not invent a second divergence threshold.** See fact 2.
- ⛔ **Do not fabricate a ceiling when easy pace is unknown.** LAW 2 in `learn-fitness-profile`.
- ⛔ **Do not add a guard per contamination source.** One invariant beats four detectors.
- ⚠️ **Do not trust a new test until you have mutated it.** Two of today's test files were vacuous on
  the first pass and passed anyway.

## Where to start

1. `supabase/functions/learn-fitness-profile/index.ts` — `analyzeRuns`, STEP 5 / 5b (exported now)
2. `src/lib/resolve-current-run-pace.ts:274` — `resolveCurrentRunThresholdPace`, the tier chain
3. `src/components/TrainingBaselines.tsx` — the card that shows it, and the swim per-field date pattern
4. `supabase/functions/generate-combined-plan/science.ts` — the divergence number and the reconciler

**Size:** a few hours. It is a design job, not a bug fix — the decisions about what the athlete sees
in each of the three states are the work.

⛔ **Deploy note:** nothing imports `learn-fitness-profile`, so it deploys alone. **The stored value
does not correct until the learner runs again** — which happens on the next Garmin/Strava ingest.

---

# STILL OWED, UNRELATED TO THE ABOVE

- ⛔ **The Strong Focus intake acceptance pass.** 61 commits over 2026-08-18/19, four edge functions
  live, and the matrix at the top of `POLISH-PUNCH-LIST.md` is still mostly unrun. Items 1-4 of it
  were partly walked today (both hard-day pickers now reachable and settable, verified).
- **The `AthleteWeeklyIntent` refactor.** Michael's call, agreed as its own engineer session. In
  `strength-primary-plan.ts` the single concept "how many rides did the athlete ask for" exists as
  nine variables — `rideDays` 15×, `hardRideCount` 8×, `wantDays` 6×, `askedRideDays` 6×,
  `ridesWanted` 5×, `rideHasLongDay` 5×, `solvedRideDays` 4×, `rideHours` 2×, `bike.days` 1× — plus
  five more for runs. **Three of today's five bugs were cross-representation errors in that file.**
  One typed object, computed once at the wizard boundary with hard days already subtracted, read-only
  downstream. Migrate one discipline at a time with the 61-shape sweep as the gate. Not a rewrite.
