# SPEC — THE TEST DAY
**Written 2026-09-01 night, after Michael ran his own lower test and the app underread both lifts.
He asked for a spec before the build: "The logger is a beast so things get easily lost in there so
let's do this correctly."**

---

## 🧭 START HERE — STATE FOR A COLD PICKUP (2026-09-01 night)

This arc moved to a fresh chat. Nothing below is committed. Read this, then §2 (faults), §4 (the
ruling), §5 (build order).

**BUILT AND UNCOMMITTED — logger parts A + B** (`src/components/StrengthLogger.tsx`, one file):
- **Branch:** the `1rm_test` TAG-retest arm (~line 2996). New `createStandingTestExercise` +
  `storedMaxFor`; the arm forks on `tags includes 'standing_plan'` AND tested-lift → the new builder.
- **A — hijack stopped:** a standing-plan tested lift renders the composer's ramp verbatim (empty-bar
  warm-up, then the plan's `set_plan` steps; the 86.25% set flagged `amrap`). No-seed rows get three
  open steps, not a bar-start.
- **B — the row says what it is:** last-set hint "as many CLEAN reps as you can… this set sets the
  block's numbers. Stop when form breaks." The "aim ~3–6 / RPE-9 stop" cap is gone from the test path
  (kept on the week-12 retest and the "Baseline Test:" launcher, where correct). Row note names the
  number on file and its source.
