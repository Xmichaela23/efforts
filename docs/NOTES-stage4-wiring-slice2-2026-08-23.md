# Stage 4, slice 2 — the edge wiring + the test week

**2026-08-23.** Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 4.
Design: `DECISIONS-2026-08-22-standing-plan-pivot.md` §2, §3, §4, §6, §9.
Slice 1: `NOTES-stage4-composer-strength5k-2026-08-23.md` (the composer — built, 30 tests, 44/44
mutations killed, Get Stronger proven byte-identical at `eb1d6796`).

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** |

---

# ⛔ PART 1 — WHAT IS AT THE WIRING POINT, WRITTEN DOWN BEFORE ANYTHING CHANGED

Read in full before the first edit: `generate-strength-plan/index.ts` (537 lines),
`create-goal-and-materialize-plan/index.ts` §Get Strong (:2479-2932),
`_shared/standing-plan/*` (all seven files), `strength-primary-plan.ts`'s return contract,
`_shared/block-identity.ts`, `_shared/strength-profiles.ts`, `rematerialize-strength-block/index.ts`,
`shared/strength-system/amrap-catch-up.ts`.

## 1.1 The gate is in TWO files, not one, and the pivot doc names the wrong one

Pivot §9 says *"wire through `generate-strength-plan`'s gate."* **`generate-strength-plan` has no
gate.** It is a builder with entry REFUSALS (missing 1RM → 409; any lift under 65 lb → 409). The
posture gate — `strength === 'develop'` and no endurance discipline at `develop` — lives at
`create-goal-and-materialize-plan/index.ts:2493`, one hop upstream, and decides which builder is
invoked at all.

So there are two seams, and they do different jobs:

| seam | what it owns | what the wiring does there |
|---|---|---|
| `create-goal:2493` | which builder gets called | untouched — the posture gate is already right |
| `generate-strength-plan` | which COMPOSER builds the block | **the frame resolver goes here** |

Wiring at `create-goal` would mean a second gate with the same condition in two files, which is the
exact disease this codebase has fixed four times (the ride-count `Math.min(3,…)` census in the
banner at `generate-strength-plan:34`). The frame resolver goes in the BUILDER.

## 1.2 What the builder already has in hand — and it is nearly everything

By the time `composeStrengthPrimaryPlan` is called at `:247`, this function has already:

- fetched `user_baselines` (`learned_fitness, performance_numbers, effort_paces, equipment`) — the
  composer's `EnduranceBaselines` is that same row shape. ⚠️ **`units` is NOT in the select** and
  `resolveEnduranceAnchors` reads it (swim only). Harmless for a run frame; added anyway so the
  anchors resolver is fed what it declares.
- read and validated the four barbell 1RMs through `readBarbellMaxes` — these ARE
  `ComposeArgs.seed1RMs`, key for key (`bench` / `squat` / `deadlift` / `overheadPress`).
- read `equipment.strength` server-side → `ComposeArgs.equipment`.
- resolved easy pace, threshold pace, 5K pace and FTP through the three shared resolvers.

**Nothing new has to be fetched for the strength half.** Two things are genuinely missing:
`competitionLifts` and `demonstratedWeeklyMiles`.

## 1.3 ⛔ `competitionLifts` IS NOT OPTIONAL — WITHOUT IT THE WHOLE BLOCK IS "BY FEEL"

`compose.ts:216`:

```ts
const movementIsTested = testedLift != null
  && args.competitionLifts[pattern] != null
  && movement.toLowerCase() === String(args.competitionLifts[pattern]).toLowerCase();
```

A slot only carries a weight when the athlete NAMED that movement as their competition lift. Wire
the composer with `competitionLifts: {}` and every strength row in twelve weeks reads `By feel`,
`load_prescribed: false` — a plan that looks composed and prescribes nothing. Slice 1's own notes
flag this (*"an input with no UI"*); the wizard that collects it is **stage 5**, not this slice.

**The resolution, and it is not an invention:** the entry gate already refuses any athlete who does
not have all four barbell 1RMs on file (`create-goal:2526`, `generate-strength-plan:165`). An athlete
in this plan has, by construction, declared the barbell big three. So the wiring seeds
`competitionLifts` from the gate's own four lifts and the wizard overrides it later.

