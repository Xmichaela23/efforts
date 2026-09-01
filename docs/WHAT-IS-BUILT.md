# WHAT IS BUILT — the app, as the code has it

**Read this FIRST, before proposing to build anything.** Written 2026-08-31 by the build terminal, on
Michael's order, because sessions keep proposing to build things that already exist. His words:
*we can't fix what we don't know we've got.*

**Every claim here is labelled.** `code-traced` = read from source. `composed` = I ran the real
composer and read the output. `git-traced` = from commit history. `doc` = from a document, and named
as such because a document is not evidence. **There is no `live` evidence in this file** — no
production data was read. Where I do not know, it says so.

---

## 0. WHICH DOC IS FOR WHAT — read this before you read any other doc

| doc | what it is for | trust |
|---|---|---|
| **`ENGINE-STATE.md`** | **TODAY.** What is pushed vs deployed vs unverified, what shipped this week, the open defect list, the traps this month, the standing laws. It is a dated banner stack — the top banner is the current one. | ⛔ **the doc to trust.** Read its top banner every session |
| **THIS FILE** | **ALWAYS.** What exists at all, how the chain fits together, who owns which fact. It changes when a subsystem is added or rewired, not when a defect is found. | current as of 2026-08-31 |
| **`INVENTORY.md`** | **GENERATED.** The deploy closure per file, the frames' slots, the picker cells, the edge functions. Never hand-edited — `npm run inventory:write`, pinned by a test | cannot rot |
| **`GLOSSARY.md`** | **the words, the numbers, and the FIVE STATES a plan moves through.** Read it first if the vocabulary is unfamiliar, or before reporting anything as missing — most "holes" are stage 2 read as stage 4 | current |
| `SOURCE-viada-hybrid-athlete.md` | the book, transcribed with page images open. **The only training source.** | high on pp.218–227 and pp.244–284 |
| `TRUTH-MAP.md` | per-fact authority + fractures, code-derived 2026-07-09/10 | ⚠️ **predates the Standing Plan entirely** — see §6 |
| `CAPABILITY-MAP.md` | was the "does X exist" lookup | 🔴 **stale and actively misleading** — see §6 |

**These two files do not compete.** ENGINE-STATE answers *"what is the state of the work right
now"*. This file answers *"does this exist, and how does it fit together"*. If they disagree about a
date or a deploy, ENGINE-STATE wins. If they disagree about whether something exists, **the code
wins and both get corrected.**

---

## 0b. ⛔ BEFORE YOU INVESTIGATE A "HOLE", READ THE GOLDEN BLOCKS

`supabase/functions/_shared/standing-plan/golden/` holds the **complete composed output** — every row
of every week of a twelve-week block — for three archetype athletes, committed to the repo and
checked by `golden-block.test.ts` on every run.

| file | what it is for |
|---|---|
| `untested-minimal.txt` | **an athlete with no tested max.** Every top set says `By feel`. This is what a correct, unpriced block looks like — and *"week 2 has no weight"* is the single most-reported false alarm in this project |
| `home-barbell.txt` | tested numbers, no machines and no incline bench — the kit where the gear gate bites and the substitution ladder does the work |
| `commercial-gym.txt` | tested numbers, every machine reachable, and a core pick — the closest thing to the programme as the page prints it |

**How to use them:**

- ⛔ **Before opening an investigation**, find the equivalent row in the archetype closest to the
  athlete. If it looks the same there, you are looking at a correct state, not a defect.
- ⛔ **After any change to the composer**, run `npm run block:check`. A diff is the review artefact:
  it shows the blast radius of your change in rows, not in test names.
- ⚠️ **A failure is not automatically a bug.** Read the diff. If the change is what you meant,
  `npm run block:write` and **commit the diff**. Never regenerate to turn a test green without
  reading what moved.

```
npm run block:check    # does the composer still produce the committed output?
npm run block:print    # line counts;  npm run block:print -- home-barbell  prints one
npm run block:write    # regenerate after an intended change
```

⚠️ **Why this exists at all.** Every other test in that folder pins a rule somebody thought to pin.
The ab row that landed in the wrong place passed 2541 of them. **A green suite says the rules you
pinned still hold; it says nothing about the rows you never pinned.**

---

## 1. WHAT EXISTS — the reachable inventory

### 1a. The plan builders — four exist, one is the current work

