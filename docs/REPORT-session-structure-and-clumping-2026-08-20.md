# 2026-08-20 — trace report: session structure, clumping, and the machinery

Answers the four findings in `WORKORDER-session-structure-and-clumping-2026-08-20.md`. **Nothing is
built yet.** Every number below is measured — from the export, from the code, or from a script run
against the real modules. Where something is a hypothesis it says so.

**The headline: findings 1 and 4a are ONE defect, not two, and it also silently shortens the RUN
week that nobody reported. Finding 2 is worse than the work order states — the resolver does not
merely fail to prefer the spread week, it scores the two identically. Finding 3 is reproduced and
it is not a state bug.**

---

## 0. THE ONE ROOT CAUSE — a session's length is stated in three places and only one survives

Every quality session in `strength-primary-plan.ts` carries **three** independent statements of how
long it is:

1. **The budget number** the volume pass subtracts (`SPRINT_SESSION_MIN`, `THRESHOLD_RUN_MIN`,
   `BIKE_QUALITY_MIN`, `HILL_SESSION_MIN`…).
2. **The `duration` field** on the composed `PlanSession`.
3. **The token(s)** in `steps_preset`, expanded later by `materialize-plan`.

`materialize-plan/index.ts:3745-3760` sums the expanded steps and **overwrites** `duration` with the
sum. The composer's number is a fallback used only when expansion yields nothing (strength). So on
every tokenized session, **(3) is the plan and (1) and (2) are fiction** — and nothing compares them.

### The ledger — budgeted vs. what materialization actually builds

| session | budget subtracts | token(s) | expands to | short by |
|---|---|---|---|---|
| Hill Repeats | 35 | `run_hills_4x180s_rlap_g5_8_d*` | 10 + 4×3 + **open** + 10 = **32** | 3 |
| Short Hill Repeats | 37 | `run_hills_10x60s_r60s_g4_6_d*` | 10 + 10 + 9 + 8 = **37** | 0 |
| Treadmill Intervals | 39 | same branch `_tm` | 10 + 12 + 9 + 8 = **39** | 0 |
| Flat (VO2) | 41 | `warmup_run_10min_easy` + `run_vo2_4x3min_r180s_z5` + `cooldown_run_10min_easy` | 10 + 21 + 10 = **41** | 0 |
| **Threshold Run** wk1 | 45 | `run_thr_4x5min_r60s` | 20 + 3 = **23** | **22** |
| **Threshold Ride** wk1 | 45 | `bike_thr_4x5min_R1min` | 4×(5+1) = **24** | **21** |
| **Bike Intervals** wk1 | 45 | `bike_vo2_4x4min_R4min` | 4×(4+4) = **32** | **13** |
| **Flat Sprints** | 35 | `run_sprint_6x12s_r150s` | 72 s + 750 s = 822 s = **14** | **21** |

**The pattern is exact: every session whose token brackets itself matches its budget to the minute.
Every session whose token does not, does not.** The hill family (2026-08-06) and the flat session
build their own warm-up; the four sessions added in the 2026-08-17/18 §7 arc do not. The wrapper was
never a rule — it was something four token authors happened to remember and four did not.

Both numbers Michael read off the export fall straight out of this table: **24m** and **14m** are the
token sums, to the minute.

### The budget leak is this table, restated

- 3 h asked = 180 min. `hardRideMins` = 45. `totalMins` = 135. Long ride = `round(135 / 1.5 × 1.5)` =
  **135**. Composer arithmetic: 135 + 45 = **180. The composer spends the budget exactly.**
- Materialization then rebuilds the threshold ride at **24**. 135 + 24 = **159**.
- **The 21 missing minutes are the difference between the 45 the budget paid and the 24 the token
  built.** (20 of it is the absent warm-up/cool-down; 1 is the deliberate over-subtraction
  `THRESHOLD_RUN_MIN` documents — it takes the wave's longest week, 45, against this week's 43.)

### ⛔ AND THE RUN WEEK LEAKS TOO, BY THE SAME 21 MINUTES — UNREPORTED

`hardRunMinutesForRole` returns `SPRINT_SESSION_MIN` = **35** and the mileage budget subtracts
`35 / pace` miles. The session materializes at **14**. Check against the export: 51 + 63 + 76 = 190 min
of easy running, + 35 budgeted = **225 min = 18 mi × 12.5 min/mi**. Exactly the ask. What was BUILT is
190 + 14 = 204 min ≈ **16.3 mi against 18 asked.**

**Michael caught the ride and not the run only because the ride's unit is minutes and the run's is
miles.** Same defect, same magnitude, invisible on the run side.

### ⛔ AND IT REACHES THE WATCH

