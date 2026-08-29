# WORKORDER — THE PROGRESS STANDARD

> ## STATE: SPECIFIED 2026-08-28. NOTHING BUILT.
> Written in the project-manager chat after reading `HANDOFF-the-strength-and-endurance-read-2026-08-28.md`
> and tracing the live code. **Michael has not approved a build.** Items are ordered; item 1 is a
> live regression and is the only one that should move before he rules on the rest.
>
> **Read the handoff first.** This file does not repeat it; it corrects the standard the handoff's
> build was measured against.

---

## THE ASK, IN HIS WORDS

*"Looking for the TrainingPeaks / Viada standard for tracking endurance and strength gains. The chat
seemed to think it had to be plan dependent to give numbers. What we built wasn't collecting data
right — counting low weight sets against the max — and endurance was not figuring out numbers based
on total runs, discarding fast and hilly runs."*

All three complaints are confirmed against the code. They are one mistake, stated three ways:
**the build made the plan a precondition for a measurement, and then filtered the population down to
whatever the plan prescribed.**

---

## THE STANDARD — ENDURANCE (TrainingPeaks)

⛔ **Derived from the field FIRST, then traced against what exists. That order is the rule the
handoff's own "THREE MISTAKES" section names.**

1. **Efficiency Factor is the headline.** Grade-adjusted pace ÷ average HR (run), normalized power ÷
   average HR (ride). It rises as the athlete gets fitter. **TrainingPeaks computes it on every
   session carrying pace/power and HR. No duration window. No session-type exclusion.**
2. **Hills are corrected, not discarded.** Grade adjustment is the entire mechanism. Dropping a hilly
   run is doing by exclusion what the metric already does by arithmetic.
3. **Fast sessions are grouped, not deleted.** Comparison is like-for-like by session type — easy vs
   easy, quality vs quality. The field compares within groups. It does not bin two of every three runs.
4. **Decoupling (Pa:HR) is the second number** — back-half falloff of the pace-to-HR ratio. Under 5%
   reads as aerobically durable. Already built here and already correct on population (D-283 kept hot
   runs; do not re-add exclusions).
5. **Threshold pace / FTP is the third** — re-estimated periodically, and it should get faster. This
   is the endurance twin of the estimated 1RM. ⛔ **Blocked on Q-290** for the run: FTP accumulates a
   dated trail, run threshold pace is a single value overwritten in place.

⚠️ **None of the five needs a plan.**

## THE STANDARD — STRENGTH (Strong / Hevy / Boostcamp, and Viada p123)

Three tiers, three different reads. The build gave all lifts one read and then gated it.

| Tier | The read | Needs a plan? |
|---|---|---|
| **Primary** — squat, bench, deadlift, press | Estimated 1RM off the heaviest set, trended | No |
| **Secondary** — front squat, incline, RDL, close-grip, trap bar | The same estimated-max line, its own history | No |
| **Accessory** — curls, rows, raises, machines | **Records and best sets** (heaviest weight at a rep count) + session volume. **Nobody trends a 1RM here.** | No |

⛔ **"HEAVY" IS A PROPERTY OF THE SET, NOT A LABEL THE PLAN WROTE ON IT.** Low reps at a high fraction
of the known max. This is Q-297 and it is the load-bearing correction: deciding heaviness from the
set is what makes the line work off-plan, on the Get Stronger main lift (which currently mints
nothing), and on imported sessions.

⚠️ **The handoff already flags the false claim in the code comment** — Strong, Hevy and Boostcamp do
NOT separate heavy from light on their charts. Correct that comment when the file is next touched;
do not cite it.

## WHAT VIADA ADDS, AND WHERE HE DIVERGES

- **p123, endurance:** three signs the same work got easier — lower HR at completion, lower reported
  RPE, less rest taken on self-led work. Cadence **six weeks**. What moves is the **threshold pace
  the next cycle is written from**, not the volume.
- **p123, "the circle of maxes":** repeated success at the prescribed rep target raises the
  theoretical 1RM and the next microcycles are built from it. That IS a max line off heavy sets.
- **p107:** drift terminates a session at 10%, **5% if a key session falls within 24 hours.**