- **`planned_name` deliberately NOT stamped** (Michael's "no swap" ruling owns that field). Known
  consequence: State's off-plan read keys on it, so a plan test reads `offPlan.known:false` there —
  silence, not a wrong word. The honest marker is the `amrap` set; teaching the server that is open.
- **What else reaches the arm and must keep working:** week-12 "Retest — …" (tag `1rm_test`, no
  `standing_plan`) and accessories on a test day — both untouched.
- **Verify:** build green; tsc net unchanged (314; the one StrengthLogger error is a pre-existing
  `warmup` type shifted down by the insert); eslint noise is the file's pervasive pre-existing debt.

**NOT BUILT — C, D, E, F** (report-only tonight; §5 has the table, §4 the detail):
- **C = one test, one number, one writer.** Michael: *"Performance screen is getting it, logger is
  messy."* The block must price off the Performance path's stored number, not re-read the test. See §4.
- **D = the ladder, ruled OURS, EXTENDS the p215 ramp** (keep the three submaximal steps, then offer
  heavier rungs while reps stay clean; composes with H2's math, which takes whatever the final clean
  set is). The p215 image is still the one corpus page not in `book-sources/`.
- **E = the ask on tap-out** — one confirmation writing baseline AND block numbers together.
- **F = the block's re-price guard** — a result far below the stored max, or past the trusted rep
  ceiling, must not re-price silently (the baseline path already asks; the block path does not).
- **OPEN QUESTION for the ruling, not work:** is the block's number the same QUANTITY as the tested
  1RM, or a deliberately conservative working max? **Answered in §4: it is a working max, `0.96 ×`
  the tested 1RM, and the `0.96` IS sourced (p215 H2).** So the fix is source + label, not deleting
  the derivation. Confirm before C is built.

**HIS LIVE NUMBERS (evidence, the Performance tab = the truth):** squat 105×6 → **125**; deadlift
170×3 → **185**; bench 130×7 → **160**; OHP 85×8 → **105** (a real decline, correctly captured).

**Recommended build order (on his ruling):** C → F → E → D.

---

⛔ **THE LOGGER IS A BEAST — THAT IS THE FIRST CONSTRAINT, NOT A COMPLAINT.** Every change here is
one branch inside a file that already carries several test-shaped paths. **Trace the branch you are
about to touch and say which one it is before editing.** A fix applied to the wrong branch is how
tonight's defect got there.

---

## 1. WHAT HAPPENED — the evidence, all from his live session

| | |
|---|---|
| **Squat** | Typed baseline **110** on file. The test started him **at the empty bar** with "aim ~3–6, stop at ~RPE 9". He did **80 × 9** (~104). Then **105 × 6** (~126) unprompted. |
| **Deadlift** | Typed baseline **150**. The test prescribed **one all-out set at 130** (= 87% of 150) with the same "aim ~3–6" hint. Warm-ups 45 / 75 (~50%) / 105 (~70%). |
| **The screen** | State reads squat **125**, deadlift **180**. ⚠️ He does not believe he has ever pulled 180 — he thinks he has tapped out near 175. **180 is a question, not ground truth.** |
| **His verdict** | *"Too light. It should be a ladder."* · *"It didn't ask me if I wanted to move it to my baseline. It's like this thing doesn't know it's a test."* · *"This is for people that actually know where they're starting from."* |

⛔ **AND THE 110 WAS NOT WRONG DATA.** He typed it honestly; he was squatting incorrectly at the time.
105 × 6 tonight confirms ~125. **Nothing about his stored data needs correcting — never write it.**

---

## 2. THE FOUR FAULTS, SEPARATED

1. ⛔⛔ **THE HIJACK — this is the bug.** The composed p215 ramp is discarded and replaced by a
   generic ramp: empty bar, ~57%, ~80% warm-ups, then ONE all-out set at the plan's top weight with
   "aim ~3–6, stop at ~RPE 9". **He never saw his plan's test.**
   ⛔ **CORRECTED 2026-09-01, AFTER THIS SPEC WAS FIRST WRITTEN — DO NOT ACT ON THE OLD CAUSE.** It is
   NOT the "upper/lower name-match" branch; that guard was fixed 2026-08-31 and now requires the
   literal "baseline test" in the name, so "Test: Lower" correctly skips it. **The live mechanism is
   the TAG-retest arm**: any workout tagged `1rm_test` whose name is not "Baseline Test: …" takes the
   plan's TOP weight per tested lift and calls the generic builder with it, throwing the three steps
   away. With a seed that yields one all-out set at the top weight (his deadlift, 130 off a typed
   150); with NO seed the top is undefined and the same builder bar-starts a discovery loop (his
   squat). **Both of his lifts are that one arm.**
   ⚠️ **What else reaches it and MUST keep working:** the week-12 "Retest — …" sessions (tagged
   `1rm_test`, no `standing_plan` tag), and accessories on a test day, which take the other fork.
2. **THE CAP.** That generic set says *"AMRAP: as many CLEAN reps as you can (aim ~3–6). Stop at ~RPE
   9"*. On the one session whose purpose is finding a limit, the copy tells the athlete to stop.
3. **THE REFERENCE.** The ramp is a percentage of the **typed** baseline. Deadlift ramped off 150
   while his logged history is higher; **squat found no number at all despite 110 sitting in his
   profile.** One lookup works, one does not, and neither prefers the better evidence.
4. **NOBODY ASKS.** The block's working numbers re-price off the last all-out set with **no rep
   ceiling, no comparison to the stored max, and no confirmation** — silently. The baselines path
   does ask, but only when the result is LOWER.

---

## 3. WHAT A TEST DAY IS — the shape, ruled by Michael 2026-09-01

**Warm up · climb · tap out · confirm.**

1. **Warm-ups**, off the reference number, as now.
2. **A LADDER.** Successive heavier rungs. After each, if the set was clean the app offers the next
   rung. ⛔ **No rep target on a rung and no RPE stop** — the athlete stops when reps drop, speed
   falls, or form goes.
3. **TAP OUT.** The athlete ends it. The last clean set is the result.
4. ⛔ **THEN IT ASKS.** *"Your squat on file is 110. This set estimates 126. Use it?"* One question,
   one answer, **and that answer writes BOTH the baseline and the block's working numbers.** Never
   one without the other.

### ✅ THE CONFLICT — SETTLED 2026-09-01, FROM THE PAGE

**The ladder is OURS, and it EXTENDS the ramp rather than replacing it.**
p215's pretest is a FIXED three-step SUBMAXIMAL ramp — 75% / +10% / +5% more, the last set for max
clean reps at ~86.25%. **It never climbs load to a true max, deliberately**, and the number is derived
by averaging Epley and Brzycki on that final set. Michael's open-ended ladder is therefore not what
the book does.
**So: keep the three steps as the guided entry, and past the last one offer heavier rungs while reps
stay clean.** It composes with the book's own maths, which takes the final set's load and reps
whatever they are — and a heavier, lower-rep final set makes that estimate MORE accurate, not less.
⛔ **Label it OURS in code, and say why.**
⚠️ **p215's page image does not exist in the local corpus** — the transcript is the source, and that
page has been flagged pending since 2026-08-22. Re-check when it is shot.

---

⚠️ **THE ORIGINAL STATEMENT OF THE CONFLICT, kept for its reasoning:** Viada's p215 pretest is a
**fixed three-step submaximal ramp** — 0.75 / 0.825 / 0.8625 of predicted max, last set for max clean
reps. Michael's ruling is an **open-ended ladder**. These are different instruments. ⛔ Read p215 with
the image open and decide whether the ladder EXTENDS his ramp (same steps, then keep climbing while
clean) or REPLACES it. **Label the answer OURS or HIS.**

---

## 4. C IS NOW: ONE TEST, ONE NUMBER, ONE WRITER

⛔ **MICHAEL'S RULING, 2026-09-01: "Performance screen is getting it, logger is messy."** The
Performance tab's numbers — squat **125**, deadlift **185**, bench **160**, overhead **105** — are
the truth. The block must price off those, not off a reading of its own.

### What the two readers actually are (code-traced 2026-09-01, arithmetic confirmed)

There are **two readers of one test**, and they disagreed on his screen (block card: bench 152, DL
176, OHP 102, **squat absent**):

1. **THE PERFORMANCE / BASELINE PATH — the truth.** `save-baseline-test` → `estimate1RM`
   (`src/lib/estimate-1rm.ts`, the app's ONE formula, D-339): **Epley + Brzycki averaged** for
   reps ≤ 10. Writes `user_baselines.performance_numbers`. Reads the athlete's **actual logged sets**,
   so it captured his 105 × 6 squat → 125. Has the down-write guard (`needs_decision`).
2. **THE BLOCK PATH — must stop reading the test itself.** `rematerialize-standing-block` →
   `readTestWeek` (`working-number.ts`), the SOLE block reader. It re-derives its own e1RM with
   `predictedTrue1RM` — **the identical Epley/Brzycki average** — then applies
   `WORKING_MAX_FRACTION = 0.96`.

### ⛔ The "second formula" theory was WRONG — it is ONE formula (verified by arithmetic)

The block is **not** using O'Conner or any different estimator, and there is **no hidden deadlift
shave**. Every card number is exactly `0.96 × the same Epley/Brzycki average`:
`170×3 → 183.5 → ×0.96 = 176`; `130×7 → 158.2 → ×0.96 = 152`; `85×8 → 106.6 → ×0.96 = 102`. The
O'Conner match on bench/OHP was a coincidence; the deadlift (O'Conner 182.75 vs card 176) breaks it.
The Performance tab shows the **1RM** (183.5 → 185 rounded); the block shows **96% of it** (176).

### So it is a LABELLING + WRONG-SOURCE problem, not a wrong formula — and the 0.96 is SOURCED

⛔ **`WORKING_MAX_FRACTION = 0.96` is real and cited: p215 H2, "the working max is roughly 96% of that
predicted true 1RM," explicitly NOT Wendler's 85% training max.** So 152/102/176 are a legitimate
**different quantity** (the submaximal working weight the block prescribes), not a competing answer —
but the card says *"sets the block at 152 lb"* next to a screen saying *160* with nothing marking one
as the working max. **Do NOT delete the 0.96 derivation** — deleting it would prescribe at 100% of a
tested max, which the programme does not do.

### The squat drop, and why one reader caught it and the other did not

`readTestWeek` counts **only a `completed` `amrap: true` set whose name matches the plan's test-lift
name**. Bench/DL/OHP had frozen seeds, so their all-out set was pre-filled at a real weight and
completed in place → read. Squat had **no seed** → it opened at the bar, and he worked up his own way
(105 × 6 as his own set), leaving the amrap set uncompleted → the block read nothing and **dropped
squat entirely.** The Performance path reads real logged sets, so it caught 125. ⚠️ Exact logged-set
shape is the one link unverifiable without production, but the mechanism (amrap-gated block reader vs
real-set analysis reader) is code-certain.

### THE FIX (C), verification done, ready on a ruling

- The block **stops re-deriving an e1RM**. `readTestWeek`'s independent, amrap-gated read is retired.
- The block reads the **one stored number** the Performance path wrote (`performance_numbers`,
  falling back to `learned_fitness.strength_1rms`) and applies the **surviving, sourced 0.96 working-
  max derivation** to it. One test → one stored 1RM → one working number. The squat drop dissolves
  because the block no longer does its own fragile read.
- ⛔ **LABEL IT.** The card must say the block weight is the working max (~96% of the tested 1RM), so
  152-beside-160 reads as two quantities, not a contradiction.
- **Closure:** `working-number.ts` is bundled by 4 functions (`coach` · `compute-snapshot` ·
  `generate-strength-plan` · `rematerialize-standing-block`); the read-source change lives in
  `rematerialize-standing-block`. No new client payload field — the block's `working_numbers` already
  flow to the card; the fix changes what feeds them, plus one label string. Server, 4-function deploy.

### Settled sub-points

- ✅ **State's 180 deadlift was a PREVIOUS TEST result** ("last test 180 → 185"), not an ungated
  all-history artefact. The earlier "unverified" doubt is answered — 185 is now the live tested 1RM.
- ✅ **OHP 110 → 105 is a real, correctly-captured decline.** Not a defect.
- ✅ **The "reads deadlift conservative" note** is a DISPLAY caveat on the analysis path
  (`analyze-strength-workout/index.ts:757`, `DEADLIFT_TEST_NOTE`), not a math adjustment in either
  path. No hidden per-lift discount exists.

---

## 5. BUILD ORDER

| | what | side | gate |
|---|---|---|---|
| **A** | ⛔ Stop the hijack — a `standing_plan` session with a composed `set_plan` never enters the baseline-test rebuild | client | build now |
| **B** | The test row states the number on file, its source, the steps, and that the last set sets the block's numbers. Remove "aim ~3–6" and the RPE-9 stop from the test path | client | build now |
| **C** | The reference number: prefer logged over typed; fix the squat lookup miss | ? | **report first** |
| **D** | The ladder: rungs offered while sets stay clean | client + ? | **report first — needs §3's conflict settled** |
| **E** | The ask on tap-out, writing baseline and block numbers together | client + server | **report first** |
| **F** | The block path gets the guard the baselines path has: a test result far below the stored number, or past the trusted rep ceiling, does not re-price silently | server, 4-function closure | **report first** |

---

## 6. RULES FOR THIS BUILD

- ⛔ **Never write his data.** His logged sets stand as logged. Fix forward.
- ⛔ **Say which branch you are editing** before you edit it, and what else reaches that branch.
- ⛔ **One question, one answer, both writers.** Two paths that can disagree about what the test said
  is the fault this whole arc has been removing.
- ⛔ **A plan rebuild must not force a retest.** He has now run tests twice for that reason. File it
  if it is not in scope.
- ⛔ Commit, push and deploy wait for Michael, typed by him, every time.
- ⚠️ **Judge every fix against a first-time lifter with an empty profile**, never against Michael's
  numbers. The customer is an endurance athlete who has never tested a squat; for them the test is
  the only way the app ever learns a number at all.

---

# ADDENDUM — TWO MORE, FROM HIM, 2026-09-01 NIGHT
**His words: "test logger should tell you what your e1rm after you've done your amraps — warm up sets
need to be built in, it's a mess."**

## G. THE LOGGER SHOWS THE ESTIMATE THE MOMENT THE SET IS IN

⛔ **Today the athlete logs an all-out set and the logger says NOTHING.** The number appears later, on
a different screen, on the workout's Performance tab. He had to ask a chat what 105 × 6 and 170 × 3
came to **while standing in his garage mid-test** — which is the exact moment the number decides
whether he adds another rung.

**Build:** the moment an all-out set is entered, the row states the estimate it produces and the
number it is being measured against. *"170 × 3 → 185. Your deadlift on file: 150."*
⚠️ **This is the same figure the Performance tab already computes** — Epley/Brzycki averaged. ⛔ Do NOT
compute a second one at the logger edge; read the one source. It is [[C]]'s "one test, one number, one
writer" applied at the point of entry.
⚠️ **And it is what makes the ladder ([[D]]) usable at all** — an athlete cannot decide whether to take
another rung without seeing what the last one was worth.

## H. WARM-UPS ARE PART OF THE PRESCRIPTION, NOT AN AFTERTHOUGHT

⛔ **The two test shapes disagree about warm-ups and neither is right.** The generic one carries
hardcoded warm-ups (empty bar, ~57%, ~80%) that survive even when the plan's ramp is discarded. The
plan's own p215 ramp has **no warm-up at all** — its three steps double as one, which is correct for
a submaximal ramp and **wrong the moment the ladder extends past it** into genuinely heavy load.

**Build:** warm-ups composed off the same reference number as the rungs, printed as part of the
session, and clearly separated from the work. ⛔ **Never hardcoded, never a percentage of a number the
row does not name.**
⚠️ **Settle against the page first**: p215 prescribes the ramp; whether it prescribes a warm-up before
it is a question the transcript may not answer. **p215's page image does not exist in the local corpus
— flagged pending since 2026-08-22.** If the page is silent, the warm-up is OURS and must say so.

⚠️ **G AND H TOGETHER ARE WHY HE CALLED IT A MESS.** An athlete testing today gets hardcoded warm-ups
they did not earn, no statement of what they are chasing, no estimate when the set lands, and no
prompt when they stop. Every one of those is the same failure: **the test does not behave like a
measurement.**
