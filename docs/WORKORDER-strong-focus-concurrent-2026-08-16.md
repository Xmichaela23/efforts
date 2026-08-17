# WORKORDER — Strong Focus: the concurrent-athlete governors · 2026-08-16

**Decided by Michael 2026-08-16, this chat.** Follows the Forever alignment shipped 2026-08-15
(D-432). The four lifts, the three-week cycle, 5s PRO leaders, 5/3/1 anchors, FSL, the assistance
model and all endurance placement are UNTOUCHED. What changes is the block's rhythm, who the
block shape is chosen for, and how fast the engine reacts to a missed rep.

**One sentence:** Wendler's mechanical progression, run inside a 3:1 recovery rhythm, with the
training max allowed to fall fast and rise slow.

---

## ⛔ WHY THIS BUILD IS DIFFERENT — read before scoping any section

**Michael, 2026-08-16:** *"this is the function of numerous plans being built — me not knowing my
head from my ass about training and landing on Wendler and Viada as the source of truth. I don't
mind using this as an opportunity to really make this a clean build. It will be the template we
build all the other training on, and what we lay race plans on."*

**So this block is not a feature. It is the reference implementation.** Every finding in this
document that reads as "two of something" is therefore a blocker, not a note:

- **Two placement engines — ONE ENGINE, decided by Michael 2026-08-16, and the direction was already
  written down.** ⛔ **AN EARLIER READING IN THIS DOCUMENT WAS BACKWARDS.** It said Strong Focus sits
  on a "private engine." It does not: `docs/SPEC-week-solver.md` (2026-07-27, Michael + Claude) exists
  precisely to **collapse the placement authorities into one solver**, its §7 build order calls that
  collapse *"the point of the whole document,"* and **Strong Focus is the one path already migrated
  to it.** `generate-combined-plan` and the run generators have not followed —
  `POLISH-PUNCH-LIST.md:210` ("the solver collapse", sized **large**). So the direction is
  **bring the others across to `week-solver`**, not bring Strong Focus back to `week-optimizer`.
  ⚠️ **Consolidated mode's rules live in `week-optimizer` (§6) and must travel with them.**
  ⛔ **AND THE SPEC NAMES ITS OWN FIRST BLOCKER, WHICH IS THE CELL TOUCHED TODAY** (§7 item −1,
  §8.4): the law contradicts itself on the long ride — 48h required from heavy legs **and** same-day
  permitted. **Nothing can be built on a rule set that disagrees with itself.** §6 rule B4/B5 settles
  the same-day half (forbidden) and the day-after half (48h). **Close §8.4 formally as part of that.**
- **Two vocabularies for one fact.** 5K pace had eight spellings and no owner (fixed 2026-08-16);
  easy pace still has two resolvers; threshold pace has an owner that one caller bypasses. **Each
  is one resolver and a deletion, and each is cheaper now than after the template is copied.**
- **Built-but-never-run capabilities.** Consolidated mode (§6), the day-count gate, the
  `highAerobicLoad` dial. **Wiring an existing thing is the job; building a second one is the
  failure mode this codebase has repeatedly taken.**

⛔ **THE STANDING CONSTRAINT FOR THIS BUILD: one law, one owner, one implementation.** §5b's
deletion list is the enforcement. If a change cannot delete what it replaces, stop and say so.

⚠️ **AND THE SOURCE OF TRUTH IS NAMED, WHICH IS THE POINT.** Wendler for the mechanical progression,
Viada for the concurrent governors. Every number in the code says whose it is. **A number with no
owner is the thing this build exists to stop reproducing.**

---

## Sources, and their standing

| source | standing |
|---|---|
| `docs/REFERENCE-531-forever-pp16-45.md` | **primary, page-pinned.** Transcribed from Michael's copy 2026-08-15. Cite by page. |
| *5/3/1, 2nd edition* — PDF at `~/Downloads/531_2nd_Edition_Hard_Copy.pdf` | **primary.** Licensed copy, never commit. |
| Alex Viada, *The Hybrid Athlete* | ⛔ **NOT READ.** Book arrives 2026-08-17. Every Viada attribution below is **secondary** — blog and summary sources, two of which contradicted each other on scheduling. Mark as such anywhere it lands in docs or copy. |
| Issurin / Zatsiorsky block-periodization figures (14-day clearance after maximal effort; ~3-week suppression window) | **general periodization tenets, NOT Viada quotes.** Michael's own concession 2026-08-16. Do not attribute to *The Hybrid Athlete*. |

⚠️ **The rationale below is sound independent of Viada.** Every mechanical change here is either
already licensed by Forever or is an explicit product call. Nothing waits on the book. When the book
arrives it may add dials (see §5), not reverse these.

---

## 0. The target 12-week map

| weeks | phase | main-lift scheme | supplemental | assistance / jumps |
|---|---|---|---|---|
| 1–3 | Leader 1 | 5s PRO (65/75/85 · 70/80/90 · 75/85/95, all ×5, no AMRAP) | FSL 5×5 | leader band |
| 4 | **7th-week deload** | 70%×5, 80%×3, 90%×1, TM×1 | none | light band |
| 5–7 | Leader 2 | same, TM stepped | FSL 5×5 | leader band |
| 8 | **7th-week deload** | same as week 4 | none | light band |
| 9–11 | Anchor | standard 5/3/1, top set AMRAP (5+/3+/1+), capped a rep short | none | anchor band |
| 12 | **TM test** | 70/80/90%×5, then TM × 3–5 | none | light band |

**There is no opening test week.** It yields; the light weeks do not. Rationale, Michael 2026-08-16:
a TM test is a data-collection event, not a training stimulus, and spending a week of recovery
capital to confirm a number the onboarding can derive is inefficient for an athlete carrying
endurance load. Forever's bolded *"prior to any Leader template… perform a training max test week"*
(p.21) is knowingly overridden — **stated as ours, not his**, and the plan copy must say the block
starts from a derived number rather than a tested one.

**The light week after every cycle is Forever's own provision, not a departure.** p.21: the 7th-week
deload *"may be used as a deload after any cycle, especially older lifters and taxing programs —
this is your responsibility."* A concurrent athlete is the taxing case.

**Arithmetic.** `3 weeks × cycles + (cycles − 1) light weeks + 1 closing test = 4 × cycles`.

⛔ **ONLY TWO LENGTHS EXIST — 12 AND 8. Decided 2026-08-16.**
- **12 weeks (default)** — 3 cycles, 2 leaders + 1 anchor. The map above.
- **8 weeks (short option)** — 2 cycles, 1 leader + 1 anchor: `LLL · deload · AAA · TM test`.
- **16 weeks is KILLED.** Four cycles cannot be 2:1. Two anchors back to back is the configuration
  this work order exists to prevent; three leaders and one anchor detrains heavy expression. Rather
  than pick a shape neither book supports, the length is not offered. `blockWeeks` becomes an
  allowlist of `{8, 12}`, not a snap-to-multiple.

---

## 0b. THE BUILD SEQUENCE — locked 2026-08-16

| build | what ships | what does NOT |
|---|---|---|
| **1 — the Wendler math** | §1 in full: 3:1 rhythm, no opening test, 8/12 only, 2:1 hardcoded, the miss on every lifting day, the asymmetric training max, one assistance band by competing stress, three lifting days, three accessory cards, the intake route to a lift number. | ⛔ **Nothing in §6 or §7.** Placement behaves exactly as today — the solver still SEPARATES hard days, because `integration_mode` is still `separated` for everyone. |
| **2 — the Viada routing (§6)** | Consolidated mode wired and defaulted; the long-ride rules; the A5 pairing law; the other generators brought onto `week-solver`; the day-count gate audited, extended if needed, and mounted. | — |
| **3 — the interval progression (§7)** | The threshold session (content still undesigned), the 3-week wave, pace/FTP fed to the composer. | — |