⛔ **THE FORK, AND IT IS THE WHOLE DESIGN CALL.** Viada's progress test is *the same prescribed
session compared to itself* — so it requires a repeated named session, so it requires a plan.
TrainingPeaks' test requires nothing. **TrainingPeaks is the spine; Viada is the overlay that
appears when a block exists.** The build inverted this — the overlay shipped as the primary read and
the spine was filtered down to nothing.

---

# THE ITEMS

## ⛔ ITEM 1 — UNGATE THE RECORDS. Live regression, fix first, independent of everything below.

`buildAllTimeBestByLift` in `_shared/state-trend/assemble.ts` applies `intentCanMintAMax`. Remove
that one call. **Keep the rep-ceiling gate (`estimateIsTrusted`) — that one is right and is D-417.**

**Why:** the line and the record are different claims. The line is about DIRECTION and needs clean
input. The record is about the best you have done and only needs the set to be real. A front squat, a
trap bar deadlift or a curl carries no heavy mark and never will, so under the gate it can no longer
set a record at all.

⚠️ **`count` is gated by the same call and feeds the PR-confidence floor (≥3 readings). Ungating
restores both together, which is correct — but check `isPr` reads sanely afterwards.**

⚠️ Fix the two test fixtures that rebuild rows for the record gate; they will now pass for the wrong
reason if left asserting the gated behaviour.

## ITEM 2 — RUN EFFICIENCY READS EVERY RUN

`_shared/state-trend/run.ts`, `efficiencyIndexToSeries` and `recentEfficiencyPaceHr`:

- ⛔ **Drop the 30–70 minute window** from both. Michael ruled the floor out directly (*"let's match
  TrainingPeaks"*) — his week is two 27-minute runs and one 63-minute session, so **two of every three
  runs never reached the metric.** TrainingPeaks applies no floor. This was a SAMPLE problem
  presenting as a noise problem (Q-295). ⛔ **The ceiling goes too — see below. Q-295 is now CLOSED at
  both ends; do not reopen either as an option.**
- ⛔ **Stop excluding non-steady runs by deletion.** `isSteadyAerobic` bins anything containing
  interval / tempo / fartlek / threshold / vo2 / speed / track / race / surge. Replace exclusion with
  **grouping**: efficiency trends within a session-type group (easy, quality), never pooled across.
- ⛔ **THE 70-MINUTE CEILING IS RULED OUT TOO — Michael, 2026-08-28.** Q-295 left it open; it is now
  closed. *"It shouldn't cap at 70, that's crucial for marathon trainers."* Four reasons, all checked:
  1. **TrainingPeaks applies no duration ceiling to Efficiency Factor.** It is computed on every
     session carrying pace and HR, long runs included.
  2. ⛔ **THE APP ALREADY CONTRADICTS ITSELF.** The ceiling exists at exactly two call sites, both on
     the run EFFICIENCY rows (`run.ts:85` and `run.ts:110`). The DURABILITY row beside it
     (`isQualifyingDecouplingRow`, `run.ts:264`) has a ≥20 min floor and **no ceiling**, and the bike
     has neither. **Two numbers on one screen, two different populations of runs.** Whatever the
     ceiling is protecting against, the neighbouring metric has been living without it.
  3. **It deletes the sessions with the most signal.** A 27-minute run barely drifts. Efficiency decay
     and drift are duration-dependent — Friel's decoupling protocol is a LONG steady effort against
     the 5% line. The ceiling removes the only runs where the number means much.
  4. **For a marathon athlete the long run IS the session.** Capping at 70 minutes measures everything
     except the thing being trained for.
- ⛔ **THE ORIGINAL ARGUMENT IS NOT DISMISSED — IT IS REDIRECTED.** "A long run drifts more, so it is
  not comparable to a 40-minute run" is TRUE. It is a reason to compare long runs **to other long
  runs**, not a reason to delete them. **This is the same grouping fix the bullet above already needs
  for quality sessions** — one mechanism, two populations it fixes. Do not build a second one.
- ⛔ **THE LONG-RUN HEADLINE — ANSWERED 2026-08-28, and the answer is NOT a duration rule.**
  **THE FIELD GIVES THE TWO NUMBERS DIFFERENT JOBS, not a winner.** Efficiency Factor is the
  CROSS-SESSION trend (speed per heartbeat, every run, rising over weeks — "am I getting fitter").
  Decoupling/fade is the WITHIN-SESSION read (back-half falloff, ≤5%, Friel's band — "can I hold
  it"), and it is the marathon-specific one. **The long run gets a fade number AND still feeds the
  efficiency trend.** Not either/or.
  ⛔⛔ **BUT FADE REQUIRES A STEADY EFFORT, AND VIADA'S LONG RUN IS DELIBERATELY NOT ONE.** Off the
  corpus, p235 and p246:
  - *"Unlike VT1 sessions, LSD **may include rest periods or pauses** in the hike/jog with little
    negative impact."*
  - *"runs up to **90 to 100 minutes** here with an emphasis on **LT intervals**, and less
    experienced runners opting for **shorter fartlek variations**."*
  - Every LSD level inserts efforts — race-pace finishes, 115% surges, mid-run intervals — and
    *"intensity may be lower past 60 minutes."*
  - It may be *"a hike, a long ride, a team sport day."*
  ⛔ **So a fade read on a Viada long run would report a durability failure EVERY WEEK on an athlete
  doing exactly what the book asked.** The pace changes by prescription; the ratio falls apart by
  design.
  ⛔ **THE RULE: decide by WHAT THE SESSION ACTUALLY WAS, not by its duration and not by its plan.**
  Pace held steady → the long run leads on fade. Surges, pauses or a race-pace finish → it feeds the
  efficiency trend and shows **no fade number at all.**
  ⚠️ **THE FLAG ALREADY EXISTS** — `decoupling_mixed_effort` (`run.ts`, the `DecouplingRow` doc).
  D-283 correctly made it a HEDGE rather than an exclusion for the general durability row. **Here it
  is the SWITCH**, and that is not a contradiction of D-283: D-283 says do not delete a steady run
  for being *low-confidence*, this says do not print a fade number for a session that **was not
  steady**. ⛔ Do not use it to drop the run from the efficiency trend — only to withhold the fade
  figure. **Trace it before writing a second steadiness test.**
  ⚠️ **CONSEQUENCE, STATED AND CORRECT:** a marathon-plan long run is usually genuinely steady and
  gets the fade read; a Viada standing-block long run usually is not and does not. **Same athlete,
  same distance, different number.** That is the design, not a bug — say so on the screen rather than
  letting it read as missing data.
  ⛔ **AND DO NOT CONFLATE THE TWO 5% FIGURES.** Viada p107 (10%, or 5% with a key session within 24h)
  is a **session-TERMINATION** rule. Friel's ≤5% is a **fitness/durability** band. Same number, two
  different claims, and the endurance card currently prints p107's beside the drift figure. If the
  fade read lands, one screen must not state both as though they were one thing.
- Keep the plausibility band and the grade-adjusted-first read. Grade adjustment is already there and
  already preferred — the handoff records asserting otherwise and being wrong.

⚠️ **Fix the copy at the same time.** The row currently opens *"Reading 23 runs — the change is
smaller than the normal spread between them"*, which was never 23 runs feeding it. Recount after the
filters move.

## ITEM 3 — THE ENDURANCE CARDS RENDER WITHOUT A PLAN

`compute-snapshot/index.ts`, the `namedSessions` block (~line 1108).

Today a run appears only if it carries `planned_id` → a planned row tagged `family:run_near_threshold`
→ a date inside the current block's week map. **Three plan preconditions on a measurement that has
none.** This is Q-294, which Michael already ruled: *a lift is prescribed so the plan is the right
frame; a run is yours whether a plan exists or not.*

- **The spine is athlete-scoped**: every run/ride with the facts, grouped by session type, no plan
  required, no block week axis.
- **The plan-linked view becomes an overlay**, not the gate — when a block exists, the same
  prescribed session week by week is a legitimate second layer, and it is Viada's own read.
- ⛔ **Do NOT add a day-of-week + duration fallback that guesses which session a run was.** Ruled
  2026-08-28. The overlay stays honest by staying linked; the spine doesn't need to guess because it
  doesn't care.
- ⚠️ `state-trend/run.ts` already carried a plan-free predicate. A plan-locked one was built beside
  it. **Check for the existing one before writing a third.**

⚠️ **Keep the block-scoping ARGUMENT that already lives in that comment** — across blocks the same
family resolves at a different level and duration, so the OVERLAY must stay block-scoped. The spine
is not that shape and is not subject to it.

## ITEM 4 — HEAVY IS DERIVED FROM THE SET (Q-297)

Two tiers, in this order:
1. **Stamped intent where it exists** — `slot_intent == 'ME'`. Unchanged, already built and deployed.
2. **Derive where it does not** — ME is a number: **1–5 reps at 90–100%** (`intents.ts:74`). Weight,
   reps and the max are all on the logged set.

Closes the off-plan athlete, the Strava importer, and the Get Stronger main lift — which is
deliberately unstamped (a 5/3/1 top set is 65–95%, so claiming ME would assert a band that programme
does not prescribe) and therefore **currently mints nothing at all.**

⚠️ **Needs a max recent enough to divide by**, which is exactly what a new athlete lacks. State the
fallback explicitly rather than letting it fail silently.

⚠️ **`intentCanMintAMax` fails CLOSED and that stays** — Michael ruled it on 2026-08-28 (*"begin this
line fresh… don't let the old lifts drag me down"*). Derivation is a second door into the same gate,
not a loosening of it.

## ITEM 5 — ACCESSORIES AND SECONDARIES GET THE RIGHT READ

- **Secondary lifts:** their own estimated-max line, their own history. No plan.
- **Accessories:** ⛔ **records and best sets, NOT a max line.** No reference number needed, so none
  of item 4's "needs a recent max" problem applies. This is the Hevy solution and it is lighter than
  the gate.
- ⛔ **WHERE IT RENDERS — RULED 2026-08-28 (Michael). NOT A PICKER.** He asked directly whether this
  means a dropdown of every accessory and secondary lift. **It does not, and a dropdown is the answer
  to reject.** Field standard (Strong, Hevy): the summary screen carries **only the main lifts as
  cards**; every other lift's record lives **on that lift itself** — the athlete opens the exercise
  where they log it and its history and best are there. No list to scroll, no picker, and the record
  is only ever seen in the context where that lift was already the subject.
  ⚠️ **The logged-sets history already on the screen is the natural hanging point.** Trace it before
  adding a surface. ⛔ **Do not add a lift selector to the State screen.**
- Volume already exists per set (`_shared/workload.ts`, `session-load.ts`). **Trace before building a
  second tonnage.**

---

## ⛔ RULED OUT PERMANENTLY — SLEEP / ENERGY / SORENESS (Michael, 2026-08-28)

*"I don't wanna fuck with the sleep stuff because I can't get reliable data based on the accessible
dev APIs and no one will log that shit."*

⛔ **THIS IS A PRODUCT RULING, NOT A DEFERRAL. Do not propose a subjective-wellness input, a
readiness score built on one, or a manual soreness/energy prompt again.** Two independent reasons,
either sufficient:
1. **The data is not obtainable.** The accessible consumer dev APIs do not return sleep reliably
   enough to compute anything on.
2. **Self-report will not be logged.** Compliance on manual wellness entry is poor in every product
   that has shipped it, and a metric nobody fills in is worse than an absent one — it renders as a
   number rather than as a gap.

⛔⛔ **WHICH ROW — TRACED 2026-08-28 AFTER GETTING IT WRONG ONCE. THERE ARE TWO, AND ONLY ONE GOES.**

| Row | What it is | Ruling |
|---|---|---|
| **BODY** | Effort rating + soreness, written by the **post-workout tap** (`PostWorkoutFeedback.tsx`, D-234/D-235, Hooper 1–7). Live and populated — Michael's screen reads *"5.1 of 10 avg vs 4.5 typical · Soreness 1.0 of 7 · logged on 7 sessions."* | ⛔ **STAYS. Do not touch it.** |
| **READINESS** | energy / soreness / sleep as three chips off a **standalone daily check-in** (`StateTab.tsx:1688`, Q-049 Phase 1, D-144). Renders only when a check-in exists. **Michael has never done one, so it does not render at all.** | ⛔ **THIS is the one that comes off.** |

⚠️ **THE EARLIER FRAMING WAS TOO BROAD** and would have deleted a working input. The post-workout
soreness tap is a subjective input Michael DOES use; the ruling kills the **standalone check-in**,
not self-report as a category.

⚠️ **AND `WORKORDER-the-strength-read-2026-08-28.md` item 4's *"nothing under `src/` writes it"* is
about READINESS**, not BODY. Read it that way or you will remove the wrong row.

⚠️ **THIS DOES NOT TOUCH MEASURED RECOVERY INPUTS** — heart rate, drift, and the load reconciler are
unaffected.

---

# ⛔ RULES FOR THIS BUILD

1. **Derive from the source and the field FIRST, then trace what exists.** `trace-before-build`
   prevents rebuilding; it is not a licence to let what is built define what should be measured.
2. **Ask what the app knows WITHOUT a plan.** This codebase keeps failing to ask it. Every item above
   is a consequence of not asking.
3. **A gate that reads `undefined` does not error — it takes the absent branch.** `slot_intent` was
   dropped at three narrow points in one evening. Grep any new field across `compute-snapshot`,
   `assemble.ts` and the fixtures before assuming one write site is enough.
4. **Verify with deno fixtures, not prod.** Keep each bug case as a permanent regression.
5. **Never say "shipped."** Pushed / deployed / verified, separately, every time.
6. **Push and deploy wait for Michael, in his own session.**

# TIMING

⚠️ **Michael rebuilds his block Monday 2026-08-31.** The 2026-08-28 deploy is already ahead of him
and unverified on everything. **Item 1 is safe to move now.** Items 2–5 change what he will be
looking at while he is trying to confirm the previous build — sequence that with him before landing
them.

---

# TERMINAL: WRITE FINDINGS BELOW THIS LINE

(What you built, what you found wrong in this spec, what you deployed, what remains. This section is
the return channel — the project-manager chat reads it back.)

---

## ITEM 1 — DONE IN THE WORKING TREE. NOT PUSHED, NOT DEPLOYED, NOT VERIFIED.

**Terminal session 2026-08-28. Item 1 only. Items 2-5 untouched, exactly as instructed.**

### WHAT CHANGED — four files, all uncommitted

1. **`_shared/state-trend/assemble.ts`** — `buildAllTimeBestByLift` no longer calls
   `intentCanMintAMax`. One `continue` removed. **`estimateIsTrusted` (D-417, the rep ceiling) is
   untouched and still applied**, as instructed. The doc block above the function now states the
   line/record split as the reason and warns against "restoring consistency" by re-adding it.
2. **`assemble.ts`, `intentCanMintAMax`'s own doc** — ⛔ **the false field-consensus claim is
   corrected.** It asserted Strong, Hevy and Boostcamp all separate heavy from light on their charts.
   They do not. Replaced with the honest argument the handoff already had and the code did not: a
   Strong user's light day is INCIDENTAL, Michael's is prescribed, and systematic-not-noise is what
   makes it worth excluding **from a direction read only**.
3. **`_shared/state-trend/heavy-only-gate.test.ts`** — the test that pinned the gated record is
   **rewritten, not deleted**, so the same-day reversal stays visible in the file. It now asserts the
   DE set DOES set the record, and a second fixture pins **the trap bar deadlift with no stamp at all
   (three rows: absent, `null`, `''`)** producing `best: 225, count: 3` — that is the live regression
   kept as a permanent case. A new test pins that ungating the intent did NOT ungate the reps.
4. **`_shared/state-trend/strength-trust-gate.test.ts`** — its header claimed every row must carry
   `ME` "or the assertions pass on nothing"; that is now true of the SERIES tests only, and the
   stamps on the RECORD fixtures are marked inert. The fail-open-on-unknown-reps record test had its
   `ME` stamps **removed**, so it can no longer start passing for the wrong reason if the intent gate
   is ever re-added here. The "record can never exceed the top of the gated SERIES" test was renamed
   and re-scoped to the REP-trusted series — the old invariant is no longer true in general.
5. **`compute-snapshot/index.ts`** — `slot_intent` is still SELECTed on the all-history query and the
   comment saying "the record gates on it too" is corrected. Kept in the select deliberately so the
   two queries stay one shape; `best_reps` is the load-bearing one.

### VERIFIED BY FIXTURE, NOT BY PROD

- `state-trend` suite whole: **252 passed, 0 failed** (`deno test --no-check`, `~/.deno/bin/deno`).
- Targeted run of the five strength/PR files: **42 passed, 0 failed**.
- ⚠️ `deno check` on `assemble.ts` reports 32 type errors — **pre-existing.** Confirmed by checking
  the file as it stands at `HEAD`: identical errors, same `bike.lead` root. Not from this change.

### ⚠️ `isPr` READS SANELY, AND THE CONSEQUENCE IS NOT NEUTRAL — say this to him before Monday

The rule is unchanged: `latest >= allTimeBest - 0.5` with `allTimeCount >= 3`. But **the two sides
now read different populations on purpose** — `latest` comes off the heavy-only LINE, `allTimeBest`
off all history. So a PR means *the fresh line beat everything he has ever logged*, which is the
strict, honest reading of his own *"a PR should be a real PR, basically a new 1RM."*

- **Before this fix it was worse, not better:** with the record gated, a lift with no `ME` history
  had `allTimeBest = null`, so **`isPr` could never fire at all.** Ungating restores the badge.
- ⛔ **WHAT HE WILL SEE CHANGE ON SCREEN:** the "best" tile is drawn only when the record sits ABOVE
  the latest reading (`StatePerformanceSection.tsx:684`). His old unstamped lifts are back in the
  record, so **a "best" number he has not beaten yet will reappear beside the fresh line.** That is
  correct and it is the point of the record — but it is a visible change on a screen he is about to
  use to confirm Monday's rebuild, and it will read as the old history coming back if nobody says so.

### ⛔ FINDING — ITEM 1 FIXES THE BUILDER, AND THE LIFTS IT WAS FIXED FOR STILL SHOW NOTHING

**This spec's stated "why" is only half-closed by Item 1, and the second half is not in Item 1's
scope.** Proved with a fixture through the real assembly, not by reading:

```
RECORDS BUILT:  bench_press {best:152,count:2}   front_squat {best:195,count:3}
PER-LIFT ROWS:  bench_press only — front_squat is absent entirely
```

`buildAllTimeBestByLift` now correctly mints a record for the unstamped front squat. **It reaches no
screen.** The per-lift contract is built by iterating the intent-gated SERIES, so a lift with no `ME`
history has no row for its record to attach to. The record exists in the payload's source and stops.

⚠️ So the front squat / trap bar / curl case named in this item's justification is **unblocked, not
delivered.** Delivering it is **Item 4** (derive heavy from the set, which gives those lifts a series)
or **Item 5** (records-and-best-sets as their own read, which needs no series). ⛔ Do not close the
"secondaries and accessories can't set a record" complaint on Item 1 alone.

⚠️ **AND ITEM 5'S RENDER RULING (2026-08-28) ALREADY ANSWERS THE OBVIOUS WRONG FIX.** Nothing above
is an argument for giving those lifts a card or a row on State. **No picker, no lift selector on the
State screen** — the record hangs on the lift itself, in the logged-sets history that is already
there. Read Item 5 before acting on this finding. **Not built, and not to be built yet.**

### STATE, THE THREE WAYS

| | |
|---|---|
| **PUSHED** | ⛔ **NO.** Four files modified in the working tree, uncommitted. `origin/main == f830444b`, unchanged. |
| **DEPLOYED** | ⛔ **NO.** `compute-snapshot` is touched, so this needs a deploy AND a snapshot run to reach a screen. Nothing was deployed — and the handoff's own instruction stands: **the 2026-08-28 deploy is already ahead of him; do not deploy before he rebuilds Monday.** |
| **VERIFIED** | Fixtures only. No human has seen a record render. |

⚠️ **ONE THING IN THE TREE THAT IS NOT MINE:** `docs/OPEN-QUESTIONS-2.md` carries 34 uncommitted
added lines from before this session. Left alone. Whoever commits Item 1 should not sweep it in.

---

## ITEMS 2 AND 3 — DONE IN THE WORKING TREE. NOT PUSHED, NOT DEPLOYED, NOT VERIFIED.

**Terminal session 2026-08-28. Items 2 and 3 only. Items 4 and 5 untouched, as instructed.**

### ⛔⛔ FIRST — THIS SPEC NAMED THE WRONG CALL SITES, AND THE CORRECTION IS THE FINDING

Item 2 locates the defect at `run.ts:85` and `run.ts:110` and calls them *"exactly two call sites."*
They are real and they are fixed. **They are not what was on Michael's screen.**

`efficiencyIndexToSeries` and `recentEfficiencyPaceHr` feed the **FALLBACK** verdict. On any athlete
with enough runs to fit a regression — this one has 127 — `runRoute` **OVERRIDES** verdict and
pctChange (D-346, `assemble.ts`), and **the route pool has always read every run: no duration window,
no session-type gate, `intent: null` on every row so its own blocklist never fired.**

⛔ **SO THE POOLING WAS NEVER THE CEILING. It was the route fit, and there was no exclusion there to
remove — only an absence of grouping.** Fixing only the two named functions would have changed
nothing the athlete sees. Measured, on a fixture of 12 improving easy runs plus 10 hard sessions:

```
POOLED (what shipped) : direction still_learning · pct −0.7 · ci [−7.8, +6.4] · 22 points
GROUPED (now)         : direction improving      · pct +6.9 · ci [+6.6, +7.2] · 12 points
```

⚠️ **That is the "23 runs cannot call a direction" complaint, reproduced in a fixture.** It was never
only a sample-size problem — pooling hard sessions into an easy-run regression widened the interval
until it straddled zero.

### ⛔ AND A SECOND STARVED READER, FOUND ON THE WAY

There are **two** `workout_type` fields on a run and the spine was joining the poor one.

- `workout_analysis.heart_rate_summary.workoutType` — collapses everything to **three words**
  (`intervals`, `hill_repeats`, `steady_state`) via `mapClassifiedTypeToHrWorkoutType`. A tempo, a
  threshold run, a race and a two-hour long run **all read `steady_state`.**
- `run_facts.workout_type` — `classifyRunIntent`'s, written off the attached plan since 2026-07-30.

⛔ **The second has never reached a reader.** It was written to fix the steady gate and the join was
never moved — which is why the comments around that row say the field *"reads `steady_state` on every
run ever logged."* **The classifier was not missing. It was starved**, and item 2's grouping would
have had nothing to group on. `compute-snapshot` now prefers it and falls back to the analyser's.

⚠️ **Consequence for item 2's own premise:** `isSteadyAerobic` was binning far less than the spec
says. Tempo, threshold and race runs read `steady_state`, so they were never excluded — only
intervals and hills were. The exclusion was real but smaller than stated.

### WHAT CHANGED

**Item 2 — run efficiency reads every run.**
1. `run.ts` — the 30–70 minute window is **gone from both functions, at both ends.** Q-295 closed.
2. `run.ts` — new `runSessionGroup()`: **easy / long / quality.** Exclusion replaced with grouping;
   both functions take a group, defaulting to `easy`. **The `long` group is the marathon fix** and it
   is the SAME mechanism, not a second one — *"a long run drifts more"* is true and is a reason to
   compare long runs to long runs.
   ⛔ **Derived from the session's own word, never from a minutes threshold.** A duration cutoff is
   what this item deleted; re-adding one as a grouping key smuggles it back. Precedent already in the
   app: `isLongRunLike` (`session-detail/race-readiness-llm.ts`) reads the name, not the clock.
3. `compute-facts.classifyRunIntent` — now emits `long` as its own word (it collapsed into `easy`,
   harmless only while the ceiling meant long runs never reached the metric). `lsd` added to the
   steady vocabulary. The mirror classifier in `run-intent.test.ts` moved with it, as its own header
   demands.
4. `assemble.ts` — **the route fit is partitioned by group and the headline is the EASY group.**
   Every other reader of that pool moved with it (the age stamp, the median-of-5 pace receipt, the
   chart), because chart-and-verdict-on-different-data is this row's signature failure.
   ⚠️ **Grouping is done by partitioning at the caller, NOT by feeding `intent` into `routeTrend`** —
   that function's `isComparableIntent` is a **blocklist that deletes** intervals, tempo and races.
   Handing it the real session type would have switched exclusion back on under a new name.
5. `runFitness.efficiency.groups` — every group carried with its own count, direction and series. **A
   group too thin to fit still appears, with a real count and a null direction.** Nothing is deleted.
6. Copy: the row now reads *"Reading N **easy** runs"*. The count is the headline group's, which is
   the honest recount this item asked for.

**Item 3 — the endurance read renders without a plan.**
7. `compute-snapshot` — the facts map and the key-session set are **hoisted out of the `weekByDate`
   branch.** A block week map was a precondition for reading a heart rate.
8. New `enduranceSpine`: **every completed run and ride, grouped by session type, dates not block
   weeks, no `planned_id`, no family tag, no week map.** ⛔ No day-of-week + duration fallback, as
   ruled. `namedSessions` is untouched and becomes the overlay.
9. `StrengthReadCards.tsx` / `StateTab.tsx` — the spine **renders, and renders first.** The section's
   visibility test no longer requires a plan-linked series.
10. `COACH_PAYLOAD_VERSION` 173 → 174. Added fields, so a cached row simply lacks them.

**The fade rule, as ruled — decided on what the session WAS.**
11. A spine point carries `fadeWithheld`. `decoupling_mixed_effort` is the **switch**: a session that
    was not steady gets **no fade figure**, and still feeds the efficiency trend. ⚠️ Not a second
    steadiness test and not a contradiction of D-283 — that says don't delete a steady run for being
    low-confidence; this says don't print a fade number for a session that wasn't steady.
    ⛔ **The card SAYS SO** — *"no fade number — this session changed pace on purpose."* Rendered as a
    blank it reads as broken data and the athlete concludes the app lost their run.

### VERIFIED BY FIXTURE, NOT ON A DEVICE

- **`_shared` suite whole: 2354 passed, 0 failed.**
- New permanent regressions in `run-grouping-spine.test.ts`, asserted **through `assembleStateTrends`
  and `toStateTrendsV1`, not through helpers** — the display map has silently dropped an upstream
  field three times in this file. It caught one on the way: the spine reached `display`, and my first
  assertion read `v1.run`.
- The three fixtures that pinned the removed gates were **rewritten, not deleted**, so the reversal
  stays visible.
- Client `npm run build` passes. ESLint on the three touched components: **31 problems before this
  change and 31 after** — none added.
- ⚠️ `deno check` on `compute-snapshot` reports 3 errors, **all pre-existing** (`bike.lead`, the
  `GenericStringError` cast at :375, `newestRideAgeDays` at :817). None in this diff.

### ⚠️ WHAT IS NOT DONE, AND WHERE IT IS THIN

1. ⛔ **`efficiency.groups` is emitted and NOT rendered.** The long-run and quality trends reach the
   payload; only the easy headline and the spine cards are drawn. Deliberate — the run row's layout
   was not in scope — **but do not report the long-run trend as visible.**
2. ⛔ **The `long` word is FORWARD-ONLY.** Rows written before today say `easy` on long runs, so the
   long group fills as sessions are re-computed. Thin at first, never wrong.
3. **Rides get one group (`all`).** The bike has no session-type classifier and inventing one here
   would grow the second vocabulary this codebase keeps growing. Named, not solved.
4. **The unclassified run groups as `easy`** (blocklist philosophy, matching `isComparableIntent`).
   The alternative — an "unknown" fourth group — splits a mostly-unlabelled history into pools too
   thin to trend. Stated because it is a judgement call, not a derivation.
5. **Q-290 is untouched**, so the run still has no reference series. Item 2 point 5 stays blocked.
6. **The two 5% figures are still not reconciled on one screen.** The spine card states p107's line
   beside drift, same as the overlay; Friel's durability band lives on the run row above. They do not
   currently appear together, so nothing states both as one thing — **but this was not solved, only
   not-yet-broken.**

### STATE, THE THREE WAYS

| | |
|---|---|
| **PUSHED** | ⛔ **NO.** Working tree only. `origin/main == 40e371c3` (item 1), unchanged. |
| **DEPLOYED** | ⛔ **NO.** ⚠️ `_shared/state-trend/run.ts` and `assemble.ts` are SHARED — the deploy trap. Touched functions plus every importer of the changed shared files must go together, and the client is a Netlify build, separate again. |
| **VERIFIED** | ⛔ **NO.** No human has seen a spine card render. |