| builder | what it builds | state |
|---|---|---|
| **Standing Plan / Standard Focus** (`_shared/standing-plan/*` behind `generate-strength-plan`) | the strength-leading block: Viada's **All Rounder (p274)** or **Strength+5K (p246)** frame, week-1 test off p215, athlete picks per frame slot, sport mix, muscle floors, plyos, endurance sizing | ⛔ **THE LIVE ONE.** Michael is running it. Everything current happens here |
| `generate-strength-plan` → Get Stronger path | the older strength-primary block | built, reachable |
| `generate-run-plan` | marathon / run plans | **runs and ships plans; carries a CLOSED FOR REPAIRS banner** (code-traced, `:1`). Known defect: a hard session is ADDED rather than converting one |
| `generate-triathlon-plan`, `generate-combined-plan` | tri / combined | same banner, same defect note (code-traced) |

⚠️ **"Closed for repairs" does not mean unreachable.** All four are wired and will build a plan if
asked. The banner is a trust statement, not a gate.

### 1b. The Standing Plan's own parts — all BUILT, all reachable

| part | file | what it does for an athlete |
|---|---|---|
| the composer | `standing-plan/compose.ts` (3350 lines) | turns a frame + the athlete's answers into twelve weeks of sessions |
| the frames as data | `frames.ts` | p246 and p274 transcribed as slot tables, standard + taper columns |
| the pretest | `working-number.ts` | p215's 1.00A/1.10A/1.15A ramp, and the 96% working number the block prescribes from |
| the picker | `accessory-picks.ts` | the athlete's choice for each of the frame's own HYP cells — **frame-specific tables, no shared default** (D-457) |
| the gear gate | `src/lib/strength-gear.ts` | can this athlete perform this movement, and which route do they reach it on |
| the muscle floor | `accessory-dosing/*` | adds a slot for a muscle the week left at zero, under a 14-set-per-session ceiling |
| the progression | `progression.ts` + `me-history.ts` | earns set counts and bar increments off logged sets — see §4 |
| the restater | `restate.ts` + `rematerialize-standing-block` | reads the test, rewrites the weeks that have not happened |
| plyometrics | `plyo.ts` | p227's named drills, one per family, on the frame's own plyo day |
| endurance sizing | `endurance-library/` + `volume-bounds.ts` | the athlete's weekly hours dialled across the frame's endurance slots |

### 1c. Built and NOT surfaced on any screen — **this is where re-invention happens**

| thing | where | why it is invisible |
|---|---|---|
| **the taper / lighter week** | `ALL_ROUNDER_TAPER` + `STRENGTH_5K_TAPER` in `frames.ts`, complete and transcribed | `composeBlock` picks the taper column only for weeks listed in `taperWeeks`, and **both build sites pass a hardcoded empty list** — `generate-strength-plan:833` and `rematerialize-standing-block:171` (code-traced). The mechanism for a deload week is fully built and cannot be reached from the app |
| **a core slot for Standard Focus** | approved by Michael 2026-08-31, **not built** | p274 prints no core row; the picker therefore never offers one, and the muscle floor was the only thing putting core in the block at all |
| **`capRollupTone`** | `state-trend/severity.ts` | zero callers since its only consumer row was deleted (doc: CAPABILITY-MAP, unverified here) |
| **`detect-cores` → segments** | three edge functions | doc says zero callers; **not verified in this pass** |

### 1d. Everything else, in one line each

- **The logger** (`StrengthLogger.tsx`, ~6600 lines) — prefills a session from the plan, logs sets, saves, offers a baseline write, and triggers the block rewrite.
- **The State screen** reads a server-built bundle (`weekly_state_v1`) and does no maths of its own.
- **`materialize-plan`** turns a stored plan week into calendar rows with `computed.steps`.
- **`save-baseline-test`** is the only writer of `user_baselines.performance_numbers` from a test.
- **Two rematerializers** — one per block type; each refuses the other's block by design.

---

## 2. HOW IT WORKS, END TO END

```
  WIZARD (NonRaceBuilder → GoalsScreen)
     │  the athlete's answers: frame, weeks, kit, sport mix, days, hours, picks
     ▼
  create-goal-and-materialize-plan          ← writes the goal, forks on posture
     │  strength=develop and no endurance=develop → the strength branch
     ▼
  generate-strength-plan                    ← composeBlock() twelve weeks, then
     │                                        buildStandingPlanRow() → plans.sessions_by_week
     ▼
  activate-plan                             ← calls materialize-plan; a hard failure aborts activation
     ▼
  materialize-plan                          ← plan week → planned_workouts rows, each with computed.steps
     ▼
  StrengthLogger                            ← renders from computed.steps; falls back to strength_exercises
     ▼
  save  →  save-baseline-test (the athlete taps)          → user_baselines.performance_numbers
        →  rematerialize-standing-block (automatic)       → rewrites the weeks that have not happened
```