⛔ **THE RECEIPT COPY BELONGS TO BUILD 2, NOT BUILD 1.** *"We broke your stack to protect your long
ride"* cannot be written in build 1 — **there is no stacking in build 1 to break.** Writing it early
ships a sentence that can never fire. Same for the front-door warning: the gate depends on
`integration_mode`, which build 1 does not turn on.

⚠️ **What build 1 does inherit for free:** protection already outranks attraction, because in build 1
there is no attraction at all. The hard 48h clearances are live today and stay live.

## 1. The changes, in build order

### 1a. Delete the continuity branch; the ratio is 2 leaders : 1 anchor, hardcoded
`loading/wendler-531.ts` — `ContinuityTier`, `continuityTier()`, `ContinuitySignal`, and the tier
switch inside `leaderCount` all go. The supplier in `generate-strength-plan/index.ts:127-148`
(`weeksSince` / `logs` off `learned_fitness.strength_1rms`) goes with it.

**Why deleted rather than fixed:** an endurance load is a permanent stressor, so this athlete never
has the recovery headroom for back-to-back anchor cycles. The branch existed to graduate a trained
lifter toward more anchors, which is the wrong direction for every athlete this block serves.

⛔ **THIS CLOSES TWO LIVE BUGS FOUND 2026-08-16, both inside the deleted branch:**
1. `continuous` and `returning` returned 1 leader at three cycles → **1 leader : 2 anchors**, which
   is not one of Forever's three published models (3:2, 2:2, 2:1 — p.17).
2. That extra anchor cost a week, so the opening TM-test week was dropped for exactly those
   athletes — the shape furthest from the book, for the athletes most likely to use it.
Verified by execution 2026-08-16, not by reading.

**RESOLVED 2026-08-16: 16 weeks is not offered.** See §0. The rule is simply *all cycles but the
last are leaders, and there are never more than two* — which lands 12 on 2:1 and 8 on 1:1, and
leaves no length that needs a third answer.

### 1b. A light week after every cycle; no opening test
`layoutWeeks` / `blockLayoutFor` / `buildWeekMap`. Deloads become `cycles − 1` (one after every
cycle except the last, which is followed by the closing TM test). `openingTest` and its
prefer-if-it-fits search branch are removed entirely.

`blockWeeks` becomes an allowlist of `{8, 12}` (§0) rather than a snap-to-nearest-fit search.
`MIN_BLOCK_WEEKS` is 8.

### 1c. A miss is the top working set of every main lift day
`loading/cycle-verdicts.ts`. **This is the largest behavioural change in the work order.**

Today: `amrapRepsForLift` reads only a set flagged `amrap`, and `verdictForCycle` reads only week 3
of a cycle. Leader weeks carry no AMRAP, so **a missed rep in a leader week is invisible** — and a
fully-completed leader cycle returns `hold`, which is the freeze traced 2026-08-16 (a 300 lb squat
that forecasts to 320 at the anchor comes back 300 after any rebuild, with every session logged).

New rule: read the **final, heaviest working set** of every main lift session and compare logged
reps against the **prescribed** reps for that set.
- Leader weeks — prescribed 5. Four or fewer = miss. (5s PRO is never taken to failure; failing the
  prescription is the signal. Forever, 5s PRO parameters.)
- Anchor weeks — prescribed 5+/3+/1+. Below the number before the plus = miss. The AMRAP is still
  measured for e1RM and records exactly as today.
- Deload and TM-test weeks — **excluded from miss detection.** ⚠️ Ours, stated: a recovery week's
  prescribed single is not a strength test, and the TM-test week has its own verdict table
  (`verdictFromTmTestSet`).
- Not logged = **no evidence.** Still `hold`; still neither counts toward a stall nor clears one.

⛔ **AND THE CADENCE CHANGES WITH IT.** The measured point goes from one per cycle to one per week
per lift. `STALL_CONFIRM_SESSIONS = 2` is unchanged in value and much faster in effect: two
consecutive **weeks**, not two consecutive cycles. Roughly two months becomes roughly two weeks.
That is the intent — expect it, and expect the tests that pin the old cadence to need rewriting.

### 1d. The training max falls immediately and rises only at a boundary
`applyVerdict` / `workingNumberForCycles` and the rematerialize path.

- **Down:** a confirmed stall (two consecutive weekly misses on that lift) drops that lift's TM 10%
  and rewrites the remaining weeks of the current cycle plus everything after it. Per lift, never
  the whole block — Wendler p.31: *"you only need to decrease the one stalled lift."* Substance for
  the immediate drop is Forever p.21 (one or two reps at the top → lower it); the *timing* rule is
  ours and is stated as such.
- **Up:** unchanged. +5 upper / +10 lower, at cycle boundaries only, never mid-cycle.
- After a drop the counter clears and the next boundary steps up from the **new** number.

The plumbing exists: `StrengthLogger.tsx:4291` already calls `rematerialize-strength-block` on save,
and `useStrengthCalibration.ts` runs the preview / apply / undo path (D-434, slice b). This is a rule
change inside a live pipe, not new infrastructure.

⚠️ **Consent.** Slice b's sheet exists precisely so a weight never changes under the athlete without
a tap. A downward rewrite must ride that same path — announced, applied on tap, undoable. Do not
add a silent write; `adapt-plan`'s auto-progression was deleted for exactly that reason.

### 1e. The lift number at intake — REFRAMED 2026-08-16 after the trace
⛔ **THE PREMISE WAS WRONG. There is no field to change: the Strong Focus intake asks for no
strength number at all.** No 1RM field, no rep-set field, nothing in `NonRaceBuilder.tsx`. The
requirement is not even stated on that path — `:2142-2152` records that the precondition paragraph
was deliberately removed on 2026-08-05 and its natural home (a tier screen) is *"not built,
deliberately not guessed at."*

**What actually happens:** the gate is server-side and fires at build time.
`create-goal-and-materialize-plan/index.ts:2482-2493` calls `readBarbellMaxes` and refuses with
`missing_strength_baseline` — *"Log a baseline test in Training Baselines"* — and `:2501-2510`
refuses again below 65 lb per lift. `barbell-maxes.ts:34-40` reads scalar numbers only and its own
comment says it *"never guesses, never derives."*

