# Stage 4, slice 1 — the composer: the strength-leading runner frame

**2026-08-23.** Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 4.
Design: `DECISIONS-2026-08-22-standing-plan-pivot.md` §1, §3, §4, §6, §8, §9, plus four rulings
Michael gave on 2026-08-23 after p247 was read.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** One new untracked directory, plus the corpus. |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** Nothing composed here has reached a phone. |

**What IS proven:** 30 tests green (107 across all four stage libraries), 44 of 44 mutations killed by
their intended test, Get Stronger byte-identical, and the module builds and runs from a client entry
point through this repo's own Vite.

---

## ⛔ p247 WAS READ FIRST, AND IT CHANGED FOUR THINGS

The page had never been read. It carries four things nothing else in the corpus records. All four
were raised before any code was written; Michael ruled **the page wins over the pivot doc** on every
one, and the pivot doc is being amended to match.

### 1. The ME rotation cadence is NOT a gap — he wrote it

Pivot §8 listed *"rotation cadence for the ME lift pair"* as something to fill from field practice.
p247: *"the ME lift will rotate week to week, with one week consisting of ME squat and DE deadlift,
and the next week the reverse."* That is what the table's *"(rotate with primary push)"* means.
**Weekly, stated, and nothing in the implementation is ours.**

### 2. "Accessory:" is a ROLE PREFIX, not a category

*"The 'accessory' notation refers to movements that specifically focus on noncompetition lifts with
similar gross movement patterns — for example, paused deadlifts, box squats, Larsen presses."*

His three examples straddle two of his own categories (paused deadlift and box squat are PRIMARY,
p219; Larsen press is SECONDARY, p220), which proves the prefix is a role. **A composer reading
`Accessory: primary pull` as "the primary-pull category" puts the competition lift into the slot that
exists to avoid it.** Implemented as a filter on top of stage 2 — exclude the athlete's named
competition movement, then take the grid's answer. Stage 2 is unchanged.

### 3. The rate anchor is per-FRAME

Pivot §4 read it as *"~1%/3wk general, ~1%/4wk when running is real."* **It is not a running switch.**
p247 gives **1%/3wk for Strength + 5K**, which carries four endurance sessions including two hard
ones; the 1%/4wk figure is p251's, for Strength + Half-Marathon. More running → slower rate,
**per frame**. `RATE_ANCHOR` is keyed by frame and cited to the page.

### 4. A 3–4% lower-body haircut, with a stated phase-out, that the pivot doc does not mention

*"a 3 to 4 percent reduction in working 1RM should be assumed here… gradually phased out in eight to
ten weeks (that is, increasing lower body estimated 1RM by about 2 percent every three weeks for the
first nine weeks)."*

Caused by Monday's run landing before Tuesday's ME lower. ⛔ **It composes with the working number and
never multiplies into it** — the working number is how a number is derived from a test; this is a
temporary, lower-body-only, frame-specific allowance that phases out. Folding it into the 96% would
make it permanent and the phase-out unexpressible. Upper body never sees it. Both halves are pinned
by test.

### And one tension, raised rather than reconciled — then ruled

p247: *"More advanced runners may see a benefit to additional running volume, and I recommend adding
one or two VT1 sessions initially to test recovery."* Against pivot §2's **"convert, never add."**

**Ruled (Michael, 2026-08-23): it is a PROGRAM TIER, not an athlete dial. §2 stands.** The frame has
a base count; an advanced-runner variant carries +1–2 VT1 sessions, **easy only**, and the engine
gates the tier on **demonstrated running history** — the athlete never self-selects into volume they
do not already hold. Within either tier the count is fixed and intensity still converts.

⚠️ **The gate threshold is OURS and labelled:** 25 miles a week, the top third of this plan's stated
10–30-mile audience. He says "more advanced runners" and defines nothing.

---

## What shipped

`supabase/functions/_shared/standing-plan/` — five source files plus the gate. **Nothing outside the
new directory was changed except the corpus.**

| file | what |
|---|---|
| `working-number.ts` | p215's pretest and the 96% working max. A NEW field. |
| `frames.ts` | p246 as data — standard and taper columns, the rotation, the tier, the plyo dose |
| `session-vocabulary.ts` | **the ONE edge** — stage 1 family names → the app's existing tokens |
| `progression.ts` | his rate anchor, his haircut, our double progression and stall handling |
| `compose.ts` | the composer |

