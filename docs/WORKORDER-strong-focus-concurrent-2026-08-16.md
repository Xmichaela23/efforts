# WORKORDER — Strong Focus: the concurrent-athlete governors · 2026-08-16

**Decided by Michael 2026-08-16, this chat.** Follows the Forever alignment shipped 2026-08-15
(D-432). The four lifts, the three-week cycle, 5s PRO leaders, 5/3/1 anchors, FSL, the assistance
model and all endurance placement are UNTOUCHED. What changes is the block's rhythm, who the
block shape is chosen for, and how fast the engine reacts to a missed rep.

**One sentence:** Wendler's mechanical progression, run inside a 3:1 recovery rhythm, with the
training max allowed to fall fast and rise slow.

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

### 1e. Onboarding asks for a 5-rep set, not a max
⛔ **TRACE FIRST.** The entry gate today takes a 1RM (`performance_numbers`, `oneRepMaxes`).
Whether it already accepts a rep-set input, and where `estimate1RM` is applied on that path, has
**not been traced** — do that before building anything.

Target: *"a weight you can move for 5 clean, fast reps right now"* → Epley (`w × r × 0.0333 + w`,
already the app's estimator, D-432) → 85% → starting TM. Asking an endurance athlete for a 1RM
invites a college number or an ego lift.

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
it. With three days the same 100-a-week splits ~33 per day instead of 25. **That is a real dose
change, not a rename** — decide whether the weekly total holds and the per-day rises, or the total
comes down.

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

New: **25–50 everywhere.** `ASSISTANCE_TOTAL_REPS_FLOOR` → 25, `ASSISTANCE_TOTAL_REPS_CEILING` → 50,
and `bandFor` collapses to one band for all three phases.

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

### What is actually true about the code here — traced 2026-08-16
- ✅ **The state shape already holds two.** `qualityDays` is
  `Partial<Record<'run' | 'bike', DayName>>` (`NonRaceBuilder.tsx:572`) — a per-sport map, not a
  single value.
- ⛔ **The single-hard-day limit is DELIBERATE UI, not a data limit.** `:1216` says *"Kept single:
  switching sport drops the other,"* and `:2855` actively deletes the other sport's entry when the
  toggle is switched. That deletion is the valve to open.
- ⚠️ **At least one consumer collapses to a single day.** `standingDay` at `:1472` is
  `(qualityDays.run || qualityDays.bike)` — first one wins, the second is dropped on the floor.
- ⛔ **THE GENERATOR SIDE IS NOT TRACED.** Whether `generate-strength-plan`, the week optimizer and
  the plan builder handle two quality days is **unknown**. *"The engine already handles two hard
  days"* is a **hypothesis, not a finding** — trace it before scoping the work. If it turns out the
  downstream is single-day too, this is a bigger job than a UI valve.

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

### ⛔ A REAL BUG, FOUND IN THIS TRACE — the BIKE hard day never deloads
`:3103-3106` pushes `bikeQualitySession(hardPin)` with **no `isStandalone` check**, while the easy
rides on the same branch DO take one. So on a deload or TM-test week a **bike athlete keeps their
4 × 4 VO2 session** while a run athlete gets an easy run.

The light week's entire job is to arrive at the next cycle — or at the measured set — recovered, and
for a bike-primary athlete it currently does not. **Small fix, live defect, and it can ship on its
own.**

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