⛔ **AND THE REP-SET DOOR ALREADY EXISTS — IT IS JUST SOMEWHERE ELSE.**
`TrainingBaselines.tsx:1798-1826` offers a baseline test: one all-out set per lift after guided
warm-ups. `save-baseline-test/index.ts:57-58` runs `estimate1RM(weight, reps)` server-side
(D-339, Wendler's own formula) and writes the result at `:187-193`. **The capability is built and
correct. What is missing is the route to it from the intake.**

**So the work is one of:**
- point the intake at the existing baseline test rather than letting the athlete reach a 409, or
- add the rep-set question to the intake and write through the same server path.

⚠️ **Do NOT build a second estimator or a second write path.** Michael's framing stands — *"a weight
you can move for 5 clean, fast reps right now"* beats asking for a max — but that is a question to
ask in front of machinery that already exists.

### 1f. Three accessory cards
The build flow shows four accessory cards while the plan merges deadlift + press onto one day — and
the merge keeps only the **first** lift's three picks (`strength-primary-plan.ts:2856-2863`).
**The athlete picks twelve movements and nine are used.**

- Picker shows **three** cards: Squat · Bench · Deadlift + Press. ⚠️ Unconditional under 1f-0 — no
  setting to read.
- **The merged card filters TWO slots, not three. Decided 2026-08-16.**
  - **Pull — filtered.** No barbell rows. Face pulls, pulldowns, chins.
  - **Single-leg/core — filtered.** No good mornings, no back raises. Direct ab work only.
  - **Push — LEFT FULLY OPEN.** Push-ups, dips, dumbbell bench, triceps — the standard menu.
    ⛔ **The threat on this day is spinal, not pectoral.** The filters exist because of the
    deadlift; the overhead press is a local stressor and loads neither the lower back nor the
    nervous system the same way. Forever p.24's balance rule is about heavy squat/deadlift volume
    — *"not everything should be 'in the red'"* — and it names rows and lower-back work, not
    pressing.
  - ⛔ **Three slots stay. Do not drop to two.** *"Three categories every training day"* (p.24) is
    the architecture; removing one for no biological reason breaks it.
- **The merged day sits at the band FLOOR — 25 reps per slot**, while the other two days scale on
  capacity within 25–50. The floor is what makes an open push menu safe: 25 total reps of dips or
  push-ups is a localised flush, not a structural stressor.

⚠️ **FILTER THE MENU, NEVER SWAP THE PICK.** The merged card must not OFFER a row or a good morning
in the first place. Substituting after the athlete has chosen — showing one movement and building
another with a sentence explaining why — is the re-roling model D-407 deleted. Restricting what is
offered on that day is a different thing and is fine. **Do not reintroduce the substitution note.**

⛔ **BUILD THE VOLUME CUT AS A DAY-LEVEL DIAL, NOT A DEADLIFT SPECIAL CASE.** "How much can this
specific day carry" is the same control the endurance governor will need (§5). Two implementations
of it is the doubled disease.

⚠️ Rep totals are **per day, not per lift** — Forever p.24 counts three categories per training day.
A stacked day gets one round, not two. That part is already correct in the merge.

### 1f-0. ⛔ THE LIFTING-DAYS CHOICE IS DELETED — three days, always
**Decided by Michael 2026-08-16, looking at the screen.** There is no four-day option. Every Strong
Focus block is **three days: Squat · Bench · Deadlift + Press.**

This is the simplification everything else in §1f was working around. The accessory picker does not
need to read a setting to know how many cards to show — it is always three.

**What goes:**
- The **"Lifting days" step (5 of 9)** in `NonRaceBuilder.tsx` — the whole screen. The wizard becomes
  8 steps.
- `state.liftingDays` and its `4` seed (`NonRaceBuilder.tsx:587`, `:1263`), and the conditional
  `lifting_days: 3` write at `:1024`.
- `liftingDays` from `StrengthPlanArgs` (`strength-primary-plan.ts:277`) and every branch on it —
  `:1831`, `:1857`, `:2118`, `:2150`, `:2824`. The three-day paths become unconditional.
- `lifting_days` plumbing in `generate-strength-plan/index.ts:34,49,166` and
  `create-goal-and-materialize-plan/index.ts:2743`.

⚠️ **`pullup-progression.ts:130` DEFAULTS `liftingDays = 4`** and divides the weekly chin volume by
it. ⛔ **DECIDED 2026-08-16: the WEEKLY TOTAL HOLDS and the per-day number rises** (~35 on three
days, up from 25). The adaptation driver is accumulated weekly volume at sub-maximal effort, not a
per-day figure, and the reps are split however the athlete likes anyway. The default must become 3
or every caller must pass it.

⛔ **AND THE BEGINNER ON-RAMP OWNS ITS OWN DOSE — it is not held to the 25 floor.** A band-assisted
athlete gets ~15 a day on three days, below the assistance band's floor. That is correct: a floor
for a movement someone cannot yet perform one clean rep of is a wall, not a floor. The progression
is the pull slot when it is on; the band governs slot picks, not the progression.

⚠️ **Legacy four-day blocks exist** (every block before this). `rematerialize-strength-block` must
not choke on one. Pre-launch, one athlete — small, but name it rather than discover it.

### 1f-1. The stale copy, which is live and wrong TODAY
Independent of everything else in this work order — these are wrong right now, since yesterday's
pairing change:
- `NonRaceBuilder.tsx:3120` — *"Bench and press share a day"*. **The engine pairs deadlift + press.**
- `NonRaceBuilder.tsx:3130` — *"Squat · Deadlift · Bench + Press"*. Same error.
- `NonRaceBuilder.tsx:586` — the comment *"the two upper lifts share a day; the test week still runs
  four"* is stale twice: wrong pair, and the four-day test week was deleted 2026-08-05.
- `NonRaceBuilder.tsx:3203, 3209, 3265, 3308` — *"Four lifting days"* / *"all four days"*, hardcoded
  on the accessory screen regardless of what was chosen one step earlier. This is what put four
  cards on the screen after choosing three days.
- `strength-focus-copy.ts:87, :136` — **the plan's own description says "Four lifting days" to every
  athlete**, three-day athletes included. ⚠️ `strength-focus-copy.shape.test.ts:42` pins that
  sentence, so **the test currently enforces the wrong string** and will have to change with it.

⛔ **Most of this deletes itself under 1f-0** — with no four-day plan there is no "four days" to
name. Fix by removing the variable, not by making the copy conditional.

### 1g. One assistance band for the whole block: 25–50 reps per category
`src/lib/assistance-menu.ts`. **Decided 2026-08-16, and it is a deliberate step below Wendler.**

Today: light weeks 25–50, leader weeks 50–75, anchor weeks 75–100 — the page-pinned reading
(p.23, p.24), scaled up into the anchor per p.18.

New: **25–50 for the whole block**, and ⛔ **REFINED 2026-08-16 — the number inside that range is set
by COMPETING STRESS, not by the cycle phase.**

| hard endurance days in the week | band |
|---|---|
| two | **25–30** |
| one | **30–40** |
| none | **40–50** |
| the merged deadlift + press day | **25 flat**, regardless |

⛔ **TWO AXES, AND THEY COMPOSE — DO NOT REPLACE ONE WITH THE OTHER.** Competing stress picks the
BAND; the athlete's tested capacity picks WHERE IN IT they sit (the existing `assistanceTotalReps`
scaling, unchanged in shape). Keying the number on hard-day count alone would throw away the one
real measurement on file.

⛔ **AND IT IS A REP TOTAL, NEVER A SET SCHEME.** A draft of this specified "3 sets of 8". That
reverses the load rule at the top of `assistance-menu.ts` (D-406) and Michael's own restatement
2026-08-16: *"it's never 25 reps in a row — accessory work including pull-ups per Wendler should be
broken out at user ease of reps."* Confirmed against the source: Wendler prescribes a **total per
category per session**, one or two movements, split however the athlete likes; chin-ups explicitly
tolerate low reps per set, and his own 100-rep dip example is split in two. **The card gets a
number, never sets × reps.**

⚠️ `ASSISTANCE_SEVENTH_*` and the phase-keyed `bandFor` still go — the axis changed, not just the
values.

⛔ **WHOSE NUMBER THIS IS.** Wendler's 50–100 base (p.24) is written for a lifter whose whole
recovery budget goes to the barbell. Michael's call: for an athlete carrying endurance load, 100
reps per category on a hard day spends recovery the running needs, and 50 is the ceiling. **Cite it
as ours. Do not attribute 25–50 as a general Wendler figure** — on the page it is the seventh
week's number.

⚠️ **CONSEQUENCE, AND IT REVERSES PART OF D-432 SHIPPED YESTERDAY.** One flat band removes the
leader-vs-anchor assistance direction entirely — the p.18 scaling that was fixed on 2026-08-15
after running backwards. The direction is not restored in the other direction; it is *gone*, which
is a defensible answer for a capped band but must be back-annotated on D-432 rather than left to
look like the fix regressed.

⚠️ **The capacity scaling survives** — `assistanceTotalReps` still walks floor → ceiling on tested
capacity, just inside a narrower band. It reaches 50 at a lower tested capacity than it used to
reach 75.

⚠️ **The jump doses are a separate control and are NOT changed here** — leaders and light weeks 10,
anchor 15 (p.18, p.22). If the same reasoning should cut those too, say so; it is not assumed.