`send-workout-to-garmin/index.ts:714-729` builds a first-class `warmArr` / `coolArr`
(`effortLabel: 'warm up'`). **A Flat Sprints session exported today carries an EMPTY warm-up array.**
The watch beeps and step one is a 12-second maximal sprint. This is not a number on a card.

### ⚠️ Side finding, filed not pursued: an open step counts as zero time

The lap-button hill's descents carry no `duration_s` (deliberately — that is the lap-button
instruction), so they contribute **0 seconds** to `total_duration_seconds`. The session reports 32 min
for something that takes ~45. Not in scope; recorded because any duration work will touch it.

---

## 1. FINDING 2 — the anti-clumping term, measured

Run against the real `resolve.ts` (a copy with the private terms exported; the repo is untouched):

```
as built      runs [Mon,Tue,Wed,Sun]  rides [Fri,Sat]   interleaving 2  clustering 0  SCORE 54
alternating   runs [Mon,Wed,Fri,Sun]  rides [Tue,Sat]   interleaving 2  clustering 0  SCORE 54
```

Term by term — recovery 3, blank 1, crowding 6, bunching 0, clustering 0, overCap 0, lockedDayExtras
0, streak 0, interleaving 2, unmet 0 — **the two weeks are identical on every single term.**

⛔ **This is stronger than "the term is blind."** The whole scoring vector is blind. The resolver is
indifferent between a fully clumped week and a fully alternating one, and which one an athlete gets
is decided by enumeration order. There is nothing to tune; there is a measure missing.

The work order's diagnosis is right and the reason is right: `interleaving` asks *"is one sport
bracketed by the other"*, and a week with an easy run early and the long run on Sunday answers YES to
every ride placement except Monday and Sunday. `clustering` only sees units whose sessions are **all**
`easy`, so Tuesday's `hard_cardio` sprints make Mon-Tue-Wed invisible to it as well.

**The measure that separates them is cyclic adjacent same-sport days** — the same shape as
`stressorStreakExcess`, one field over:

```
as built     adjacency 4   score now 54   score at weight 6 → 30
alternating  adjacency 1   score now 54   score at weight 6 → 48
```

Weight constraint, from the 2026-08-19 ordering: giving up the blank day costs 40. Moving one session
into a blank day can remove at most 2 adjacencies, so the term must satisfy `2w < 40`, i.e. `w < 20`.
**6 sits between `crowding` (6) and `stressorStreakExcess` (8), breaks this tie by 18 points, and
cannot outbid the blank day.** The 61-shape sweep is still the gate before that number is trusted.

⚠️ **When this is built, `interleaving` and `clustering` should be absorbed into it, not left beside
it.** Three terms all trying to say "spread the disciplines", two of them measuring something they do
not mean, is the doubled disease the file was written to prevent.

---

## 2. FINDING 3 — reproduced. It is latency, not a state bug.

The work order said reproduce before theorising. Reproduced, with numbers.

`solveWizardWeek` runs the exhaustive placer **synchronously in a `useMemo` on the render path**
(`NonRaceBuilder.tsx:1996`), and its dependency list includes `state.longRunDay` and
`state.longRideDay`. So every tap on a long-day chip runs a full solve **between the tap and the
paint.** Measured on desktop V8 (Deno 2.9), Michael's shape — 2 hard days, 4 runs, 2 rides:

| wizard state | solve time |
|---|---|
| nothing picked (**the state the card opens in**) | **472 ms** |
| long run picked | **53 ms** |
| both longs picked | **5 ms** |
| both longs + both hard days pinned | **0.1 ms** |
| 5 runs / 3 rides / 2 swims, nothing picked | **1320 ms** |

⛔ **That decay curve IS the reported symptom.** The search is `7^n` over unpinned constrained units;
each pick removes one and divides the cost by seven. The card defaults open on **Long run** with
nothing picked — so the athlete's very first tap is the slowest interaction in the wizard, the second
is nine times faster, and by the third it is instant. *"Long run and ride sorta linger until they are
clicked a couple of times"* is a literal description of that table. A phone is roughly 3–5× slower
than this desktop measurement, which puts the first tap at **1.5–2.5 seconds**. (The multiplier is an
estimate; the 472 ms is measured.)

⚠️ **The taps register.** Consistent with the screenshot the work order cites. State is written
synchronously and correctly; the render that would show it is stuck behind the solve. None of the
three candidate causes in the work order is it — not the mount effect, not the accordion, not a late
state write. `setScheduleQuestion` and `resolveScheduleAsk` are correct as written.

### ⚠️ A separate defect found in the same rows — the anchor lock is commented but not wired

