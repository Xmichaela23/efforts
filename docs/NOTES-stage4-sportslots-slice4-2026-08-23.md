# Stage 4, slice 4 — sport-slot assignment: runs and rides in one week

**2026-08-23.** Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 4.
Design: `DECISIONS-2026-08-22-standing-plan-pivot.md` §2, plus Michael's swim ruling of 2026-08-23.
Slices 1–3: `NOTES-stage4-composer-strength5k-2026-08-23.md`,
`NOTES-stage4-wiring-slice2-2026-08-23.md`, `NOTES-stage4-live-slice3-2026-08-23.md`.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** |

---

# ⛔ PART 1 — WHAT I FOUND, WRITTEN DOWN BEFORE ANYTHING CHANGED

Read first: `_shared/endurance-library/types.ts` + `source-rules.ts` (all thirteen families),
`_shared/standing-plan/session-vocabulary.ts`, `frames.ts`, `compose.ts`'s endurance loop,
`frame-resolver.ts`, `materialize-plan`'s `expandBikeToken` (:1925) and its swim expanders (:2773+),
and the corpus at Part E1d.

## 1.1 The library already has every family. Nothing needs building there.

`FamilyId` carries **thirteen** families and all of them are implemented in `source-rules.ts` with
their own archetypes, bands and citations:

| sport | families | pages |
|---|---|---|
| run | `run_sprint_power` `run_mlss` `run_near_threshold` `run_vt1` `run_lsd` | p229-235 |
| ride | `ride_sprints` `ride_anaerobic` `ride_vo2` `ride_sweet_spot` `ride_endurance` | p236-239 |
| swim | `swim_endurance` `swim_speed` `swim_open_water` | p240-241 |

`resolveEnduranceAnchors` already resolves all three anchors — run pace, **ride watts off FTP**, swim
sec/100m — through the three shared resolvers. ⛔ **So the ride half is a STARVED path, not a missing
one:** the sessions, the anchors and the wattage resolution all exist and have never been called by
this frame.

## 1.2 The translation edge is the ONE thing that is genuinely run-only

`session-vocabulary.ts` switches on four run families and **throws** on anything else:

```ts
default:
  throw new Error(`no session-vocabulary translation for family: ${session.family}`);
```