### 1i. Up to TWO hard endurance days, and they may be any mix of run and ride
**Decided by Michael 2026-08-16, looking at the "Your week" screen.** Today the builder offers ONE
hard session and forces a choice between run and ride. That is a maintenance dose by its own copy —
*"holds top-end aerobic fitness. It does not build it."* An athlete who wants speed cannot ask for
it.

**New:** the athlete may pick **up to two** hard days, in any combination:
- two hard runs (the runner chasing speed)
- two hard rides (the climber)
- one of each (the multisport athlete)
- one, or none — unchanged

**Copy changes with the count** (Michael's wording):
- one → *"One hard session a week holds top-end aerobic fitness. It does not build it."*
- two → *"Two hard sessions build top-end speed and VO2 max. The lifting stacks onto these days."*

⚠️ **The second half of that sentence is only true after §6 ships.** Until then the placer still
pushes lifting away from hard days. Either the two-day copy waits for §6, or it states only what is
true today. **Do not print a promise the placer is not keeping.**

### ⛔ TRACED 2026-08-16 — THIS IS A PIPELINE CHANGE, NOT A UI VALVE
The earlier reading — *"the engine already handles two hard days, the UI just isn't letting them
ask"* — **was wrong.** The path is single-day from the wire down. `NonRaceBuilder.tsx:572`'s
per-sport map is the ONLY place two survive.

| site | what assumes one |
|---|---|
| `generate-strength-plan/index.ts:46, :225-240` | destructures one `hard_day`; validates it into a single `{ day, discipline, terrain? }`. **No array exists on the path.** |
| `strength-primary-plan.ts:232-238` | `hardDay?:` a single optional object |
| `:1731`, `:1735-1741` | one `hardPin`, pushed once, kind derived from the one discipline |
| `:1887`, `:1906` | `hardDayIsRun` / `hardDayIsRide` — mutually exclusive booleans |
| `:1893`, `:1908` | the run count and the ride count each subtract 1; **both would have to fire at once** |
| `:2485-2486`, `:3065` | two volume budgets, each keyed on the single discipline |
| `:2931`, `:3104` | the two emitters. `:3102` states it: *"D-327 makes run and bike mutually exclusive at intake, so at most one of these two branches ever fires."* |
| `NonRaceBuilder.tsx:1472`, `:2855` | the collapse and the sport-switch delete — **the smallest part of the job** |

⛔ **AND THE BIGGER FINDING: STRONG FOCUS DOES NOT USE THE WEEK OPTIMIZER.** It places with
`_shared/week-solver.ts` (`solve as solveWeek`, imported at `strength-primary-plan.ts:113`) plus
`place-week.ts` (`:101`), taking only `easyRunAnchorAdjacencyPenalty` from `week-optimizer.ts`
(`:104`). `_shared/week-optimizer.ts` — which IS two-day capable, carries `quality_run` and
`quality_bike` as separate preferred days, and hard-blocks a quality run the day after a quality
ride (`:577-580`, `:585-588`) — **serves `generate-combined-plan`, not this block.**

⚠️ **THE TWO ENGINES DISAGREE ABOUT EXACTLY THIS PAIR.**
`schedule-session-constraints.ts:152-159` gives `quality_bike × quality_run` **0 hours** of required
clearance and `ADJACENCY_PENALTIES:184-196` does not list the pair, so `week-solver.ts:462-471`
scores back-to-back hard days at a flat +1 — an arrangement `week-optimizer` refuses outright. And
anchors are never moved once placed. **So allowing a second hard day requires deciding which
engine's rule is right, not just widening a type.**

⛔ **SETTLED 2026-08-16: ONE ENGINE, AND IT IS `week-solver`.** See the framing section at the top —
`SPEC-week-solver.md` already owns this direction and Strong Focus is the migrated path, not the
outlier. The disagreement above is therefore not "two theories" but the collapse being half done:
the rules that only exist in `week-optimizer` (the consolidated-mode gate, the quality-run-after-
quality-ride block) have to move to `week-solver` as part of §6, and the `week-optimizer` copies
deleted. **Do not implement the same rule in both.**

### ⛔ ONE SLOT IS DOING TWO JOBS — the hard day vs the club session
**Raised by Michael 2026-08-16.** Today the hard day and the club session are **the same input, on
purpose** — `strength-primary-plan.ts:1633`: *"the hard day IS the club day; there is no separate
input."* The screen's own copy says *"A run or ride club goes here."*

**That is correct for PLACEMENT and wrong for PRESCRIPTION**, and the difference only bites once §7
exists:
- **A club run or ride** — the athlete turns up and does whatever the group does. The app cannot
  prescribe 4 × 3 min uphill into it, and cannot progress it. It still costs the same recovery, so
  it must still be treated as a hard day by the placer.
- **The app's own session** — the app owns the content, and §7's progression can only run here.

**The flow asks one question and needs two:**
1. Which day.
2. **Whose session is it — mine to prescribe, or one you already attend?**

**Consequences, both directions:**
- Both answers count as a hard day for placement, the 6–8h gap, and the stacking law (§6).
- Only "mine to prescribe" gets a session template, a pace/wattage target, and a §7 progression.
- A club day gets placement and honest copy — the app names it as the athlete's own session and
  does not claim to be training it. ⚠️ Same rule as swim: booked, not coached.
- ⚠️ **§1i's two hard days can be one of each** — a prescribed VO2 session and a club ride. That is
  probably the most common real week and the model has to hold it.

⚠️ **NAMING.** "Hard day" stays the scheduling word — it is what the placer and the fatigue rules
key on. The prescribed variant is the one that can be described as *going faster*; a club session
cannot promise that.

### Why it matters beyond the athlete's request
Two hard days makes §6 land cleanly: squat stacks onto hard day one, deadlift+press onto hard day
two, and the unpartnered-heavy-day fallback stops being the common case. **The UI valve and the
routing law are the same feature seen from two ends.**

⚠️ **The terrain copy already on that screen is correct and should not be touched** — the uphill
option, and its note that running uphill may cost the legs less and leave more of the week for
lifting. Same for the ride session's note that the ground does not change the session the way it
does on foot. Both already say the right thing.

---

## 2. Out of scope (do not drift)
- Boring But Big (p.45, *"not a good option for athletes"*).
- ⚠️ **Endurance placement is NO LONGER out of scope — see §6.** What stays out: the 6h gap's
  VALUE (unchanged, and now confirmed as the right minimum), the swim rows, and the triathlon
  generators.
- The triathlon strength path (`STRENGTH-PROTOCOL.md`, Friel) — no Wendler there.
- The beginner plan.
- Changing Brzycki → Epley in `compute-facts` (D-432 records the split; it stands).
- 16-week blocks, until §1a's open question is answered.

---

## 3. Ripple map (walk before shipping)
- `generate-strength-plan/index.ts` — the continuity reader goes; the verdict allowlist
  (`index.ts:188`) must still accept every member of the union.
- `rematerialize-strength-block` — must handle mid-cycle rewrites, not just boundary ones.
- `create-goal-and-materialize-plan` — `verdictsForBlock` call site; block-to-block TM handoff via
  `nextBlockTrainingMax` / `prior_training_max`.
- Logger — the miss signal now needs the **prescribed** reps for the top set alongside the logged
  ones; check that pairing survives `match-exercises.ts`.
- Copy — plan description states the block starts from a derived number (no opening test); the
  light weeks say what they are; a downward adjustment says why in the calibration sheet.
  COPY-VOICE applies: fact first, conditional consequence, no imperatives.
- Tests — everything pinning 12-week = the 2026-08-15 map, the opening test week, the per-cycle
  stall cadence, and the continuity tiers. Expect most of the work to be test surgery.
- Docs — fold into a D-NNN on ship and delete this file. Back-annotate D-432 (block map, verdict
  cadence) and D-422 (the stall counter's measured point).

---

## 4. Verification
Deno fixtures, not prod. Pin: the full 12-week map for one athlete, all four lifts; the 4/8/12/16
arithmetic; no opening test at any length; leader-week misses producing a verdict at all (the
regression for the 2026-08-16 freeze); two consecutive weekly misses dropping 10% and one not; a
skipped week neither counting nor clearing; the drop landing inside the current cycle; upward steps
still only at boundaries. Keep the pre-Forever frozen-block fixture as a regression.

One Michael acceptance pass on device at the end: build a Strong Focus block, eyeball weeks 1, 4, 8,
9 and 12, then log a deliberate miss twice and confirm the weight comes down with an undo available.

---

## 5. Still open
- **The assistance bands** — DECIDED 2026-08-16, see §1g. One band, 25–50, whole block.
- **16 weeks** — DECIDED 2026-08-16, not offered. See §0.
- **Jump doses** — DECIDED 2026-08-16: **unchanged.** Leaders and light weeks 10, anchor 15 (p.18,
  p.22). §1g's cut does not reach them and must not be "made consistent" with it later. Michael's
  reasoning: jumps are a nervous-system primer, not structural volume — they restore rate of force
  development in an athlete who lives in slow-twitch work, at near-zero metabolic and eccentric
  cost. Cutting below 10 deletes the benefit rather than reducing it.
  ⚠️ **One caveat for the §6 build, not for §1:** the engine already treats box jumps as leg-loaded
  work, and that classification was a deliberate 2026-07-27 fix — 15 landings is what made an
  anchor day a heavy lower day for descent and stacking purposes. Under §6, an anchor day stacked
  with a hard track session carries those 15 landings alongside it. That is a placement question,
  not a dosing one; the dose stands.
- **The endurance dial (how MUCH, not WHERE — §6 answers where).**
  `BlockShapeInputs.highAerobicLoad` is declared, read at
  `wendler-531.ts:390`, and **nothing writes it.** It is the seam the Viada tuning hangs off, and the
  first decision there is what number states how much endurance sits underneath the block — hours,
  sessions, distance, or a load figure. Everything else depends on that choice; picking it late
  means picking it four times.
- **What endurance may share a heavy lifting day** — DECIDED 2026-08-16, moved to §6.

---

## 5b. ⛔ THE DELETION LIST — what must NOT survive this build

**Michael, 2026-08-16:** *"we deal with contradicting code, sloppy clean-up and a code state that
can lead down the wrong road with multiple things representing what we may be looking for."*

**This section is the answer to that, and it is not optional.** Every change in §1 REPLACES
something. A replacement that leaves the old thing standing is how this codebase got two of
everything. The rule from `CLAUDE.md` applies literally: **replace = delete the old, same change.**

### The real risk in this build is NOT the engine — it is the five surfaces that describe the old rule
`verdictFrom95Set` is not private to the strength engine. Traced 2026-08-16, it and
`VALIDITY_CHECK_PCT` are read by:

| file | what it does with the old rule |
|---|---|
| `_shared/block-identity.ts:410` | `isMeasurementWeek` = *"has an `amrap` set at ≥95%"* — the definition of a measured week |
| `_shared/response-model/weekly.ts:174` | maps the verdict to athlete-facing state |
| `src/lib/strength-focus-copy.ts:308,400` | **copy that tells the athlete the 95% set is the one that decides** |
| `coach/index.ts` | reads it |
| `rematerialize-strength-block/index.ts` | reads it |

⛔ **§1c makes every one of those statements FALSE.** The measured event becomes the top working set
of every main-lift day, and leader weeks carry no `amrap` set at all — so `isMeasurementWeek`
returns false on six of twelve weeks that are now measured, and the copy tells the athlete a rule
the engine no longer runs. **A screen that explains the old rule while the engine runs the new one
is the exact failure this section exists to prevent.** All five are part of the same change, not
follow-ups.

### Must be DELETED, not left beside the new thing
| symbol / file | why |
|---|---|
| `ContinuityTier`, `continuityTier()`, `ContinuitySignal`, the tier switch in `leaderCount` | §1a — the branch is gone, not fixed |
| the continuity supplier, `generate-strength-plan/index.ts:127-148` | its only consumer is deleted |
| `publishedFallback`, `MAX_CYCLES`, `blockLayoutFor`'s fit-search, `openingTest` and every branch touching it | §0/§1b — 8 and 12 are an allowlist, not a search result |
| `VALIDITY_CHECK_WEEK_IN_CYCLE`, `verdictForCycle`'s week-3 selection | §1c — every main-lift day is measured now |
| `ASSISTANCE_SEVENTH_FLOOR/CEILING`, `ASSISTANCE_ANCHOR_CEILING_WENDLER`, `bandFor`'s three-way branch | §1g — one band |
| the **"Lifting days" step**, `state.liftingDays`, `StrengthPlanArgs.liftingDays`, the `lifting_days` plumbing, and every `=== 3 ? … : …` branch on it | §1f-0 — three days is the only shape. **The four-day path becomes unreachable; unreachable is not "kept for later"** |

### Changes MEANING but survives — annotate, do not delete
| symbol | the new question it answers |
|---|---|
| `amrapRepsForLift` | **still the e1RM and records reader; no longer the verdict source.** Two questions over one function — put the note beside it or the next session collapses them again |
| `verdictFrom95Set` | either deleted outright or narrowed to the anchor's top set. **Decide explicitly.** It cannot keep its current name and a new meaning |
| `AssistancePhase` | **survives for JUMPS ONLY** (§1g removes its assistance role, `jumpsFor` still needs it). Say so, or it gets deleted as dead |
| `STALL_CONFIRM_SESSIONS` | value unchanged at 2, **cadence changes from per-cycle to per-week** (§1c). The constant's own comment states the old cadence and must be rewritten |
| `isMeasurementWeek` (`block-identity.ts`) | needs a new definition, not a new caller |

### The docs closing loop (this is where the rot came from)
- **Back-annotate `D-432`** — the block map, the assistance direction (§1g removes the scaling it
  restored one day earlier), the verdict cadence. Blockquote at the TOP of the old entry.
- **Back-annotate `D-422`** — the stall counter's measured point.
- **Back-annotate the §8.4 long-ride finding** and the 2026-05-12 §6.1 pairing change — both
  reversed by §6.
- **`docs/ENGINE-STATE.md`'s banner is ALREADY STALE** on the assistance clamp (found 2026-08-16: it
  describes a 75 ceiling the code removed the same day). Fix it in this change; §1g moots it anyway.
- **`docs/SPEC-get-stronger.md`** and **this file** both die on ship, folded into one `D-NNN`. A spec
  that outlives its build is the doc-rot engine.
- **`docs/CAPABILITY-MAP.md`** — one terse line for the strength block's new shape.

### The standing rule for this build
**Nothing in §1 ships behind a flag, in parallel with the old path, or as a second function beside
the one it replaces.** If a change cannot delete what it replaces, that is the signal to stop and
say so — not to add.

---

## 7. The hard endurance sessions — what exists, and the progression that does not

**Traced 2026-08-16.** ⛔ **BUILD THREE. Not part of §1, not part of §6.** It is plan CONTENT inside
the strength composer, and it can follow either of them.

### ✅ Already built, and well-sourced — do not rebuild
- **The run's hard session.** Four terrain variants dispatched by the athlete's pick
  (`hardRunSession`, `strength-primary-plan.ts:1474`, D-391): 3-min hills (default), short hills,
  treadmill at 5–8%, flat. Default is **4 × 3 min**, chosen to match Helgerud's dose, with the
  uphill choice argued from measured loading-rate and GRF data. Spec:
  `docs/DOCTRINE-aerobic-maintenance-run-only.md`.
- **The ride's hard session.** `bikeQualitySession:1141` — **4 × 4 min, 3–4 min recovery, 45 min
  total.** Helgerud's protocol verbatim.
- ⛔ **THE DELOAD SYNC IS ALREADY BUILT FOR THE RUN, and it is exactly the rule Michael described.**
  `:2940-2946` — on **both** standalone week shapes the hard run is replaced with an easy run and
  the copy says why (*"Test week — the hard session comes off so the lifting is measured rested"* /
  *"Light week — the hard session comes off"*). Frequency holds, intensity goes (Hickson; Wilson
  2012). **Nothing to design here; it exists.**
- **The working-time caps are already met by construction.** 4 × 3 = 12 min and 4 × 4 = 16 min, both
  inside the 12–18 min VO2 ceiling.

### ✅ FIXED 2026-08-16 (uncommitted at time of writing) — the BIKE hard day never deloaded
`:3103-3106` pushes `bikeQualitySession(hardPin)` with **no `isStandalone` check**, while the easy
rides on the same branch DO take one. So on a deload or TM-test week a **bike athlete keeps their
4 × 4 VO2 session** while a run athlete gets an easy run.

The light week's entire job is to arrive at the next cycle — or at the measured set — recovered, and
for a bike-primary athlete it did not.

**Fixed:** the branch now mirrors the run's. On a standalone week the pinned day carries an easy ride
at trimmed volume with copy naming which week it is; on a cycle week the intervals are unchanged.
**Downgraded, not deleted** — removing it hands back a blank day the athlete pinned.
Fixture `bike-hard-day-deload.test.ts`, 6 tests, derived from `buildWeekMap` rather than hardcoded
week numbers, with a guard so they cannot pass vacuously. Reverting the change fails 3 of 6.
⚠️ The ride budget at `:3065` still subtracts the full 45 min before splitting easy hours, so a
light week builds 30 min there against a 6 h ask — the same deliberate 2/3 trim every other easy
ride takes on a light week, not a new shortfall.

### ❌ Not built at all
1. **Any week-to-week progression.** `hardRunSession(day, lowerDays, terrain)` and
   `bikeQualitySession(day)` **take no week argument.** The same session is authored in week 1 and
   week 11. The athlete gets a maintenance dose repeated twelve times, which is what the screen's
   own copy admits — *"holds top-end aerobic fitness. It does not build it."*
2. **Any threshold / sustained session.** Both existing sessions are VO2. There is no
   comfortably-hard sustained work anywhere in the block.
3. **A second hard day** — §1i.

### The progression to build (Michael's spec, 2026-08-16)
Weekly endurance volume is locked, so intensity and density are the only levers.

**Mirror the barbell's 3-week wave. Same rhythm, same deloads.**

- **VO2 day** — rep count static, working time held ~12–18 min. Progress by **pace/wattage** (same
  reps, faster) or by **density** (same pace, shorter recovery). One lever per wave, not both.
- **Threshold day** — total working time held ~20 min and capped at 30–40. Progress by
  **lengthening the continuous effort**: 4 × 5 min → 3 × 7 min → 2 × 10 min across the three weeks.
  Same time in zone, harder demand.
- **Two hard days → one of each.** VO2 on one, threshold on the other. Never two VO2 days.
- ⛔ **ONE hard day → VO2, unless the goal is distance-oriented** (decided 2026-08-16). VO2 is the
  quality that decays fastest and the one ordinary easy volume cannot hold; threshold is better
  preserved by general aerobic work. ⚠️ **Reasoned from standard practice, not from a page in
  either book** — source it properly before it ships as a claim.
- ⛔ **A CLUB SESSION CANNOT BE PROGRESSED** (§1i). §7 only owns the sessions the app prescribes.
- **Block mapping:** leader 1 establishes the wave · leader 2 advances it (more time in zone or a
  faster pace) · **light weeks delete the intervals entirely** (already true for the run, §7's bug
  for the bike) · the anchor shortens the intervals and demands the highest pace, mirroring the
  AMRAP.

### The input, and the gate — decided 2026-08-16
**The numbers are on the athlete already.** `resolveCurrentFtp` exists and reads
`learned_fitness` + `performance_numbers` (used live in `TrainingBaselines.tsx:1439`). What is
missing is the plumbing: `generate-strength-plan/index.ts` resolves the EASY pace (`:106-115`) and
**nothing else** — no FTP, no threshold pace, reaches the composer.

⛔ **THIS IS THE STARVED-INPUT PATTERN, NOT A MISSING ENGINE.** Same shape as the run-pace resolver
that was written, tested and never once ran. **Feed it; do not build a second resolver.**
⚠️ The run side is less certain: FTP has a named resolver, a THRESHOLD-pace one may not exist.
Trace before assuming symmetry.

**The gate (Michael, 2026-08-16): the athlete must have the number before the option is offered.**

⚠️ **GATE THE HARD-DAY OPTION, NOT THE WHOLE PLAN.** The hard day is marked OPTIONAL on that screen
and the block is complete without it, so blocking plan creation over a missing FTP would refuse a
plan the athlete can legitimately run. The proportionate gate:
- **Hard RIDE day** → requires a resolvable FTP. Absent → the option is unavailable and the screen
  says which number is missing and where to enter it.
- **Hard RUN day** → requires a **5K pace**, not a threshold pace. ⛔ **There is no independent
  threshold pace on the athlete.** `materialize-plan:682-686` DERIVES it as *5K pace + 20 s/mi*
  when `effort_paces.steady` is absent. So the gate must test what actually exists — 5K pace or
  `effort_paces.steady` — and the progression must state which one it used.
- **Neither present** → the block builds with no hard day, exactly as it does today for an athlete
  who declines one.

⚠️ **AND WITHOUT A NUMBER THERE IS NO PROGRESSION TO PRESCRIBE** — a session that cannot state a
pace or a wattage cannot get faster on purpose. That is the actual reason for the gate, and it is
what the screen should say rather than naming a missing field.

⚠️ **AND THE CAP IS THE POINT.** These sessions land on the same day as heavy squats or deadlifts
under §6. The working-time ceilings are what keep that day survivable — 12–18 min VO2, 30–40 min
threshold. **A progression that grows total working time past those defeats the stacking law.**

---

## 6. The scheduling law: consolidate the stress

**Decided by Michael 2026-08-16.** ⛔ **This is a LAW change, not a dial, and it reverses a rule the
app has held since May.**

⛔ **IT DOES NOT SHIP WITH §1. Decided 2026-08-16: separate build, separate work order.** The
endurance matrix is a different subsystem with a far wider blast radius — every plan generator, every
placement test, the prescriptive spec. §1 lands first: the Wendler math, the 3:1 rhythm, the stall
protocol. Test it, ship it, verify it. Then this. **What follows is the captured decision so the
follow-up build is not reconstructed from a chat.**

⚠️ **SOURCE STANDING: SECONDARY.** The high/low model and "consolidation of stressors" are
attributed to Viada from summary sources only; the book has not been read. The *decision* is
Michael's and stands on its own; the *attribution* must stay marked until the text is checked.

### ⛔ MOST OF THIS IS ALREADY BUILT — FOUND 2026-08-16. READ BEFORE SCOPING ANYTHING BELOW.
`docs/CONSOLIDATED-MODE.md` (spec dated 2026-05-18, **"Decisions LOCKED"**) defines
`integration_mode: 'separated' | 'consolidated'`, athlete-level, default `separated`:
- **separated** — `lower_body_strength` keeps **≥24h in both directions** from `quality_run` /
  `quality_bike`; same-day is rejected at placement. **This is why the app spreads hard days apart
  today.**
- **consolidated** — same-day quality-run/ride + heavy legs is the **preferred** placement, and a
  separated arrangement becomes the trade-off.

That is §6's rule A1, spec'd three months ago.

⛔ **AND THE ORDERING IS ALREADY A SECOND, ORTHOGONAL AXIS.**
`strength_ordering_preference: 'endurance_first' | 'strength_first'` decides AM/PM *within* a shared
day (spec §1). **Michael's rule A2 — barbell first — is `strength_first`.** The spec is explicit
that the two axes must not be collapsed into one question.

⛔ **AND THE SMART-DEFAULT-PLUS-OVERRIDE SHAPE IS ALREADY IN THE GATE** (spec §3, LOCKED):
```
allowConsolidation = (isCoEq && (isPerf || strength_ordering_preference === 'strength_first'))
                     || integration_mode === 'consolidated'
```
An engine-derived branch **or** an explicit athlete opt-in. That is exactly the "smart buffet"
posture — the engine proposes, the athlete can override — and it does not need inventing.

**Status per `POLISH-PUNCH-LIST.md:765-769`: BUILT, TESTED, NEVER EXECUTED ONCE.** Rules at
`_shared/week-optimizer.ts:412-417`, same-day QR+lower at `:1215-1291`, fixtures passing
(`week-optimizer.anchor-contract.test.ts:1057-1099`, `consolidated-trade-off.test.ts`), server
threads the field (`_shared/combined-schedule-prefs.ts:303` →
`reconcile-athlete-state-week-optimizer.ts:206`). **No wizard writes `integration_mode`**, so
`create-goal-and-materialize-plan/index.ts:1921` falls through to `'separated'` for everyone. The
punch list's stated job: **one wizard question plus the payload leg.**

⚠️ **VERIFIED TO THE SPEC AND THE PUNCH LIST, NOT TO THE ENGINE.** The optimizer internals were not
read. Confirm before leaning on it.

### So what is actually NEW in §6
1. **The long-ride buffer** (rule B5) — not part of consolidated mode. Genuinely new.
2. **Strong Focus runs on a different placement engine** (§1i) — consolidated mode lives in
   `week-optimizer`, which this block does not use. **Turning the setting on does nothing for Strong
   Focus until that is resolved.** This is the decision that gates the whole section.
3. **Wiring** — the wizard question and the payload leg, which the punch list already scopes.

⚠️ **THE DEFAULT IS A PRODUCT CALL NOW.** `separated` is the spec's default. Everything decided
today argues the concurrent athlete wants `consolidated`. Changing a LOCKED default is a decision,
not a fix — make it explicitly.

### What it says
The nervous system does not distinguish heavy barbell tension from high-intensity aerobic output.
Both are the same withdrawal. So they are stacked into one hard day, which buys a genuinely clear
day afterward — rather than spread across adjacent days, which leaves no day clear at all.

### The rules, as decided
**A. The hard stack — `quality_run` / `quality_bike` × heavy legs**
1. **They SHARE a day, and the placer actively pulls them together.** Speed and VO2 work are
   maximal nervous-system stressors; the matrix treats them as it treats a heavy 5s PRO squat.
2. **Barbell AM, intervals PM.** Heavy axial loading needs a fresh nervous system to brace, so the
   squat or deadlift takes the morning slot.
3. **6 to 8 hours between them.** The existing gap value is the right minimum — cortisol drops,
   central fatigue partly clears, the athlete eats and refills glycogen before session two.

**A5. WHICH hard session pairs with WHICH lift — the biomechanical routing (added 2026-08-16)**
When the week carries **one hard run and one hard ride** alongside the two heavy leg days:
- **`quality_run` → the SQUAT day.**
- **`quality_bike` → the DEADLIFT + press day.**

⛔ **The reason, and it is structural rather than systemic.** Deadlifts deeply fatigue the spinal
erectors. Running needs those same erectors working to hold the torso upright against repeated
impact, so a hard run on deadlift-fatigued erectors is where form breaks down. Cycling is seated and
structurally supported — it asks almost nothing of the erectors, so it is the safe partner for a
fatigued posterior chain.

⚠️ **DEGRADES, DOES NOT BLOCK.** Two hard runs (the runner) or two hard rides (the climber) means the
rule has nothing to choose between. It then places either way and the deadlift day's copy carries the
form note. **Do not refuse a week over this** — it is a preference with a reason, not a clearance.

**B. The long ride — `long_ride` × heavy legs**
4. **Heavy legs are FORBIDDEN on the long ride's own day.** ⛔ **This reverses the 2026-05-12 change
   (§6.1) that permitted the pairing.** A long ride does near-zero eccentric damage and still empties
   glycogen and drains systemically. If strength has to fall on that day it is **upper body only**,
   and the existing ordering stands: **ride AM, strength PM, 8h gap.**
5. **The day after a long ride or long run is protected.** 48 hours forward from either. No squat,
   no deadlift. That day is rest, easy aerobic, or the upper-body session.

⚠️ **THE TWO ORDERING RULES NO LONGER CONTRADICT EACH OTHER, and that is why B4 matters beyond its
own merits.** Barbell-first applies to the hard stack; ride-first applies to the long ride. Because
heavy legs can no longer share a long-ride day at all, no pairing is governed by both.

### The week this produces
Two consolidated hard days (heavy legs + intervals), two genuinely easy days between them, the long
ride on the weekend, and the day after it locked to upper body or rest.

⚠️ **It maps onto the 3-day lifting week exactly** — squat and deadlift+press take the two hard
days, bench takes the post-long-ride day. **That is a convenient fit, not a proof.** It assumes the
athlete has two hard endurance days.

### ⛔ ONE LAW, EVERY ATHLETE — and the two rule TYPES degrade differently
**Decided 2026-08-16.** This does not fork into a heavy-multisport version and a casual version.
The same law serves the high-mileage triathlete, the two-sport athlete, the single-sport runner and
the casual rider who just wants to get stronger. What differs is which parts of it fire.

| rule type | examples | when it applies |
|---|---|---|
| **Protection** — a constraint | the 48h buffer after a long run or ride; heavy legs off the long-ride day; the 6–8h gap | **Unconditional.** Fires whenever the triggering session exists, for every athlete. |
| **Attraction** — a preference | pulling heavy legs onto a hard run/ride day | **Conditional.** Fires only when there is a hard endurance day to pull toward. |

**So the casual athlete is not a special case — they simply never trigger the attraction rule.** No
quality sessions means nothing to stack onto, the heavy days place normally, and the buffers still
protect whatever long session they do have. **Do not build a second placement path for them.**

⚠️ **The strength block itself does not vary by athlete type at all** — 12 or 8 weeks, 3 or 4 days,
the same Wendler math and the same 3:1 rhythm. **What varies is the calendar around it.** That is
the product claim: one solid strength plan, routed differently by what else is in the week.

### The unpartnered heavy day — DECIDED 2026-08-16: it stands alone
**A heavy leg day with no hard endurance partner is its own High day. The engine isolates it; it
does not go looking for a partner.**

⛔ **STACKING IS A COMPRESSION TACTIC, NOT A REQUIREMENT.** The point of the model is to protect the
LOW days. A heavy 5s PRO deadlift is itself a high nervous-system stressor — it makes whatever day
it touches a High day, with or without a run attached. So:
- Stacking it onto an **easy aerobic day** to satisfy the pairing rule would destroy a recovery day
  and buy nothing.
- Stacking it onto the **long run or long ride** would violate the buffers locked above.

The routing:
1. **The barbell is its own anchor.** No partner needed.
2. **Maximise distance** — place it as far as the calendar allows from the other High day (the
   stacked one) and from the long effort. Target 48 to 72 hours of clearance.
3. **Passive sharing only.** If the week is dense enough that it must share a square, it may share
   with an EASY zone 1/2 session — a flush, no added nervous-system cost. **Permitted, never
   attracted.** The distinction is the whole rule: attraction applies to hard endurance only.

⚠️ **This is what makes one law cover every athlete**, and it should be stated in the follow-up
build's tests as the three cases:
- **two hard endurance days** → two stacked High days
- **one** → one stacked High day, one isolated High barbell day
- **none** (single-sport, or the casual rider) → the squat and deadlift days simply space themselves
  out as independent High days, which is an ordinary strength calendar. Nothing special-cased.

⚠️ Attribution: the High/Low framing traces to Charlie Francis via Viada. **Secondary until the book
is read** — the routing decision is Michael's and does not depend on it.

### What already exists (do not rebuild)
- **The high/low vocabulary.** The matrix already sorts endurance into `quality_run`,
  `quality_bike`, `long_run`, `long_ride`, `easy_run`, `easy_bike`
  (`_shared/schedule-session-constraints.ts:337`). Rule 1 is a new ANSWER over an existing
  vocabulary, not a new taxonomy.
- **Rule 4 is half-built already.** `ADJACENCY_HOURS_ROWS` sets `lower_body_strength × long_run = 48`
  (`schedule-session-constraints.ts:131`), which already forbids heavy legs the day after a long run.
  ⛔ **`long_ride` is all zeros on that row and that is now REVERSED (decided 2026-08-16).** The
  existing zero was reasoned from eccentric damage alone — a long ride is long in duration and near
  zero in damage. Michael's call: **glycogen depletion is the cost that matters here, and it does not
  care about eccentric load.** The long ride gets the same 48h protection as the long run, and the
  day after either is locked to rest, easy aerobic, or upper body. This supersedes the §8.4 finding
  ("a long ride does not cost the week a leg day") for the day AFTER; the same-day pairing is
  unchanged.
- **The 6h gap machinery.** `attachSameDayPairingMetadata` already assigns AM/PM and a gap to a
  stacked pair. Rule 2 changes which side the barbell goes on, not whether the mechanism exists.
- **The tradeoff sentence.** Stacked days already print a note explaining the cost. Wording changes;
  the surface does not.

### What actually changes
- **Permission.** `lower_body_strength × quality_run` and `× quality_bike` are hard `0` today. Both
  cells, symmetric (the builder asserts symmetry).
- **Attraction, which is the real work.** Flipping the matrix to "allowed" does not stack anything —
  it only stops forbidding. The optimizer has to PREFER the stack, which is a scoring change in
  `_shared/week-optimizer.ts` (`deriveOptimalWeek` / `canPlaceWithModifier`), the sole placement
  authority. Permission and attraction are two separate pieces of code.
- **Adjacency.** `lower_body_strength × quality_run/bike = 24h` on different days exists to keep them
  apart. It stays correct for the weeks where the stack cannot be made.
- **`lower_body_strength × long_ride` goes 1 → 0**, reversing the 2026-05-12 §6.1 change that opened
  it. Upper body keeps the day, with ride AM / strength PM / 8h unchanged. The ordering contradiction
  this used to create with rule A2 dissolves, because the pairing stops existing.
- **`lower_body_strength × long_ride` adjacency goes 0 → 48** in `ADJACENCY_HOURS_ROWS`, matching the
  long run.
- **The trim valve** is §1f's day-level volume dial, applied to a heavy weekend rather than to a
  merged lift day. **Same control, built once.**

### ⛔ THE OVERCOMMITTED ATHLETE — how the engine loses (locked 2026-08-16)
Two clubs plus a long run plus a long ride is four fixed endurance days. With two heavy leg days
needing 48h from both long efforts and from each other, a good pin set solves beautifully (the clubs
BECOME the hard days) and a bad one leaves a week that is **legal and has no recovery in it** —
lift, hard, lift, hard on consecutive days. **That is the dangerous failure, because nothing
complains.**

**Three tiers, in this order:**

1. **PREVENT AT PIN TIME — the front door.** The wizard says it when the days are picked, not after
   Build is pressed: four fixed endurance days leaves no room for the recovery the lifting needs;
   unpin one or change focus. ⛔ **Uses the day-count gate, which is BUILT AND UNWIRED** — 260 lines,
   30+ tests, its own spec (`DAY-COUNT-GATES.md`), **zero importers**
   (`POLISH-PUNCH-LIST.md:771`, `GAME-PLAN.md:423`). Its stated job: mount it and write the copy.
   ⚠️ **Its matrix keys on `integration_mode`, so it ships AFTER consolidated mode** — i.e. inside
   build two, not before.
   ⚠️ **UNVERIFIED: whether the gate already computes THIS check** (hard-club days + long days vs
   lifting days) or needs its matrix extended. Extending it is still far cheaper than solver work —
   **but confirm before scoping it as "mount it."**
2. **PROTECT OVER STACK — the engine fallback, and it is already native.** The 48h clearance is a
   hard law; stacking is a scored attraction. When they collide the law wins: the stack breaks, the
   long effort keeps its window, and the heavy day goes to whatever legal square remains as an
   **unpartnered High day** (the rule already settled above). **No new logic.**
3. **SAY IT — the receipt.** When a stack is broken to satisfy a recovery constraint, the final plan
   screen states it. No silent compromise, and no apology for the engine doing its job.

⛔ **AND A FOURTH TIER WAS PROPOSED AND KILLED: degrading the buffer.** "Drop the day-before
protection, keep the day-after" is the directional rule the symmetric table cannot express
(`buildAdjacencyHours` **throws** on asymmetry — *"Hours are symmetric by design; express order in
ADJACENCY_PENALTIES"*). Doing it would need a constraint-relaxation ladder in the solver that does
not exist, which violates this build's standing rule. **Formally dead. Do not reintroduce it as a
table edit.**

### ⛔ WHAT IS CLINICAL AND WHAT IS A COACHING MODEL — settled 2026-08-16, and the code comments must say which

| the rule | evidence level | what actually backs it |
|---|---|---|
| **Cap hard endurance at 1–2 sessions a week** | **clinical** | Wilson 2012 — endurance session FREQUENCY drives strength interference. ⛔ **It measured sessions per week, not how they cluster on a calendar. It justifies the CAP and says nothing about PLACEMENT.** An earlier draft used it to justify stacking; that inference does not follow and must not ship. |
| **Cluster the stress onto fewer days (the stacking law itself)** | **coaching model** | Charlie Francis's high/low framework, and Viada's consolidation of stressors. Battle-tested periodization practice, **not a trial result.** Attribute it as a model. |
| **Barbell AM, intervals PM** | **clinical** | Prior endurance work acutely blunts peak force and rate of force development in the resistance session that follows — glycogen depletion plus neuromuscular fatigue. **This is the strongest-supported rule in §6.** |
| **Run pairs with squat, ride pairs with deadlift** (A5) | **mechanism, reasoned** | Erector fatigue vs. the erector demand of upright running against impact. Coherent and specific; not a trial. |
| **48h buffer after a long effort** | **mixed** | The long RUN's 48h is eccentric-damage evidence (EIMD peaks 24–48h) and already in the table. The long RIDE's extension is **glycogen, not damage** — a different axis, ours, and it must say so. |

⚠️ **Michael, 2026-08-16, and it is the standard for every line above:** *"the engine needs to know
why, not just do."* A rule whose comment cites the wrong evidence level is worse than one with no
citation — the next session verifies it against the paper, does not find it, and deletes the rule.

### The counterweight, stated so it reads as a choice and not an oversight
The current rule is also sourced. Its basis is same-session interference — the code cites Wilson
2012 putting running-adjacent strength interference at roughly three times cycling-adjacent
(ES ≈ 0.94 vs ≈ 0.32). **That research answers "what do I get out of this session"; the
consolidation model answers "what does my week look like."** Both can be true: stacking costs quality
in the stacked session and buys a genuinely recovered day. Michael's call is that the week matters
more for this athlete. Record it as a trade taken, not an error corrected.

### Ripple
- `docs/SCHEDULING-RULES.md` is the PRESCRIPTIVE spec and is authoritative for placement. It must be
  updated in the same change or it becomes a lying document.
- `.cursor/rules/lower-body-strength-pairing.mdc` already disagrees with the matrix on easy runs and
  is unreconciled. It will disagree harder after this.
- Generators that do not route through the optimizer (`generate-run-plan`, `generate-triathlon-plan`,
  `generate-plan`) will not inherit this. Known and pre-existing.
- Pin tests over the matrix and the adjacency table.