`NonRaceBuilder.tsx:4767-4774` says: *"`taken` excludes the OPEN question's own anchor… `anchor-days.ts`
answers this for all three, so the lock is not re-derived here."* The code two lines below passes
**`taken={{}}`**. `anchorDaysTaken` is imported and used on the race path (`:3593`) and on two other
day pickers (`:5365`, `:5629`) — **not here.** So on the Strong Focus schedule card the long run and
the long ride can both be set to Sunday, which is what the screenshot shows. Independent of the
latency; both were in the same complaint.

---

## 3. FINDING 4 — both settled

**a. 35m vs 14m — the preview was RIGHT, and finding 1 explains it.** `runPreview` calls
`create-goal-and-materialize-plan` with `preview: true`, which returns `gsGen.plan` — the
**composer's** sessions, before `materialize-plan` ever runs (`create-goal…:2878`). So the card shows
`duration: SPRINT_SESSION_MIN` = 35, the number the budget actually spent. The built plan shows the
token sum, 14. **Same fact, two stages, and only the token survives.** Nothing to settle between them
— fix the wrapper and both become 35.

**b. `Quality Run Terrain: hill_3min` is a default that was never asked.** `state.qualityRunTerrain`
initialises to `'hill_3min'` (`NonRaceBuilder.tsx:1521`) and **the wizard stopped asking the question
on 2026-08-18**. The per-slot stamp was correctly deleted that day (`:1211-1221` — *"absent must stay
absent"*), but the line four rows above it, `qualityRunTerrain: state.qualityRunTerrain` (`:1187`),
was left, so `buildPreferredDays` still writes the never-chosen default into `preferred_days` — the
one bag whose stated contract is *"the athlete chose this"* and whose stated rule is *"omitted when
unset."* **It can never be unset, so that rule can never fire.** Half a fix.

**Harmless today, and here is exactly where it stops being harmless:** `create-goal…:2799` defines
`withTerrain`, and `:2837` applies it on the **pre-§1i fallback path** — the path taken when a goal
carries no `hard_days` array. Any goal that reaches that path gets `hill_3min` stamped onto its hard
run and is handed a hill session instead of the sprints it asked for, plus the suppression of the
*"no hill outside?"* line. The live §1i path does not apply it. One line to fix (stop seeding it while
the question is not asked); the alternative — making `undefined` representable — is the same fix with
a type change.

---

## 4. WHAT TO BUILD — one system, not four repairs

The four findings are three defects, and two of the three are the same disease: **one fact with
several representations and no owner.** ENGINE-STATE already names this as the pattern worth carrying
forward. So the build is not four patches.

### 4.1 One session constructor. The wrapper stops being optional.

Today a session is authored as *(a hand-typed budget constant, a hand-typed `duration`, a token)* and
whether it has a warm-up depends on whether its token author added one. Replace that with a single
function that takes the **core prescription** and the **available budget** and returns the whole
session — warm-up steps, core steps, cool-down steps — **and returns the minutes the budget should
subtract, from the same computation.**

Consequences, in order of what they close:

- **A zero-warm-up session becomes unrepresentable.** Not guarded against — unrepresentable. The
  warm-up is part of the constructor, not a decoration a token author remembers. This is the
  invariant-over-guard rule ENGINE-STATE states: *"a guard fixes one case; an invariant makes a class
  impossible."*
- **A floor, then the leftover.** Michael's shape: core first, remaining weekly budget spent as the
  wrapper. Plus the floor he asked for — a week whose budget is fully consumed by the long day still
  gets a minimum wrapper. The leftover decides how much **more** than the minimum, never whether there
  is one.
- **The budget stops leaking because there is nothing left to leak.** One number, computed once, used
  by the budget pass, by the composed `duration`, and by the token expansion.
- **The preview and the plan agree by construction**, which is finding 4a with nothing left to settle.
- **The run week's missing 21 minutes close** at the same time, without anyone having noticed them.

⚠️ **Scope discipline.** The four unbracketed sessions are the job. `materialize-plan`'s `run_vo2_*`
branch deliberately brackets nothing because two existing callers pass their own warm-up presets
(`session-factory.ts:443` and `flatSession`); adding bracketing there would double their warm-up.
**Whether the wrapper lives in the token or beside it is a per-token decision that already has a right
answer in each case — what must be unified is that the constructor guarantees one exists and reports
its length.**

### 4.2 One spread term. It replaces two, it does not join them.

Cyclic adjacent same-sport days, weighted below the blank day. `interleaving` and `clustering` fold
into it. Gate: the 61-shape sweep, 58 of 61 byte-identical.

### 4.3 The wizard solve comes off the render path.

Not a scoring change. Either memoise across the pinned prefix, cap the search when nothing is pinned,
or run it off the main thread. The engine is correct; it is being asked for a full exhaustive answer
120 times a minute while somebody taps.

---

## 5. HOW THIS SCALES — what commercial apps actually do

Michael's question. Split into what I can source and what is field convention.

### The wrapper is a first-class part of the workout everywhere, and it is not text

Every structured-workout format the industry runs on models warm-up and cool-down as **typed steps**,
not prose:

- **Garmin FIT** — a workout step carries an `intensity` enum: `active | rest | warmup | cooldown |
  recovery`. Our own export already speaks it (`send-workout-to-garmin:714-729`, `effortLabel: 'warm
  up'`). We are the ones sending an empty warm-up array.
- **Zwift `.zwo`** — `<Warmup>` and `<Cooldown>` are distinct elements from `<SteadyState>` /
  `<IntervalsT>` / `<Ramp>`.
- **TrainingPeaks structured workouts** — step-typed, with warm-up and cool-down as their own step
  classes.

**And in all three, planned duration is the SUM OF THE STEPS. There is no second author-typed
duration field for a structured workout.** That is exactly the discipline finding 1 and finding 4a are
the absence of: we have an author-typed number, the sum overwrites it, and the wizard renders the one
that loses. Adopting the field's own rule — *the steps are the duration* — deletes the disagreement
rather than reconciling it.

### Nobody prescribes maximal sprints cold

I can state this as field convention rather than as a citation to one paper: every published sprint /
neuromuscular session in coaching practice opens with a progressive build-up — easy running, then
drills, then 3–4 accelerations at rising percentages — before any maximal effort, and the RAMP
structure (raise, activate, mobilise, potentiate) is the standard framing for it. Hamstring strain
risk is concentrated at maximal running velocity, which is precisely what `6 × 12 s at maximum effort`
asks for and precisely what our session currently asks for from a standing start. **I have not sourced
a specific warm-up duration from a paper, and the wrapper length should be a product decision stated
as one — not dressed as physiology.** That is the same rule `LONG_RIDE_SHARE` is already marked with
in this codebase.

### Scheduling: apps use templates, we use an optimizer — and that is the right trade, with one gap

The mainstream commercial pattern (TrainingPeaks Plan Builder, TrainerRoad, Runna, Garmin Coach) is a
**weekly template with fixed session-type slots** — hard / easy / long already alternating, athlete
availability mapped onto the template. Multisport planners spread disciplines the same way: the
template has the alternation baked in, so nothing has to *measure* it.

⚠️ **My confidence is high on the template pattern and lower on any specific vendor's internals** —
these are not open systems and I am describing observed behaviour, not source.

Our resolver is a genuine optimizer over a debt model, which is strictly more capable: it honours an
athlete's arbitrary pins, states what it could not honour, and never refuses. **The cost of an
optimizer is that anything the template gets for free must be an explicit term in the objective — and
"do not put a discipline's sessions on consecutive days" is the term nobody wrote.** That is finding
2 in one sentence, and it is the honest answer to "does this scale": the architecture scales past what
the template apps can do; the objective function currently has a hole where their most visible
behaviour lives.

---

## 6. STATE

- **Nothing pushed. Nothing deployed. No repo file changed** — `git status` is clean. The probe copies
  of `resolve.ts` and `suggest-hard-days.ts` used for the measurements live in the session scratchpad,
  not in the tree.
- **When the work lands, three of the four touch different surfaces:** the session constructor and the
  spread term are edge functions (`generate-strength-plan` bundles `strength-primary-plan.ts`;
  `materialize-plan` owns the expanders) and need a **deploy**; the wizard latency, the anchor lock and
  the `qualityRunTerrain` seed are client-only and ship on **push**.

## 7. STILL OPEN / NOT DONE

- **No code written.** This is the trace pass the work order asked for.
- **The 61-shape sweep has not been run.** It is the gate for the spread term's weight and for the
  session constructor's effect on the budget — both will move shapes, and which ones move must be
  deliberate.
- **The phone-latency multiplier (3–5×) is an estimate.** The 472 ms is measured on desktop V8.
- **Not pursued, filed:** open (lap-button) steps count as zero toward `total_duration_seconds`.
- **Untouched by design:** the deadlift + hard-ride pairing, every `COST` cell, the 2026-08-19 weight
  ordering.

---
---

# PART 2 — THE MACHINERY (added after Michael's follow-up)

*"How the wizard collects, how we build and organize — basically the machinery around the whole
thing, not just the warm-ups and cool-downs."*

Part 1 found one defect in the last stage of the pipeline. This is the pipeline. Same method:
measured, not asserted.

---

## 2.0 THE PIPELINE, AND HOW MANY TIMES ONE ANSWER IS RE-SHAPED

An athlete taps "4 runs a week" once. Here is every hop that answer makes:

| # | stage | the answer's name here | who owns it |
|---|---|---|---|
| 1 | wizard state | `state.runDays` | `NonRaceBuilder.tsx:1521` |
| 2 | payload | `training_prefs.run_days` | `assemblePayload:1265` |
| 3 | goal row | `training_prefs.run_days` | `arc-setup-persistence` |
| 4 | router | `endurance_frequency` | `create-goal…:2741` |
| 5 | generator | `enduranceFrequency` | `generate-strength-plan:170` |
| 6 | composer, clamped | `askedRunDays` | `strength-primary-plan:3160` |
| 7 | composer, minus hard days | `runFreq` | `:3190` |
| 8 | composer, as a day list | `runDayList` | |
| 9 | composer, as minutes | `runMinutesByDay` | |

**Nine names. Five hops across three deploy boundaries. And THREE independent "default to 2" clauses**
— `create-goal…:2741`, `generate-strength-plan:170`, and `DEFAULT_ENDURANCE_SESSIONS` at
`strength-primary-plan:585`. Each is individually reasonable. Together they mean that when the answer
is dropped anywhere in the chain, **the athlete still gets a plausible-looking plan built on a number
they never chose**, and only one of the three even logs that it fired (`create-goal…:2730`).

That is exactly the Q-270 defect already on the books, and it is structural rather than a bug: a
default at every hop guarantees the absence can never surface.

### And the ride takes a different road for the same fact

| fact | run | ride | swim |
|---|---|---|---|
| how much | `targetWeeklyMiles` (top-level, MILES) | `bike.hours` (nested, HOURS) **+ `targetWeeklyRideHours` (a second top-level owner)** | — |
| how often | `enduranceFrequency` (top-level) | `bike.days` (nested) | `swimDays` |
| which day is long | `longRunDay` (top-level) | `bike.longRideDay` (nested) | — |
| what pace | `easyPaceMinPerMile` (top-level) | `ftpWatts` | — |

**Four facts, three disciplines, and no two of them shaped the same way.** The run is four flat
scalars, the bike is one nested object plus a duplicate top-level scalar for its volume, the swim is a
single count. The clamp `Math.max(1, Math.min(4, …))` is written out twice, once per discipline
(`:3160` and `:3197`) — one rule, two copies.

**Measured name-counts in the composer for one concept each:**

- *"how many rides did the athlete ask for"* — `rideDays` 15, `hardRideCount` 8, `wantDays` 6,
  `askedRideDays` 6, `ridesWanted` 5, `rideHasLongDay` 5, `solvedRideDays` 4, `rideHours` 2.
  **8 names, 51 uses.**
- *"how many runs"* — `runDayList` 12, `longRunDay` 12, `runFreq` 11, `easyRunDays` 7,
  `targetWeeklyMiles` 7, `hardRunCount` 6, `askedRunDays` 5, `runMinutesByDay` 3. **8 names, 63 uses.**

ENGINE-STATE already names this as the owed `AthleteWeeklyIntent` refactor and records that **three
of the five bugs found on 2026-08-19 were cross-representation errors in this one file.** Part 1's
defect is the sixth, one layer down.

---

## 2.1 ⛔ FIVE PLACEMENT ENGINES ARE LIVE, AND TWO OF THEM PLACE THE SAME BARBELL

This is the sharpest answer to *"a unified system, not a series of them."*

| engine | lines | who calls it |
|---|---|---|
| `_shared/week-model/` (model + resolve + adapter) | **1,018** | Strong Focus composer; the wizard's suggester + health badge |
| `_shared/week-solver.ts` (slot model) | **1,470** | `generate-run-plan/generators/assign-days-solver.ts`; `strength-system/placement/solver.ts` |
| `_shared/week-optimizer.ts` | **2,434** | triathlon generator, combined plan, create-goal, arc-setup-chat |
| `strength-system/placement/` (strategy + solver + slot-resolver + simple) | **1,025** | `generate-run-plan/strength-overlay.ts` |
| `strength-system/place-week.ts` | **436** | Strong Focus composer — **unreachable arm only, see 2.2** |
| `_shared/schedule-session-constraints.ts` (the matrix, shared) | **619** | all of the above |

**~7,000 lines, five engines, one shared constraint matrix.**

⛔ **The consequence in one sentence: the same athlete's squat is placed by two different laws
depending on which door they came in.** Build a Strong Focus block and the barbell is placed by the
DEBT model — sessions emit costs on named recovery systems, checked around a repeating week. Build a
marathon with strength kept and the barbell is placed by `strength-system/placement/` on top of the
SLOT model — legal-and-free weekdays, pairwise hour clearances, a methodology strategy factory
(Higdon vs Daniels).

⚠️ **Both files know about each other and both say "not my path."** `placement/solver.ts` header:
*"GET STRONGER IS NOT THIS PATH AND MUST NOT BE TOUCHED."* `model.ts` header still says *"NOTHING
IMPORTS THIS YET"* — which is now stale; `solver-adapter.ts` imports it and the composer imports the
adapter at `:131`. The separation is deliberate and documented; **it is still two laws for one
tissue claim.** A 48-hour clearance between heavy legs and a long run is either true about the body or
it is not — it cannot be true on one door and a weekday preference on the other.

---

## 2.2 ⛔ THE ENGINE SWAP LEFT TWELVE UNREACHABLE BRANCHES, AND ONE OF THEM IS A RULING

`solver-adapter.ts` has exactly two `return` statements: `status: 'solved'` and
`status: 'compromised'`. **It cannot return `'unsolvable'`, and its own comment says so** —
*"the `unsolvable` arm of `SolverResult` stays in the type for the old engine's sake and this adapter
never returns it."*

The composer tests `status === 'unsolvable'` in **twelve places** (`:3309, 3319, 3342, 3367, 3401,
3427, 3432, 3471, 3482, 3495, 3522, 3774`). Every one is dead. What died with them:

1. ⛔ **The hard-day yield loop (`:3309`).** The composer's own documented ruling —
   *"WHEN THE WEEK CANNOT HOLD EVERYTHING, A HARD DAY YIELDS — THE BAR DOES NOT"*, with the measured
   case named as **Michael's own week** — is unreachable. `yieldedHardDays` is always `[]`, so
   `hardYieldCompromises` (`:3612`) is always `[]`. **No hard day has yielded since the swap, and
   nobody has been told one didn't.**
2. **The `place-week` fallback (`:3483`).** `placeLiftingWeek` is now called only from the dead arm —
   436 lines reachable by nothing on this path.
3. **`solverRefusal` (`:3495`) is always empty in BOTH arms.** The breach arm is unreachable; the else
   arm is `solved.notes`, and the adapter returns `notes: []` unconditionally.
4. **A dead import.** `easyRunAnchorAdjacencyPenalty` is imported at `:107` and **never called** —
   the four other mentions are comments recording that the second scorer was deleted. It pulls
   `week-optimizer.ts` (2,434 lines) into the strength bundle for nothing.

⚠️ **Is the outcome wrong?** Not obviously. Michael's 2026-08-17 ruling is *"the engine's job is to
warn them of the biological cost, not physically block them"* — so never refusing is correct, and the
live `compromised` path does surface the breach (`:3620`, tagged `kind: 'breach'`). **But the ruling
was made about days the ATHLETE pinned.** An over-subscribed week now ships with a breach rather than
dropping a hard day the ENGINE chose. ⚠️ **That is a question for Michael, not a call I should make.**

⛔ **This is precisely the finding `solver-adapter.ts` asked for and never got:** *"If a caller's
behaviour depends on one of them, that is a finding to report."* The caller's behaviour depended on
`unsolvable`. Twelve times.

---

## 2.3 ⛔ THE ENTIRE COMPROMISE CHANNEL IS SILENT — MEASURED, 61 OF 61

I ran the sweep (`scripts/dump-plans.ts`): **61 shapes, 61 built, 0 failed.**

**`placement_compromises` is empty on all 61.** Not one breach, not one cost, not one note — across
every volume, every hard-day mix, every long-day placement the sweep covers.

That means every one of these is currently unobserved in the whole reachable space:

- the hard-day yield note (structurally impossible — 2.2)
- the ride shortfall note (ENGINE-STATE already flagged this as *"MAY NOW BE UNREACHABLE"* — the
  sweep now confirms it fires on 0 of 61)
- the "no full rest day" note
- every clearance breach from `unmetNeeds`

⚠️ **Silence here is ambiguous and that is the problem.** It is consistent with "the resolver is good
enough that nothing breaches" — it protects the rest day by stacking and never refuses — and equally
consistent with "the channel is broken." **D-325 §7's entire premise is "state the cost, never
refuse", and right now the engine never refuses AND never states a cost.** Half of the doctrine is
unverified.

---

## 2.4 ⛔ THE GATE STOPS ONE STAGE BEFORE THE BUG

This is why Part 1's defect survived a 61-shape sweep and three test files.

`dump-plans.ts` calls `composeStrengthPrimaryPlan` and writes what the COMPOSER returns. Michael's
Threshold Ride appears in the sweep output as **`Threshold Ride (43m)`** — the composer's `duration`.
The athlete gets **24m**, because `materialize-plan` recomputes it. **The sweep is blind to the entire
materialization stage**, which is where the sessions actually acquire their steps, their durations and
their warm-ups.

And the four tokens that leak have **zero expander tests**: `grep` for `run_sprint`, `bike_thr`,
`run_thr`, `bike_vo2` across `materialize-plan/*.test.ts` returns nothing. The hill family — the family
that is CORRECT — has `hills-lap-button.test.ts`.

⛔ **The sessions with tests are the sessions that work.** That is not a coincidence and it is the
cheapest finding in this report.

---

## 2.5 THE WIZARD SIDE — WHAT IT COLLECTS AND WHAT IT LOSES

The Strong Focus flow is: `goal → train → tier → posture → volume → hardday → accessory → schedule →
confirm` (`getSteps:888`, `scheduleSteps:832`). The ordering is deliberate and correct — the accessory
card's rep totals depend on the endurance tier, which depends on volume AND hard-day count, so both
are asked first (`SPEC-viada-ingestion-order.md`). **No complaint about the order.** Three things
about what crosses the boundary:

**a. A routing key is being used as a discipline gate.** `run_days` ships only when
`state.posture?.strength === 'develop'` (`:1265`), while `target_weekly_miles` beside it ships
ungated. On Strong Focus strength is always `develop`, so it works — **by coincidence, not by
construction.** Any state where miles ship and the count does not lands on the default-to-2 chain in
2.0, and the athlete's typed mileage gets divided across two runs instead of four. ⚠️ **Question, not
a claim: is that state reachable?** I did not find a path to it; I also could not prove there isn't
one.

**b. Defaults are indistinguishable from answers, and the wizard has stopped asking some of the
questions.** `qualityRunTerrain` (Part 1, finding 4b) is the caught instance. The general shape:
a state field initialised to a real value, a question that was removed, and a seeder whose contract is
*"omitted when unset"* — which can never fire, because the field is never unset. ⛔ **Worth one sweep
of the wizard's initial state for other fields in the same position**, since the fix for one is not
the fix for the class.

**c. The `touchedUnits` mechanism is the right answer and it should be the ONLY answer.**
`NonRaceBuilder:2033` — *"EMPTY IS NOT THE QUESTION. TOUCHED IS."* That is the correct model for
"engine-designed default, athlete adjusts after", and it is applied to the long days and the hard
slots. It is **not** applied to `qualityRunTerrain`, to `runDays`, to `rideDays`, or to `swimDays` —
all of which carry engine defaults that reach the payload as though the athlete had chosen them.

---

## 2.6 WHAT "ONE SYSTEM" ACTUALLY MEANS HERE — THREE OBJECTS

Not a rewrite. Three named objects, each replacing a class of ad-hoc representations. Each is
independently shippable and each has a gate.

### Object 1 — `AthleteWeeklyIntent`. One shape for every discipline.

One typed object, built ONCE at the wizard boundary, with the hard days **already subtracted**, and
**read-only downstream.** Symmetric across run / bike / swim: how much, how often, which day is long,
what the pace anchor is, whether each field is an ANSWER or a DEFAULT.

- Kills the 9-name chain in 2.0 and the three independent defaults.
- Kills the run-is-flat / bike-is-nested asymmetry and the duplicate `targetWeeklyRideHours`.
- Makes "did the athlete answer this?" a question the object can answer — which is what fixes 2.5b
  as a class rather than one field at a time.
- ENGINE-STATE already has this queued and scoped: *"one discipline at a time, 61-shape sweep as the
  gate. ⛔ Not a rewrite."*

### Object 2 — `SessionSpec`. Core plus wrapper, one owner of duration.

Part 1 §4.1. The constructor takes the core prescription and the available budget and returns the
whole session, **and returns the minutes the budget subtracts, from the same computation.** A
zero-warm-up session becomes unrepresentable.

⚠️ **The gate has to move with it.** Extend `dump-plans.ts` to run each composed session through the
token expander and assert `budgeted === materialized`. **That single assertion catches all four
leaking sessions, and would have caught them on 2026-08-18.** Without it, Object 2 ships behind the
same blind gate that hid the bug.

### Object 3 — one placer.

Not "delete four engines this week." The order that is actually safe:

1. **Delete what is provably dead first** — the twelve `unsolvable` branches, the `place-week`
   fallback arm, the unused `easyRunAnchorAdjacencyPenalty` import. Zero behaviour change, and it
   makes the real surface visible. ⚠️ First get Michael's ruling on 2.2's open question: should an
   engine-chosen hard day still yield? If yes, that is a NEW term in the week-model, not a
   resurrection of the old loop.
2. **Make the compromise channel observably alive** (2.3) before removing anything else — a
   hand-built over-subscribed week that MUST produce a breach, as a permanent regression. Right now
   we cannot tell working from broken.
3. **Then** move `generate-run-plan`'s strength overlay onto the week-model, so one barbell has one
   law. That is the merge that actually answers "unified", and it is one door at a time with the
   sweep plus a run-plan fixture as the gate.

⛔ **What must NOT happen: a sixth engine.** The week-model is the right law and it is the only one
that states tissue cost directly. Everything else is a candidate for absorption or deletion, never a
peer.

---

## 2.7 HOW THIS COMPARES TO HOW COMMERCIAL APPS DO IT

⚠️ **Confidence stated per claim.** File formats I am confident about — they are published. Vendor
internals I am not, and I mark those.

### One intent object at the boundary — high confidence, this is the standard shape

TrainingPeaks Plan Builder, TrainerRoad Plan Builder, Runna and Garmin Coach all collect availability
ONCE, up front, into a single structure — which days, how many hours, which day is long — and every
downstream stage reads it. The athlete does not answer "how many runs" in a form whose value is then
re-derived by three services. **Object 1 is not an innovation; it is the field's default and we are
the outlier.**

### The steps ARE the duration — high confidence, this is published

Garmin FIT workout steps carry an `intensity` enum (`active | rest | warmup | cooldown | recovery`).
Zwift `.zwo` has `<Warmup>` and `<Cooldown>` as distinct elements. TrainingPeaks structured workouts
are step-typed the same way. **In all three, planned duration is the sum of the steps — there is no
second author-typed duration field.** Our composer has one, materialization overwrites it, and the
wizard renders the loser. Adopting the field's rule deletes the disagreement instead of reconciling
it.

### Placement: templates vs. optimizers — high confidence on the pattern, low on internals

The mainstream apps use a **weekly template with fixed session-type slots** — hard / easy / long
already alternating — and map the athlete's availability onto it. Discipline spread, day-off
protection and hard-day spacing are properties of the template, so nothing has to measure them.

⚠️ I am describing observed behaviour, not source; these are closed systems.

**We do something strictly harder and it is the right call:** an optimizer over a debt model honours
arbitrary athlete pins, states what it could not honour, and never refuses — none of which a template
can do. **The price is that everything a template gets for free must be an explicit term.** Two of
those terms are currently missing or blind:

- discipline spread → Part 1 §2, the term exists and cannot see clumping
- the cost channel → §2.3, structurally present and silent on 61 of 61

**So the honest answer to "does this scale": the architecture scales past the template apps. The
objective function and the gate do not scale with it yet** — and that gap, not the engine, is where
all six of the last two days' defects have come from.

### One law per tissue claim — this one is ours to state

No commercial app runs two schedulers with different laws over the same athlete's barbell, because
none of them grew four generators. §2.1 is not a gap relative to the field; it is a gap relative to
ourselves, and it is the one thing on this page that no external practice will tell us how to fix.

---

## 2.8 STATE AND WHAT IS STILL UNKNOWN

- **Nothing pushed, nothing deployed, no repo file changed.** `git status` clean apart from
  `test-outputs/` regenerated by the sweep and this report.
- **Measured in this pass:** 61/61 sweep builds, 0 compromises; adapter has 2 returns and neither is
  `unsolvable`; 12 dead branches; 1 unused import; 0 expander tests for the 4 leaking tokens;
  the 8-name/8-name concept counts; the 9-hop chain and 3 defaults.
- **Open questions for Michael, in order:**
  1. Should an ENGINE-chosen hard day still yield when the week cannot hold it, or is
     build-and-warn now the rule for both? (§2.2 — decides whether the dead loop is deleted or
     rebuilt as a week-model term.)
  2. Is the compromise channel's silence correct, or is it broken? (§2.3 — settled by one
     hand-built over-subscribed week.)
  3. Order of the three objects. My recommendation: **Object 2 first with its gate** (it is the
     safety issue and it is the smallest), then **Object 1 one discipline at a time**, then
     **Object 3 step 1 only** — delete what is provably dead — and stop there until 1 and 2 are
     verified on a device.
- **Not established:** whether §2.5a's gate is reachable; whether other wizard fields sit in
  `qualityRunTerrain`'s position (needs one sweep of the initial state); whether any of the 61
  shapes SHOULD have produced a compromise.