### The corpus grew two parts

- **Part E1** — pp.246–247 transcribed, including the role-prefix finding and the ambiguous notation.
- **Part H** — the p215 protocol and the working max, with the same-word collision written down.
- **Gap G-7** amended: p215 is read and verified; **its image is pending in `book-sources/`**, and the
  one site that derives the working number says so. G-7 closes when `p215.jpg` lands.
- **Gap G-8** stands: *"the circle of reps"* is used on p247 and defined nowhere.

---

## ⛔ THE WORKING NUMBER — a different number from Wendler's, and it cannot become one

**96% of a predicted 1RM, from both Epley and Brzycki averaged** (p215). Wendler's training max is
85% of a *true* 1RM and has three live readers on `plans.config.training_max`. Same English word, two
different numbers, two different programs.

⛔ **No function in the module accepts both**, and a lint asserts the working-number module never
names a training max, never names Wendler, and carries no conversion either way.

⚠️ **WHY HE AVERAGES, sharpened by the test:** Epley and Brzycki **agree exactly at ten reps** and pull
apart in *opposite* directions either side — below ten Epley reads higher, above ten Brzycki does.
The last pretest step is taken for MAX reps, so which side of the crossover it lands on is not known
in advance: picking one formula picks an error whose **sign** is unpredictable. (This corrects the
test's own first premise, which asserted divergence grows with reps. It does not.)

### The test week

**Ruled (Michael, 2026-08-23): the plan's first week IS the test week.** p215's protocol runs as
guided sessions inside week one's lifting days — upper on day 1, lower on day 2. Stored baseline 1RMs
are the **SEED** and set only the test's warm-up weights; they are never the working number. Fresh
test for everyone at block start; fully prescribed weights land in week two. His own advice, p247 and
p275.

⚠️ **And the test week is still a whole week.** Days 4 and 5 run their own slots **by feel**, because
there is no working number yet. A first version dropped them entirely — the athlete would have found
two empty days with no explanation.

---

## ⛔ THE FRAME IS THE LAW

Four lifting days (two ME, two DE), a plyo-only day 3, four endurance sessions, one rest day. Held by
test across five equipment subsets and four weeks: **the counts never move.** The taper column drops
the long run, keeps three endurance sessions, and turns days 1 and 2's second ME slot into DE — a
substitution as much as a cut. It is also the frame's hold variant and its race handling (p247: switch
two weeks out from a meet or a 5K).

**Every day opens on a competition movement** — p247, asserted.

---

## The gate

**30 tests. `deno test --no-check --allow-read supabase/functions/_shared/standing-plan/`**

Get Stronger untouched · the working number and its guards · the test week · the frame's counts · the
weekly rotation · the accessory role filter · no movement twice in a day · the rate anchor · the
haircut and its phase-out · double progression labelled ours · the vocabulary edge · warm-ups reaching
the watch · the advanced tier · the dosing ledger · the plyo dose · the ambiguous notation carried as
a gap · client-reachability.

### ⛔ GET STRONGER IS BYTE-IDENTICAL — PROVEN, NOT ASSUMED

`git stash` the Standing Plan directory away, compose, hash; restore it, compose, hash. Both runs:
`eb1d6796bcef1bbda67b8db2d70265dd650383f703f63ee26d47dc66ee7808b2`. Re-run at close, unchanged.

⚠️ **A pinned hash inside the test file was written and then removed, deliberately.** It answers "has
Get Stronger changed at all" — not this stage's business, and any legitimate future change to that
plan would break it. What the test holds instead is what IS this stage's business: a **source lint**
(no import of `strength-primary-plan`, `wendler-531`, `assistance-menu`/`assistance-catalog`, or
`training_max`) and a determinism check. The byte-identical claim is recorded here as a thing that was
RUN.

### ⚠️ Mutation testing: 44 mutations, 44 killed by their intended test

**Six did not land first time. Three were real test weaknesses:**

| what survived | why | fix |
|---|---|---|
| a non-tested movement carries a prescribed weight | the test week's own setup passed no working numbers, so nothing leaked | a new test walks every kit and week and asserts **only a tested lift ever carries a number** |
| the ledger stops seeing the strength sets | the check was "some session counts more than three" — the accessory floor then filled the empty sessions and the total looked plausible | the ledger's `totalIfAllCounted` must **equal** the sets the composer emitted, row for row |
| the haircut never phases out | the early return it targeted **guarded nothing** — the clamp already returns 1 by week ten | the dead branch was **deleted** and the mutation retargeted at the phase-out rate |