*(code-traced end to end: `GoalsScreen.tsx:1256` → `create-goal…:3087` → `generate-strength-plan:714`
+ `:893` → `activate-plan:649` → `materialize-plan` → `StrengthLogger.tsx:2831/2888/2985` →
`StrengthLogger.tsx:4551`.)*

### Who owns which fact

| fact | owner | everyone else |
|---|---|---|
| **the frame's slots** (what a day contains) | `frames.ts` — the page, as data | nothing else may add or reorder a slot |
| **which movement fills a slot** | `compose.ts:exerciseForSlot`, using the picker, the gear gate and the muscle rule | the logger renames for display only |
| **the working number** | `working-number.ts` — 96% of the averaged prediction from the tested set | ⛔ **never** `training_max`, never a stored 1RM |
| **a row's weight** | the composer. `load_prescribed: false` means the row genuinely has no weight | `materialize-plan` honours the flag (`:2426`); the logger renders "By feel" |
| **the athlete's 1RMs** | `user_baselines.performance_numbers`, written only by `save-baseline-test` | the composer takes them as a **seed** for the test ramp, never as a working number |
| **what the athlete lifted** | the logged sets | the ladder reads them; nothing else |
| **the display name** | `bandRouteName` → `executionName` → `movementLabel`, display-only | ⛔ changing the canonical `name` unmatches every set logged against the old spelling |

### The three hand-offs that cost the most

1. ⛔ **The composer authors twelve weeks UP FRONT.** A fix to `compose.ts` does not reach a block
   that is already built. It arrives only when `rematerialize-standing-block` rewrites the remaining
   weeks — and that deliberately skips weeks that are done or past. **A "the fix didn't work" report
   is very often a plan built before the fix** (code-traced, `restate.ts:96`).
2. ⛔ **Supabase freezes a copy of `_shared` per function at deploy time.** Touching one shared file
   means deploying every function that bundles it. ENGINE-STATE §A carries the current closure.
3. ⛔ **The logger has three prefill paths** — `computed.steps`, the `strength_exercises` fallback,
   and the test-session builder — and a field set in one is not necessarily set in the others.
   `planned_name` was the expensive one: see `AUDIT-upper-test-session-2026-08-31.md` §9.1.

---

## 3. HOW IT REACTS TO A TEST

**Recognition.** `isBaselineTestWorkout` matches the literal name *"baseline test"* **or** the tag
`1rm_test` (code-traced, `src/lib/utils.ts:169`). The composer's session is named `Test: Upper` and
matches on the tag alone — **and that tag was added to the composer on 2026-08-31** (git-traced,
`94dc2722`). ⛔ **Any block built before that date has a test week the logger does not recognise as a
test.**

**What the logger opens the lift at.** `createBaselineTestExercise` builds an empty-bar → ~50% → ~70%
ramp into the scored set. The scored set's weight is taken from the `amrap`-flagged set in
`computed.steps`, falling back to the last set, then to `set_plan`'s top, then to the row's weight
(code-traced, `StrengthLogger.tsx:2947`). ⚠️ It used to take `sets[0]`, which on a plan's test week is
the *opening* build — that is the 115-instead-of-130 defect Michael caught before he lifted.

**What is scored.** The `amrap` flag, and only that flag — the same marker `readTestWeek` reads. One
marker, both ends (code-traced).

**What is written, and with what consent.** Two separate things, and they are independent:

| what | trigger | consent |
|---|---|---|
| `user_baselines.performance_numbers` | the athlete taps **"Save as baseline"** | explicit. And **two-phase**: if any lift tested BELOW what is stored, the server writes *nothing at all* and returns what needs deciding, so an abandoned dialog cannot half-apply (code-traced, `StrengthLogger.tsx:1271`) |
| **the rest of the block** | automatic, on save | announced with an undo sheet, not gated. Field practice — no major app puts a decision gate here (the reasoning is in the file) |

**⛔ So a block can reprice itself off a test the athlete never saved to their baselines.** The
rematerializer reads the **logged sets**, not `user_baselines`. Those are two different reads of the
same session and nothing reconciles them.

**What his test is driving now** (bench 155, OHP 105 → baselines):

- **Bench 155 prices the block.** It is the `push_upper` competition lift, so it becomes the working
  number (148.8) that every ME, DE and derived row on the push days comes off.