⚠️ **Three entries, not four, and the missing one is deliberate.** `LIFT_FOR_PATTERN`
(`compose.ts:128`) maps `pull_upper → bench`. Seeding a `pull_upper` competition lift would hand a
row (a barbell row, a pull-up) **the bench press's working number** — `pull up @ 205 lb`, defect 1
of slice 1's own smoke run, re-entering through the wiring instead of the composer. The frame's
`competition`-role slots are only `push_upper`, `hinge_lower`, `press_lower`
(`frames.ts:132/145/158/168/174`); `pull_upper` never carries one. It stays unset.

⚠️ **AND OVERHEAD PRESS IS TESTED BUT NEVER LOADED.** `TEST_DAY_LIFTS[1] = ['bench','overheadPress']`
— week one tests it — and no slot in either column of `strength_5k` is a `push_upper` competition
slot that the athlete would fill with a press rather than a bench. So the OHP working number is
produced and never spent in this frame. Recorded as a fact of the frame, not fixed: p246 is the law,
and inventing a press slot would be exactly the silent authorship the work order forbids.

## 1.4 ⛔ THE REAL HOLE: THE TEST WEEK PRODUCES A NUMBER THAT NOTHING CAN RECEIVE

`sessions_by_week` is authored ONCE, all twelve weeks, at build time. The test happens in week one,
**after** the block is written. So at build time `workingNumbers` is necessarily empty and weeks 2-12
compose "by feel" — the test week works and the eleven weeks it exists to serve do not.

**This is the same shape as a problem this repo has already solved.**
`rematerialize-strength-block/index.ts` exists for precisely this: *"The reader could never live in
the composer: it authors all twelve weeks up front, so no verdict CAN exist for weeks that have not
happened. Something had to come back afterwards, and this is it."* Its laws:

- **it proposes, it does not silently write** — dry run by default, `apply: true` is the athlete's tap
- **it only rewrites weeks that have not started** — history is not editable

The test-week reader has the same shape and the same laws, and it reuses the same machinery:
`extractAmrapSets` (`amrap-catch-up.ts:211`) already pulls `set_plan[].amrap === true` +
`completed === true` sets out of stored `workouts` rows, which is **exactly** what
`testDaySession` stamps on the last pretest step (`compose.ts:325`).

⚠️ **ONE BLOCKER FOUND IN THE COMPOSER, AND IT IS THIS SLICE'S BUSINESS.** `testDaySession` writes
`name: lift` — the raw key. The athlete sees an exercise called `overheadPress`, and
`liftRefForExercise` (the reader) does not match it: its regex is `/overhead press|^press$|military/`
and `"overheadpress"` matches none of them. So the one set the whole block depends on would be
logged under a name the reader cannot resolve. Named properly, and pinned by test.

## 1.5 Downstream readers that must be told what this plan is

`plans.config.strength_protocol` is the app's ONE protocol stamp (`block-identity.ts:246`) and
`protocolKnown` is `hasOwnProperty(PROTOCOL_PROFILES, id)` (`:380`). A stamp of `standing_plan` with
no `PROTOCOL_PROFILES` entry means:

- `protocolKnown: false` → `effortRead: 'none'` → every effort-aware surface goes quiet
- `strength-profiles.ts:408` logs *"No PROTOCOL_PROFILES entry … falling back to durability (flat RIR
  2.5 for the whole block)"* — an ME single at 95% judged against a hypertrophy RIR target

So the protocol gets a profile entry in the same change that starts emitting it. That is this file's
own stated rule (`:441`, `:450`): *"Registered here at the same time the composer started emitting
them — an unrecognised name resolves to the default silently, and that silence is Q-192's whole
failure mode."*

**Phase names are already safe:** `normalizePhaseKey` covers `test` → taper, `base`, `taper`
(`strength-profiles.ts:433-454`). The standing plan emits only names in that set.

## 1.6 What "byte-identical" can and cannot mean here

`composeStrengthPrimaryPlan` is not edited and not imported by anything new — the hash test from
slice 1 still holds and is re-run at close. What DOES change is **who reaches it**: an athlete whose
frame resolves is routed to the new composer instead. That is the wiring, and it is what the banner
asks for. Every athlete whose frame does NOT resolve — cyclist, strength-only, no run kept — takes
the existing path unchanged, and that is pinned by a routing test in both directions.