That throw is correct and deliberate (slice 1: *"fail loudly rather than emit a token the
materializer will silently drop"*), and it is the reason a ride slot cannot exist today. It is also
the only place that has to learn anything new — **and it learns tokens the materializer already
parses, not new vocabulary.** Verified against the expanders:

| family | token | materializer | band |
|---|---|---|---|
| `ride_sweet_spot` | `bike_ss_{r}x{m}min_R{n}min` | `:1967` | 85-95% FTP |
| `ride_sweet_spot` (harder) | `bike_thr_{r}x{m}min_R{n}min` | `:1980` | 95-105% FTP |
| `ride_vo2` | `bike_vo2_{r}x{m}min_R{n}min` | `:1983` | 110-120% FTP |
| `ride_endurance` | `bike_endurance_{n}min` | `:1986` | 65-75% FTP |
| wrappers | `warmup_bike_quality_{n}min_fastpedal`, `cooldown_bike_{n}min` | `:1936`, `:1950` | 55-70% / 40-55% |
| `swim_endurance` | `swim_aerobic_{r}x{d}{unit}_r{n}`, `swim_drills_…`, `swim_warmup/cooldown_…` | `:2889`, `:2852`, `:2773` | — |

⚠️ **The wrapper function is run-only too** — `wrapperTokens` hardcodes `warmup_run_…` /
`cooldown_run_…`, so a ride would arrive with a run warm-up on it.

## 1.3 The family equivalence has to be MATCHED, and `workFloorPct` is the number to match on

Every family in `source-rules.ts` states its own work floor as a percentage of threshold. That makes
the substitution a lookup rather than a judgement:

| run slot | floor | closest ride family | floor / archetype band |
|---|---|---|---|
| `run_mlss` | **1.00** | `ride_sweet_spot`, archetype `medium` | work at **0.95-1.00** |
| `run_near_threshold` | **0.85** | `ride_sweet_spot`, archetype `long` | work at **0.90** |
| `run_vt1` | 0 | `ride_endurance`, `steady` | below 0.75 |
| `run_lsd` | 0 | `ride_endurance`, `steady` | below 0.75 |

⛔ **`ride_vo2` IS NOT THE ANSWER FOR THE HARD SLOT, and this is the trap.** Its floor is **1.10** —
above the run slot it would replace. Substituting it would **add intensity while claiming to convert**,
which is the one thing pivot §2 forbids. Sweet spot's own stated intent is *"as close to threshold as
possible without exceeding it"* (pp238-239), which is what an MLSS slot is asking for.

⚠️ **The equivalence itself is OURS.** p275 gives the permission — *"any power-metered non-impact
modality"*, and the LSR may be a ride — but the corpus contains **no family-to-family table
anywhere**. Matching on the stated floor is our method and is labelled at the site.

## 1.4 ⛔ THE HAIRCUT IS CAUSED BY RUNNING, IN HIS OWN WORDS

Corpus Part E1d, p247, verbatim:

> *"**Monday's run is fairly challenging**, given that there is an ME lower session the next day. For
> the first few weeks, you may notice that the ME lower session is slightly hindered by lingering
> fatigue. As such, a 3 to 4 percent reduction in working 1RM should be assumed here."*

**The subject of that sentence is the run.** `progression.ts` already says the same thing —
*"Caused by Monday's run landing before Tuesday's ME lower"* — and `compose.ts` applies it on
`isLower` alone, with no reference to what day 1's endurance session actually is.

⛔ **So a bike-heavy mix currently inherits a run-specific reduction, blindly.** And his OWN p280
reasoning points the other way: hard sessions go on the bike *because no impact means the intensity
does not tax the lifts.* Taking 3.5% off the squat for a session he says does not tax the lifts is the
plan contradicting itself one page apart.

⚠️ **THE SOURCE DOES NOT ADDRESS THE SUBSTITUTED CASE.** It states the haircut once, for this frame's
run layout, and never says what happens when day 1 is a ride. **So the bike-mix behaviour is OUR
READING and ships labelled as one** — the same treatment double progression and the 25-mile tier gate
already get.

## 1.5 What the refusal branch is, and what dies with it

`frame-resolver.ts` refuses the frame outright for a kept bike or swim, with two reasons that both
name pivot §2 as the thing that will open the gate. Its dependents:

- `resolveFrame`'s two refusal branches and their `reason` strings
- `standing-plan-wiring.test.ts` — the refusal cases in *"a strength-leading runner resolves the
  frame"*, the whole of *"a kept bike or swim refuses the frame rather than being dropped"*, and the
  two `resolveFrame` assertions at the end of the stale-ride-hours test
- `generate-strength-plan`'s `framePosition.bikeKept` / `swimDays` feed

⛔ **No-pre-launch-scaffolding: these die WHOLE.** Not commented out, not left behind a flag.

## 1.6 What the athlete's mix already is, at the wiring point

`generate-strength-plan` already receives and normalises all three, and the Standing Plan fork
currently reads them only to refuse:

| ask | field | owner |
|---|---|---|
| runs a week | `endurance_frequency` → `normalizeRunDays` | `_shared/athlete-weekly-intent.ts` |
| rides a week | `bike.days` → `normalizeRideDays` (1-4) | same |
| ride hours | `bike.hours` / `target_weekly_ride_hours` | same |
| swim days | `swim_days` → `normalizeSwimDays` (max 4) | same |

⚠️ **THE COUNTS ARE A MIX, NOT A COUNT — pivot §2: *"The program owns session count; athlete owns
sport + level."*** The frame has four endurance slots in the standard column and three in the taper,
fixed. So the athlete's numbers set a RATIO that is applied to the frame's own slot count; they never
change how many sessions the week holds. Reading them as counts would be the ask-15-get-20 defect the
whole work order exists to kill.

## 1.7 The swim ruling, against what the library offers

Michael, 2026-08-23: *off by default; if kept, easy laps and technique ONLY — the hard swim families
are never prescribed by this plan.*

| family | `source-rules.ts` says | verdict |
|---|---|---|
| `swim_endurance` | *"Level 1 sessions are simple and non-fatiguing"*; archetype **"Drill opener into long repeats"** | ⛔ **THE ONE** — level 1 only. Easy laps AND technique, in one session, already |
| `swim_speed` | *"all-out"* lengths | ⛔ never |
| `swim_open_water` | sighting, orientation, deep-water acclimation | ⛔ never — a skill session, not easy laps |

⛔ **So the swim needs no new session and no new level logic: it is `swim_endurance` at level 1, and
nothing else is reachable.** A lint is cheaper than a rule here.

---

# PART 2 — WHAT WAS BUILT

## 2.1 `_shared/standing-plan/sport-slots.ts` — the assigner

One pure function, `assignSports(days, mix)`, deciding the sport for **the whole column at once**.
It has to be column-wide: *"the hard sessions go on the bike"* and *"the running keeps its long
session"* are statements about the WEEK, and a slot-by-slot decision inside the day loop can see
neither.

**The order is the ruling's, not an optimisation:**

1. **A kept swim takes ONE easy slot** — the least hard one that is not the long session.
2. **Rides take the HARD slots first** (pivot §2, p280: no impact, so the intensity there does not tax
   the lifts). ⛔ Placed by the dial, never asked.
3. **The long slot stays with the running athlete** — *"a held sport keeps its LONG session and loses
   its hard one."* It becomes a ride only when there is no running in the mix at all, which is p275's
   own permission.
4. Whatever is left takes the remaining share.

⛔ **THE ASK IS A RATIO, NOT A COUNT** (pivot §2: *"the program owns session count"*). `rideSlots =
round(rides / (runs + rides) × slotCount)`, then clamped so a kept sport never disappears. The frame
keeps its four endurance slots at every mix, absurd ones included — asserted.

## 2.2 The equivalence, matched on the stated work floor

| run slot | floor | → ride family | floor / archetype |
|---|---|---|---|
| `run_mlss` | 1.00 | `ride_sweet_spot` / `medium` | work at 0.95-1.00 |
| `run_near_threshold` | 0.85 | `ride_sweet_spot` / `long` | work at 0.90 |
| `run_vt1` | 0 | `ride_endurance` / `steady` | below 0.75 |
| `run_lsd` | 0 | `ride_endurance` / `steady` | below 0.75 |

⛔⛔ **`ride_vo2` IS NOT THE ANSWER FOR THE HARD SLOT, AND THAT IS THE TRAP.** Its floor is **1.10** —
above the run slot it replaces. Substituting it would **add intensity while claiming to convert**,
the one thing pivot §2 forbids. A test asserts the rule against the library's own `workFloorPct`
values, so a future edit to either the table or the families fails there.

⚠️ **The table is OURS** (`RIDE_EQUIVALENCE_IS_OURS`). p275 permits the modality swap and says a ride
may stand in for the long run; the corpus has no family-to-family mapping anywhere.

## 2.3 The swim — one session, one level

⛔ Michael, 2026-08-23: *off by default; if kept, easy laps and technique ONLY.*
`swim_endurance` at **level 1** is that session and the library already says so — *"Level 1 sessions
are simple and non-fatiguing"*, archetype *"Drill opener into long repeats"*, so the technique work is
already inside it. `swim_speed` (all-out) and `swim_open_water` (a sighting skill) are **never
reachable**, asserted across every mix and both columns.

⚠️ A column with no easy slot books **no swim and says so** — never a silent drop.

## 2.4 The translation edge learns two sports — and no new words

Every token below is one the materializer already parses, checked against `expandBikeToken` (:1925)
and the swim expanders (:2773+):

`warmup_bike_quality_{n}min_fastpedal` · `cooldown_bike_{n}min` · `bike_ss_{r}x{m}min_R{n}min` ·
`bike_thr_{r}x{m}min_R{n}min` · `bike_endurance_{n}min` · `swim_warmup_{n}m` · `swim_cooldown_{n}m` ·
`swim_aerobic_{r}x{d}m_r{n}`

⚠️ **The wrapper was run-only too** — `wrapperTokens` hardcoded `warmup_run_…` for everything, so a
ride would have reached the watch wearing a run warm-up. It is per sport now, and a test asserts each
sport opens with its own.

⛔ **The `default:` throw is kept and now covers more:** `ride_vo2`, `ride_anaerobic`, `ride_sprints`,
`swim_speed` and `swim_open_water` all still fail loudly. None is reachable from the assignment, and
the throw is the tripwire if one ever becomes reachable by accident.

## 2.5 ⛔ THE HAIRCUT NOW ASKS WHAT DAY 1 ACTUALLY IS

p247's subject is the run: *"**Monday's run is fairly challenging**, given that there is an ME lower
session the next day… a 3 to 4 percent reduction in working 1RM should be assumed here."*

Until this slice, day 1 was always a run, so keying the haircut on `isLower` alone was **right by
accident**. It is not right once the hard session can be a ride — and his own p280 reasoning for
moving it there is that **no impact means it does not tax the lifts**. Taking 3.5% off the squat for a
session he says does not tax the lifts would be the plan contradicting itself one page apart.

`prescribedLoad` takes `hardRunBeforeLower`, supplied by the assigner's `hardRunBeforeMeLower`.
⚠️ **Absent defaults to TRUE** — the run layout, and the pre-slice-4 behaviour exactly.

⚠️ **THE SUBSTITUTED CASE IS OURS AND SHIPS LABELLED** (`HAIRCUT_CAUSE_IS_OURS`). His are the
reduction, its size, its phase-out rate, its length and its stated cause. Ours is the inference that a
bike-heavy week does not inherit it. A bike-mix block **says so on the plan**; a running block keeps
saying the opposite, in his voice, with his citation.

**Measured, week 2, same athlete:** squat **260 lb** on an all-run mix, **270 lb** on a bike mix.

## 2.6 The slice-2 refusal is gone whole

Deleted, not flagged off: both refusal branches, their copy, the `bikeKept` and `swimDays` fields on
`FramePosition`, the edge's feed for them, and the three tests that held them. A lint asserts none of
those strings survives anywhere.

⚠️ **What still refuses is only the positions with no frame built** — a cyclist with no running
(Cycling: Base, p278/p280) and an athlete holding no endurance at all.
⚠️ **A bike-only athlete is still refused even though every slot could now be a ride**, deliberately:
`strength_5k`'s SHAPE is built around running — four endurance sessions, the plyometric day, and a
haircut whose stated cause is a run — and handing a pure cyclist a week cut to a runner's page would
be a different program wearing this one's slot count.

## 2.7 The block carries its mix

`config.standing_plan.sport_mix` (the ask) and `sport_counts` (what the week actually holds, counted
off the built week rather than the ask). `rematerialize-standing-block` reads the mix back —
⛔ **same lesson as `day_offset` in slice 3**: re-deriving it from the athlete's CURRENT answers would
compose a ride where the calendar has a run, match nothing, and report a silent no-op.

⚠️ **Ride count comes from `bike.days`, never from ride HOURS.** `create-goal` forwards
`target_weekly_ride_hours` with no posture gate, so a runner who typed hours into an earlier block
still carries the number; reading it as "wants rides" would put riding into a week nobody asked for.
The slice-3 test that held this survives with its consequence rewritten.

---

# PART 3 — THE GATE

**109 tests** (30 slice 1, 27 slice 2, 28 slice 3, 24 new). **31 mutations, 31 killed by their
intended test.** Harness at `<scratchpad>/mutate-slice4.py`; restores the tree on every exit path.

### ⛔ GET STRONGER IS BYTE-IDENTICAL — PROVEN AFTER

`git worktree` at HEAD (slices 1-3, which were committed between sessions) versus the working tree,
three athlete shapes each:
**`f7ece1aa801e60d8cb5f99761db787c8e6de091585118ea7057c50528fa322fb`** both sides — and the same value
slices 2 and 3 recorded, so no slice has moved it.

### Nine mutations survived first time. One was a dead line; the rest were real test weaknesses.

| what survived | why | fix |
|---|---|---|
| **the ask is read as a literal COUNT** | for every mix the test used, `round(share × 4)` happened to EQUAL the number asked for — so a count passed all three | added **1 run + 1 ride**, which is two of each in a four-slot week and one of each as a count |
| a kept bike rounds away to nothing | 6-to-1 already rounds to 1, so the floor never fired | 9-to-1, where the ratio rounds to **zero** rides |
| a kept run is squeezed out | same | 1-to-9, where the ratio rounds to **all four** slots |
| **the long slot never converts with no running** | ⛔ **a DEAD LINE.** With no running the share is 1, the round is `open.length`, and the clamp's own `runs > 0 ? 1 : 0` term is already zero | **deleted**, like `lowerBodyHaircut`'s and `restate.ts`'s before it |
| the swim takes a hard slot | ⚠️ `strength_5k`'s standard column has **exactly one** easy non-long slot, so all three swim guards are satisfied by accident on the real frame | tested on a **synthetic column** with two easy slots, a hard one and a long one, plus a hard-only column that proves the guard by having nothing else |
| the swim takes the long day | same | same |
| the swim spreads over every easy slot | same | same |
| the block forgets its mix | the mutation was bad (`null ?? x` is `x`) | retargeted at the ternary |
| the equivalence ships unlabelled | the mutation was a syntax error, so no named test failed | retargeted at the constant |

### ⛔ CLIENT-REACHABLE AND RUN — three mixes, end to end

esbuild browser bundle, **241 kB, executed**, long run pinned to Sunday:

| mix | the week it built | squat wk2 |
|---|---|---|
| **4 runs** | Tue Hard Run · Thu Threshold Run · Fri Easy Run · Sun Long Run | **260 lb** |
| **2 runs 2 rides** | Tue **Hard Ride** · Thu **Hard Ride** · Fri Easy Run · **Sun Long Run** | **270 lb** |
| **1 run 3 rides + swim** | Tue Hard Ride · Thu Hard Ride · Fri **Easy Swim** · **Sun Long Run** | **270 lb** |

Tokens on the mixed week: `warmup_bike_quality_13min_fastpedal`, `bike_thr_7x3min_R2min`,
`bike_ss_4x10min_R4min`, `run_easy_28min`, `longrun_109min_easypace`, `swim_warmup_300m`,
`swim_aerobic_1x600m_r150` — every one already parsed downstream.

⛔ **The heavy leg day carries zero endurance in all three**, and the long session sits on the pinned
Sunday whichever sport it is. No `training_max` anywhere.

⚠️ The probe was temporary; **this is a thing that was RUN, not a thing that is watched.**

### Everything else

- Wider deno suite: **2617 passed, 2 failed** — the same two that fail at HEAD
  (`anchor-resolver-lint`, `hard-run-terrain`).
- The endurance library's own 28 tests still pass; **nothing in stage 1 was edited.**
- `deno check` on the new module reports only the pre-existing `state-trend/assemble.ts:1134` error.
- **No client file was touched by this slice**, so client lint is unchanged by construction (215 / 2 /
  2 / clean on the four files slice 3 touched).

⚠️ **THREE MODIFIED FILES IN THE TREE ARE NOT MINE** — `src/components/TrainingBaselines.tsx`,
`src/contexts/AppContext.tsx` and `docs/WORKORDER-the-standing-plan-2026-08-22.md` carry someone
else's uncommitted stage-5 work (a `liftingExperience` field, §8a). **Untouched by this slice**, and
flagged so a commit does not sweep them up unexamined.

---

# ⛔ PART 4 — IS THE MIXED-WEEK BLOCK STARTABLE FOR REAL?

**Yes — pending only deployment. There is no code left between an athlete and a mixed week.**

An athlete who keeps a bike now routes INTO the frame, gets their hard sessions on it, keeps their
long run on the day they pinned, has the leg-day haircut correctly dropped, and — once the test week
is logged — has all eleven remaining weeks filled in automatically. A kept swim gets one easy session.
None of that has run on a phone.

**⛔ THE NEXT STEP IS THE DEPLOY, NOT STAGE 5.** Three reasons:

1. **`rematerialize-standing-block` has still never been deployed**, and the logger calls it on every
   strength save. Until it exists the call errors, the error is swallowed by design (the save is
   safe), and **the block never fills its weights in**. That is the single biggest gap between the
   code and a working plan, and it is a deploy, not a build.
2. **Four slices of engine are stacked with zero device verification.** Verifying after stage 5 means
   diagnosing a wizard and an engine at the same time.
3. **Stage 5 changes the questions, not the engine.** Its own brief says the "how many runs / how many
   miles" screen goes because the program owns the count — which is already true in the engine.

**The deploy list** (unchanged from slice 3's Part 4 — slice 4 touched no new function):

```
supabase functions deploy \
  generate-strength-plan create-goal-and-materialize-plan rematerialize-standing-block \
  compute-snapshot analyze-strength-workout coach materialize-plan adapt-plan \
  --project-ref yyriamwvtvzlkumqrvpm
```

⚠️ The last five carry their own frozen copy of `_shared/strength-profiles.ts`, which slice 2 changed.

**⚠️ ONE KNOWN COST TO CARRY INTO STAGE 5.** The builder still asks *"how many runs a week"* and
*"how many rides"* as COUNTS, and this plan reads them as a RATIO. For any ask that fits the frame's
four slots those agree; for an athlete asking five runs they do not, and nothing on screen says so.
**That is stage 5's own first bullet** — the count screen goes because the program owns the count —
and it is a copy problem, not an engine one.