- ⛔ **Overhead press 105 prices NOTHING in this frame.** `PATTERN_FOR_TESTED_LIFT` maps
  `overheadPress` to `null` — no column of either frame carries a press slot — so the press is
  tested every block and its number is never spent by the plan (code-traced, `compose.ts:788`).
  It reaches the baselines and the strength line, and stops there. **That is the clearest
  "should be driving something and isn't" in the test path.**
- The test day's sessions are stamped `ME`, which is what lets them mint an estimated max for the
  strength line — without it the block's most maximal sessions reach the State screen as nothing.

---

## 4. PROGRESSIVE OVERLOAD, END TO END

**⛔ Two traps first, both already walked into.** (1) A composed fixture has **no logged history**, so
progression looks flat and is not — an "11 flat weeks" claim was made in this repo, was wrong, and
cost a reverted change. (2) A green suite is not evidence. **And do not swing the other way:** the
existence of `me-history.ts` is not proof the ladder is working on real data.

⛔⛔ **ON STANDARD FOCUS THE SCHEDULED RISE IS ZERO, AND THAT IS A RULING** (Michael, 2026-08-30,
`RATE_ANCHOR.all_rounder`). The book prints *"1% every 3 weeks"* for a **different programme**; p275
states no rate for this one. **Progression is earned or it does not happen** — a calendar drift is a
guess stacked on evidence the app already holds, and it can only ever fire for an athlete who is not
earning it. ⚠️ The other frame keeps its own rate; do not copy one to the other.

**So there are two levers, both earned:**

| lever | step | source | earned from |
|---|---|---|---|
| **the bar increment** | +5 lb upper / +10 lb lower, raised to the athlete's smallest loadable pair | ours (pivot §4), `advanceStep` | **finishing the rep band twice running** on the heavy set |
| **the ME set ladder** | 1 → 2 → 3 sets, clamped to p218's 1–3 band | p218's *"start at the lower end, increase only if progressing well"* | demonstrated sessions |

**How an increment is earned** (code-traced, `progression.ts:211` + `:601`):

- any logged set **below** the band floor → `back_off`
- not every set at the band top → `hold_add_reps`
- every set at the top (and RIR satisfied, where the intent has an RIR — ME has none) → `advance`
- `advance` twice running → **+1 step, and the rep window resets** (five at 85 and three at 90 are
  the same effort; carrying the old numbers across the jump would read the next honest session as a
  collapse)
- a **failed** attempt undoes the last step at once; three strictly falling sessions also undo it
- ⛔ **silence holds.** An unlogged week moves nothing in either direction

**Where it runs:** `earnedMeSets` is called by `rematerialize-standing-block` (`:261`), which passes
`barOffsetsByPattern`, `meSetsByPattern` and `meLastRepsByPattern` back into a fresh compose
(code-traced). **The ladder is wired.**

**⛔ What happens when a rate is smaller than the plates he owns — and this is why the drift is
zero.** One per cent on a 148.8 bench is about 1.5 lb. At a 5 lb step it rounds straight back to
where it started: **a scheduled rise cannot move a bar under roughly 250 lb**, and on the one week
per block where it happened to cross a rounding line it moved the weight for someone who might have
logged nothing. So the reps carry the progression, and the earned increment is where a jump arrives —
added to the *rounded* weight, never inside the percentage arithmetic, so it stays exactly loadable
and cannot compound with the rise. A derived lift (front squat, incline bench) takes its ratio of the
**primary's already-rounded prescribed weight**, so it moves exactly when the primary moves — the fix
for three lifts that sat frozen for twelve weeks in Michael's own export.

**⛔ THE HONEST STATE, AND IT IS THE ANSWER TO "IS PROGRESSION WORKING":** the mechanism is built,
wired and unit-tested. **It has one logged test session of real history to work with.** A test day
carries no rep-band heavy set for the ladder to read, so as of today **no increment has been earned
by anything, and none should have been.** Anyone who composes a week now and reports "the weights
don't move" is reading trap (1). ⚠️ **Progression across weeks remains unproven on real logged
history** — that is not a defect claim, it is the absence of evidence, and it stays open until he has
logged several heavy sessions at the same weight.

---

## 5. WHAT IS ACTUALLY OPEN — hard-separated from what only looks open

### Genuinely open, code-verified

1. **No lighter / taper week is reachable.** The taper column is fully transcribed; both build sites
   pass `taperWeeks: []` as a literal (code-traced, `generate-strength-plan:833`,
   `rematerialize-standing-block:171`).