**Two were bad mutations** (a mis-indented anchor; a mutation masked by the test's own fixture) and
**one was an equivalent mutant**, recorded rather than chased.

Harness at `<scratchpad>/mutate4.py`; not in the repo, restores the tree on every exit path.

### Four defects the first smoke run exposed, before any test existed

1. **`pull up @ 205 lb`** — a pull-up was taking the bench's working number, because the load was keyed
   to a PATTERN rather than to a tested LIFT. D-322's disease with a new face.
2. **`interval_18x155m`** — the MLSS translation counted the surge and the float as separate reps.
   Arithmetically faithful, and a session no runner would recognise. The edge now preserves the work
   total exactly and re-expresses it at a readable interval distance, inside stage 1's own band.
3. **The test week dropped days 4 and 5 entirely.**
4. **The same movement twice in one day** — a hip thrust satisfies both `primary press_lower` and
   `secondary hinge_lower`. Deduped per day, widening the CATEGORY (never the pattern) when a cell is
   exhausted, which is the case for a bodyweight-only athlete.

---

## ⛔ CLIENT-REACHABLE — proven, not assumed

Built and RUN through this repo's own Vite: a client entry importing `@shared/standing-plan`,
**215 kB, executed** — a full 12-week block, test week first, four lifting days and five runs in week
two (the advanced tier firing at 28 demonstrated miles), busiest session 11 work sets, nothing below
the muscle floor, bench at 205 lb in week two. Cross-checked with a plain esbuild bundle.
⚠️ The probe config was temporary and removed; **this is a thing that was RUN, not a thing that is
watched.**

`deno check`: no errors in this module. ⚠️ The pre-existing `state-trend/assemble.ts:1134` error still
reaches it transitively through `planning-context.ts` (the endurance library's swim anchor). On
`main` already.

---

## Gaps decided at the point the composer hit them — pivot §8 discipline

| gap | decided | whose |
|---|---|---|
| rotation cadence | weekly ME/DE swap | ⛔ **HIS** — p247. Not a gap. |
| plyo drill count | 3 per day | HIS — p227 ("more than three or four is a waste") |
| plyo stop rule | quality, not reps | HIS — p227 |
| **plyo efforts per drill** | **4** | ⚠️ **OURS**, labelled — he says "multiple times" and no number |
| **progression mechanism** | **double progression** | ⚠️ **OURS**, labelled — "the circle of reps" is undefined (G-8) |
| **advanced-tier threshold** | **25 weekly miles** | ⚠️ **OURS**, labelled — from the audience definition |
| **stall thresholds** | 2 confirmations, 10% back-off, 4 weeks to call a freeze | ⚠️ **OURS**, labelled |
| **haircut midpoint** | 3.5% of his 3–4% | ⚠️ ours; the phase-out rate and length are exactly his |
| rest between sets | **still not decided** — the composer did not need it in this slice | — |
| when 1 ME set becomes 2–3 | **still not decided** — same | — |

---

## What the next slice should know

- ⚠️ **Nothing calls the composer yet.** It is pure and takes resolved inputs; wiring it through
  `generate-strength-plan`'s gate (pivot §9) is the next slice, and it is the first time any of this
  reaches a plan row.
- ⛔ **`ComposeArgs.competitionLifts` is the athlete's answer to "name the lift you want a number on"**
  (pivot §6, his p275 permission). The wiring slice has to collect it; today it is an input with no UI.
- ⚠️ **The working number has no persistence yet.** `workingNumberFromTest` produces it; nothing
  stores it, and the test week's results have nowhere to land. That is the wiring slice's real work.
- ⚠️ **`1 x HYP: Accessory: accessory lower` stays recorded ambiguous.** Resolved conservatively as a
  lower-body noncompetition movement through stage 2's ladder, and the reading rides on the plan as a
  gap note rather than being presented as his.
- **The other three dial positions are not built.** Strength + Half-Marathon (p250/p251) and the two
  cycling frames are frames-in-waiting; `FRAMES` holds one entry and the type is ready for more.