## 1.7 The plan-row contract is already compatible — nothing new is invented

`standing-plan/compose.ts`'s `PlanSession` is field-for-field identical to
`strength-primary-plan.ts:559`'s (`day, type, name, description, duration, strength_exercises,
steps_preset, tags`). The insert at `generate-strength-plan:412` needs a `training_max` for
`plans.config`; the Standing Plan **must not write one** (pivot §3 — the working number never touches
that key, three live readers). It writes its own key instead.

---

# PART 2 — WHAT WAS BUILT

## 2.1 The fork, and where it is

`generate-strength-plan/index.ts`. Everything above the fork is **shared and unchanged** — the
baselines read, the four 1RMs, both entry refusals, the equipment, the three pace/FTP resolvers.
Both composers need exactly those, so a second door would have meant a second copy of the entry gate.

```
create-goal:2493   strength=develop, no endurance=develop   →  which BUILDER   (untouched)
generate-strength-plan   resolveFrame(position)             →  which COMPOSER  (new)
    frame resolves  →  Standing Plan  →  its own insert, its own config key
    frame is null   →  Get Stronger   →  the existing insert, byte for byte
```

`resolveFrame` returns `null` **with a reason**, which is logged, for: a cyclist (Cycling: Base,
p278, not built), no endurance held, **a kept bike**, **a kept swim**.

⛔ **A kept bike or swim REFUSES the frame rather than being dropped from the block.** Every
endurance slot in `strength_5k` is a `run_*` family — sport-slot assignment is pivot §2's own work
and it is not built. Routing a bike-keeping athlete here would delete twelve weeks of riding they
asked for and say nothing, which is the "collected at intake and then discarded" pattern
`create-goal` has fixed three times. Get Stronger carries the bike and books the swim, so the
fallback is strictly better for that athlete. **This gate opens the moment §2's assignment lands.**

⚠️ **And the bike test is the `bike` OBJECT, not the forwarded ride hours.** `create-goal` forwards
`target_weekly_ride_hours` off the goal's prefs with **no posture gate**, so a runner who answered
that question in an earlier block still carries the number. Reading it as "kept a bike" would refuse
the frame on a stale answer. Pinned by test and by mutation.

## 2.2 New files

| file | what |
|---|---|
| `standing-plan/frame-resolver.ts` | the dial's sport half + `defaultCompetitionLifts` |
| `standing-plan/demonstrated-history.ts` | weekly run miles from logged runs — the tier gate's input |
| `standing-plan/plan-row.ts` | a composed block → the plan row shape, and the `standing_plan` config key |
| `standing-plan/restate.ts` | the diff: week one's test → the weeks that have not started |
| `rematerialize-standing-block/index.ts` | the edge function that reads the test back |
| `standing-plan/standing-plan-wiring.test.ts` | 29 tests |

Changed: `working-number.ts` (the name table + `readTestWeek`), `compose.ts` (test-session naming,
`target_rir`), `strength-profiles.ts` (the protocol entry), `generate-strength-plan/index.ts` (the
fork), `standing-plan.test.ts` (two lints widened).

## 2.3 The test week, closed end to end

**The hole:** `sessions_by_week` is authored once at build time and the test is in week one, so the
block is written with no working number for any lift and weeks 2-12 open on "By feel".

**The close**, and it borrows `rematerialize-strength-block`'s two laws rather than its arithmetic:

1. `readTestWeek` pulls the completed `amrap` set out of week one's logged sessions.
2. `composeBlock` re-runs — **the same composer that wrote the block**, one argument filled in. No
   second percentage table; a rewrite with its own ramp would be a different programme.
3. `restateFromTest` diffs, matched on **week + weekday + movement name**, all three.
4. `rematerialize-standing-block` **proposes**; `apply: true` writes. Only weeks strictly after the
   live week move.

⛔ **The working numbers are stored under `plans.config.standing_plan.working_numbers`. There is no
`training_max` key anywhere on a Standing Plan row**, and a test asserts the whole row is free of the
string. Pivot §3: that key is Wendler's 85% of a TRUE 1RM with three live readers.

## 2.4 Four defects the wiring exposed

1. ⛔ **`competitionLifts` was empty and would have shipped a block that prescribes nothing.**
   `movementIsTested` requires the movement to BE the named competition lift, so twelve weeks would
   have read `By feel`. Seeded from the four lifts the entry gate already demands. ⚠️ **Three
   entries, not four** — `LIFT_FOR_PATTERN` maps `pull_upper → bench`, so seeding a pull would hand
   a barbell row the bench's number: `pull up @ 205 lb`, slice 1's first smoke defect, re-entering
   through the wiring.
2. ⛔ **The test session named its exercises by the raw key** (`overheadPress` on a card), so the one
   set the entire block depends on was logged under a name no reader could resolve. Named from one
   table now, and the test tests **the movement the block will prescribe** — it has to, or the
   working number is one nothing spends.
3. ⚠️ **The `units` column was never selected** while `resolveEnduranceAnchors` declares it — the
   SELECT-projection footgun. Added; it feeds the swim anchor only.
4. ⚠️ **`standing_plan` had no `PROTOCOL_PROFILES` entry**, which would have fallen through to
   `durability` (flat RIR 2.5 for twelve weeks) and read as `protocolKnown: false`. Registered in the
   same change that starts emitting it — that file's own rule.

## 2.5 Two decisions taken at the point the wiring hit them

| gap | decided | whose |
|---|---|---|
| **no scheduled deload** | none, ever, on a raceless block | ⛔ **HIS** — p120: *"overreach to deload will always be suboptimal for at least one discipline."* The standard week runs indefinitely; the taper column is a tool you DEPLOY (p247, two weeks from a meet or a 5K). |
| **demonstrated-miles window** | 28 days | ⚠️ **OURS**, labelled — but it is the app's own chronic window (every ACWR in `_shared/acwr.ts`), not a fresh choice |
| **reps-in-reserve on the row** | his per-intent band, midpoint | HIS band (p218: DE/SKILL 3-4, HYP 0-2, ME none); ⚠️ the midpoint is ours |

⛔ **`workload_by_discipline.run` WAS NOT USED, AND HERE IS WHY — TWO LIVE READERS DISAGREE BY 10×:**

    `_shared/end-plan-core.ts:88`      treats it AS miles            (peak_weekly_miles)
    `_shared/planning-context.ts:389`  divides it by 10 to get miles (current_weekly_miles)

One is wrong. A 25-mile gate fed by a field whose unit is contested would fire, or fail to, on a
factor of ten. The tier reads raw `workouts.distance` instead, where the unit IS settled
(`daily-ledger.ts:208` and `compute-facts:126` both read kilometres). ⚠️ **Filed as a finding, not
fixed — it is not this stage's business.**

---

# PART 3 — THE GATE

**59 tests** (30 from slice 1, 29 new). `deno test --no-check --allow-read
supabase/functions/_shared/standing-plan/`

**35 mutations, 35 killed by their intended test.** Harness at `<scratchpad>/mutate-slice2.py`;
restores the tree on every exit path.

### ⛔ GET STRONGER IS BYTE-IDENTICAL — PROVEN AGAIN, AFTER THE WIRING

A `git worktree` at HEAD (pre-slice-2) and the working tree each composed **three** Get Stronger
blocks — a runner, a cyclist, and strength-only — and hashed the lot.
Both: `f7ece1aa801e60d8cb5f99761db787c8e6de091585118ea7057c50528fa322fb`. Re-run at close, unchanged.

⚠️ **What that proves and what it does not.** The Get Stronger COMPOSER is untouched. What the
wiring changes is **who reaches it**: a strength-leading runner with no bike and no swim now takes
the Standing Plan. Every other position takes the old path, and a routing test pins both directions.

### Two mutations survived first time — both were real gaps in the restater

| what survived | why | fix |
|---|---|---|
| a by-feel row gets overwritten | the guard read `load_prescribed === false`, and `topWorkWeight` already returns null for every such row — a dead guard | deleted, and a new test covers the case the guard ACTUALLY holds: **a second restate pass must not blank a weight the first pass set**, which happens when one lift's test stops reading |
| matched on week + name, ignoring the weekday | the test checked WHICH weeks moved, never what they moved TO | every rewritten weight is now asserted against its own composed slot. Not theoretical: bench is the competition push on day 1 (ME, 100%) and again on day 4 (DE, ~80%), so a day-blind match hands Thursday's speed row Monday's maximal weight |

### ⛔ CLIENT-REACHABLE — RUN, not assumed

An esbuild browser bundle of the new surface — `resolveFrame` → `buildStandingPlanRow` →
`readTestWeek` → `composeBlock` → `restateFromTest` — **232 kB, executed**: 12 weeks, `Test 1-1` /
`Base 2-12`, `working_numbers: null` and `test_read: false` at build, four runs in week two, five
lifting days, and after reading a 185 × 5 bench test, **bench at 205 lb in week two** — the same
number slice 1's probe reached. ⚠️ The probe was temporary; **this is a thing that was RUN, not a
thing that is watched.**

### The two lints now read the DIRECTORY, not a list

`standing-plan.test.ts`'s "never reaches into the live strength path" and "nothing that would break
in a browser" both enumerated six filenames. Slice 2 added five files, all of which would have gone
unlinted. A lint with a list has to be maintained to keep working — the same disease as the three
hand-maintained routing tables in `CLAUDE.md`.

### Pre-existing failures, unchanged by this work

`deno test supabase/functions/_shared/ supabase/functions/shared/` → **2567 passed, 2 failed**, and
**both fail identically at HEAD** (verified by stashing this work and re-running):

- `anchor-resolver-lint.test.ts` — `lthr::src/components/TrainingBaselines.tsx` reads a raw anchor
- `hard-run-terrain.test.ts` — an uncaught error from `materialize-plan/index.ts:3319`

`deno check` on the new files reports only the pre-existing `state-trend/assemble.ts:1134` error,
which reaches this module transitively through `planning-context.ts`. On `main` already.

---

# PART 4 — WHAT THE NEXT SLICE SHOULD KNOW

- ⚠️ **NOTHING CALLS `rematerialize-standing-block` YET.** It is written, gated and tested, and no
  surface offers the tap. That is the first thing slice 3 has to place: **after week one, the athlete
  needs to be asked whether to fill the block in.** Until then a Standing Plan block runs its test
  week and then twelve weeks of "By feel".
- ⛔ **THE FRAME OWNS THE WEEKDAYS AND THE ATHLETE'S PINNED LONG DAY IS NOT HONOURED.** The work
  order is explicit — *"the day order is not the law, the pairings are"*, and the composer should
  anchor on the athlete's fixed points (stage 4, gap 1). It does not: `compose.ts` maps frame day N
  onto weekday N, so the long run is always Saturday. The wiring **tells the athlete** when their
  pinned day cannot be honoured rather than moving it silently, but that is a note, not a fix.
- ⚠️ **THE COMPETITION LIFTS ARE SEEDED, NOT ASKED.** Pivot §6's *"name the lift you want a number
  on"* is the stage 5 wizard's question. Today every block tests and prescribes the barbell big
  three by default. `ComposeArgs.competitionLifts` already takes the answer.
- ⚠️ **OVERHEAD PRESS IS TESTED AND NEVER LOADED.** `TEST_DAY_LIFTS[1]` measures it and no slot in
  either column of `strength_5k` is a `push_upper` competition slot an athlete would fill with a
  press rather than a bench. Recorded as a fact of the frame, not fixed — p246 is the law.
- ⚠️ **AN ME ROW STILL RECEIVES A DERIVED RIR TARGET DOWNSTREAM.** p218 says "no RIR target" for ME
  in as many words, and the composer stamps none — but `protocolUsesRir` is a protocol-wide flag, so
  `materialize-plan` reads one off the RPE chart for any row carrying none. At 90-100% for 1-5 reps
  that lands at essentially zero reserve, which restates the prescription rather than contradicting
  it. **Filed rather than fixed by widening a shared flag on this stage's account.**
- ⚠️ **`workload_by_discipline.run`'s unit is contested by two live readers** — see §2.5. Worth a
  Q-entry of its own.
- **The plyometric day counts as a lifting day to `strength_days`**, which reports
  monday/tuesday/wednesday/thursday/friday. That is what the calendar shows, so it is honest — but a
  surface that reads it as "five barbell days" would be wrong.