2. **A core slot for Standard Focus** — approved, not built.
3. **A test session's rows carry no prescription.** ⚠️ **FIXED in the tree 2026-08-31, not deployed** —
   see `AUDIT-upper-test-session-2026-08-31.md` §9.1. The test branch built rows with no
   `planned_name`, so the logger offered "Add to plan" on prescribed lifts instead of Swap.
4. **The derived-weight note is false as written** — "About 85% of your bench press" beside a weight
   that is 58% of it (code-traced + composed).
5. **A movement reached on its dumbbell route is printed under its machine name** (`rear delt
   machine`) — composed at HEAD with an incline bench declared.
6. **The band tier still wins a cell** — `braced_pull` at a barbell home gym offers a
   chest-supported row and a band pull down, and nothing loadable beyond them.
7. **The test's press number is never spent** by either frame (§3).
8. **Progression on real logged history is unproven** — see §4, and it is unproven, not broken.

### Looks open, and is not

| claim in a doc | reality |
|---|---|
| `CAPABILITY-MAP`: *"progression is BUILT AND ORPHANED — the plan climbs on a CALENDAR only"* | ⛔ **FALSE at HEAD.** `earnedMeSets` is called by `rematerialize-standing-block:261` and its outputs are passed back into the compose. Fixed since that row was written (code-traced) |
| `CAPABILITY-MAP`: Wendler / 5-3-1 rows throughout | ⛔ **Wendler is ARCHIVED.** It must not be referenced in chat, copy or comments. Those rows describe a path that is no longer the programme |
| *"week 2 looks the same as week 1"* | expected. Progression is earned from logged history and is correctly flat until sets are logged (§4) |
| *"the tate press / rear delt machine shouldn't be there"* | both are on p221–223's own printed lists for their cells. The gear-gate and the NAME are the questions, not the pick |

---

## 6. THE TWO DOCS THAT ARE MISLEADING NEW SESSIONS

### `CAPABILITY-MAP.md` — assessed, and it is as stale as believed

- Last touched **2026-08-26** (git-traced) — before the Standard Focus arc, the gear-gate work, the
  test-week tag, and the progression wiring.
- Its Standing Plan row asserts progression is orphaned. **That is now false** (verified above).
- It is built around **Wendler**, which is archived.
- It says of itself: *"when you ship something that changes a row, change the row"* — and that has
  not happened for a month of daily shipping.

**⛔ PROPOSED, NOT DONE — Michael's ruling required.** Put a dead-marker at the top of
`CAPABILITY-MAP.md` pointing at this file. **Do not delete it and do not rewrite it**: it is the only
record of several 2026-07 findings, and its "built, tested, never executed" list is still the best
inventory of that class of problem. It should be marked, not erased.

### `TRUTH-MAP.md` — right for what it covers, blind to the current work

Code-derived 2026-07-09/10 and accurate for the layers it maps (baselines / spine / arc / coach
payload) — but it **predates the Standing Plan entirely**. None of the facts this month's work turns
on appear in it: the working number, slot picks, the gear gate's route tiers, the muscle floor, the
earned ladder. §2 of this file is the authority table for those until someone extends TRUTH-MAP.

⚠️ Its `1RM anchor` row still points at `resolveStrengthCapacity` — **typed wins** — which is a
different question from the Standing Plan's working number. The two must not be collapsed.

---

## 7. THE LAWS A NEW SESSION MUST NOT RELEARN

- ⛔ **Viada is the only source. Wendler / 5-3-1 is archived** — never in chat, copy or comments.
- ⛔ **The 5K plan is PARKED.** Never mention it.
- ⛔ **The muscle the page names is the law**, at every kit. Movements may leave his printed list when
  the kit demands it; the muscle may not.
- ⛔ **His movements outrank substitutes**, at every kit and every frame.
- ⛔ **The frame is explicit at every call site** (D-457 — one frame's constants indexed by the
  other's rows has recurred about eight times and never errors).
- ⛔ **Every session says which page it came from.**
- ⛔ **Label every claim by evidence class** — composed / rendered / live / code-traced.
- ⛔ **A green suite is not evidence a day improved.** Compose the week and print it.
- ⛔ **Never `git add -A`.** Three sessions share this repo.
- ⛔ **Commit, push and deploy wait for Michael every time.** Reads and edits are free.
- ⛔ **Never read `.env` or query production without his explicit go-ahead, typed by him.** A peer
  session cannot grant it.
- ⛔ **Never write his data to the database.** Fix forward.
- ⛔ **He built the app and does not read code.** Say what he would SEE. No emojis, no narration,
  under six lines by default.
