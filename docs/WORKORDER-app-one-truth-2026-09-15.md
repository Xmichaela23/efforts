# WORKORDER — the whole app on one truth (2026-09-15)

**What this is:** the final clean-up of every number Efforts shows, on every screen. It is run from a fresh
project-manager chat that hands ONE stage at a time to a terminal session, reviews the report, and brings
Michael the decisions. Every terminal updates the status table at the bottom when its stage lands.

**How it started:** a Home-screen colour tweak on 2026-09-13/14 turned into a day of finding numbers on the
workout screens that disagreed with each other (one ride showing three different "average powers"; run reps
cut in the wrong places; a threshold nobody could trace). Each fix exposed the next. Michael, 2026-09-15:
*"I want to hit all of this properly and correctly and once and for all put to rest these screens, their
contradictions and their wrong approach … this needs to be the entire app."*

---

## 1. The standard (every stage is judged against this)

1. **One source of truth per number.** A number is worked out in exactly one place. Every screen that shows
   it reads that one value.
2. **The server does the maths. The phone only displays.** No rounding rules, averages, thresholds, ranges,
   colours-by-rule or fallbacks worked out on the phone.
3. **Every formula has a source:** the book (`docs/SOURCE-viada-hybrid-athlete.md`, cite the page) or
   commercial practice (TrainingPeaks, Garmin, Strava, COROS, Runna, TrainerRoad — cite the page read). Where
   neither exists, the number is marked `// OURS — <reason>` in code AND has a row in `docs/STATE-SOURCES.md`.
4. **Commercial practice is the default** where the book is silent (Michael, 2026-09-14: *"I just want this
   to be the same as commercial apps"*). The PM chooses the standard, cites it, and tells Michael what was
   chosen — it does not bounce every silent detail back to him.
5. **Guided by the data, not by Michael's numbers.** Rules are written for any athlete and tested on
   throwaway accounts with data from more than one source (Garmin and Strava shapes at minimum). Nothing is
   tuned to his runs or to a number another app shows him.
6. **Plain on screen.** Every athlete-facing line goes to Michael word for word before it ships. No idioms,
   no imperatives, no "the book's".

---

## 2. Already done — do not redo (verify only if a stage depends on it)

All pushed and deployed 2026-09-14/15. Phone checks are partial; see §7.

| Area | What is now true | Commits |
|---|---|---|
| Ride power | `_shared/ride-power.ts`: coasting = 0 W; judged number = normalized power for ≥20 min, else average; on target = inside range, no allowance; one "Power" line in watts | b568fcb8, 59c920e2 |
| Easy/long ride targets | Coggan endurance zone 56–75% FTP from `_shared/state-trend/zones.ts`, same band State reads | 035ad6cf |
| Effort / talk test | `_shared/effort-words.ts`: talk test only for easy + long runs (p211, p235); Foster RPE words; Effort and Talk test rows; ride + long-run plan lines lost non-book talk wording | 1cb27d2e |
| Run pace | One set of run pace rules: stops out everywhere, one grade-adjusted pace (grade over 100 m, Smyth & Muniz-Pumares 2020), work reps coloured strictly on real pace, one drift verdict; no grade-adjusted pace on rows under 400 m (OURS) | 227bc986, 4dd43ef7, c4205df7 |
| Threshold from runs | Critical speed from best 400 m–5 km efforts over 16 weeks, grade-adjusted, ≥2 runs; a suggestion to accept (Adjust / post-run popup / checkpoint) | 4a24e89b, 859ff3ea |
| Laps | Watch laps are the rows when a structured run's laps don't match the plan; Strava laps placed by start time + length, numbered by the watch's lap number; red "contract missing" box fixed | 6f3d7c19, 25b82848, d6e90485, 44a1ab79 |
| .fit reading | km/h speed and moving seconds kept; laps read (landed with the laps work despite the park) | 3d068550, f0045665 |
| Unattach | Stays unattached through recalculation; plan context reads the one moving time; unattached Performance cleaned (next session, lap names, Next padding) | 445554a8, 5137b3ee |

Also: a read-only Intervals.icu probe function exists (495069a5).

---

## 3. Scope — the whole app

**Already mapped:** Performance, Details, State — `docs/TRUTH-MAP.md` §6 (audit 2026-09-15), with flags.
Its line locations came from searches and some items say "possibly"; Stage 1 re-reads them.

**Not yet mapped (Stage 0):** Home / Today · the Week calendar · the strength logger (incl. finish sheet) ·
plan setup and the plan builder · the plan screens (weekly planned, plan detail) · Adjust · My Record ·
Focus / goals · the post-workout popup · session drawers · notifications and checkpoints · shared and
exported numbers (share text, data export).

**Parked — not in this work order (new data sources, not screens):** Apple Watch integration · phone
recording (fails on a missing `execution_context` column) · the Intervals.icu activity import (decisions and
approved wording saved by the terminal) · the rest of the .fit upload. When built, they follow §1 and the
guard (Stage 6) enforces it.

**Running separately:** "Let a threshold test go on today and to the watch" (its own session).

---

## 3a. Scope ruling (Michael, 2026-09-15, after Stage 1)

**The north star is the standing-plan path:** anchors → composer → the week → the screens → logging → learning →
checkpoint. The three plans on offer (Run + Strength · Ride + Strength · Run + Ride + Strength) are the blueprint;
every later plan adopted from the book is a new frame in the composer plus its copy, and inherits this path. The
book (`docs/SOURCE-viada-hybrid-athlete.md`) is the source; commercial practice fills its silences; anything else is
marked ours. No bad maths, no competing data, anywhere on that path.

**Scope is still the whole app.** Every screen and every item in `TRUTH-MAP.md` §8.0 is in, in this order:
the standing-plan path first, then the rest of the screens, then the metric labels.

**Parked (silent until reopened):** the race plan path and the season wizard — §8.0 items 28, 33, 34, 37, 38, 39, 40
and the race-projection question in Stage 2. They are recorded with file and line and wait.

## 4. Stages — one terminal session each, in this order

Every stage: **trace → report → Michael's go → build → throwaway-account check → commit exact files → deploy
(list every importer of a changed `_shared` file) → recalculate if stored numbers change → update §8.**

### Stage 0 — finish the map
Same audit as `TRUTH-MAP.md` §6 for every screen in §3 "not yet mapped". One table per screen: screen label ·
data source · formula · book/commercial source or OURS · server file that computes it · which screens show
it. Flag: computed on the phone · computed in two places · no source · sources ledger disagrees with code.
**Docs only.** Report flags.

### Stage 1 — verify the flags
Re-open every flagged `file:line` from §6 and Stage 0. Confirm, correct or strike each flag. No flag reaches
a build stage unverified.

### Stage 2 — book and commercial questions, settled up front
Resolve before any fix touches them, from the page / the commercial source, reported to Michael as findings:
- A lift's three numbers (Adjust capacity, estimated max, training max) — are they meant to differ?
- Race projection — produced in three places; which is the real one; VDOT tables (Daniels) cited.
- Easy pace: one range from accepted threshold (Friel run Zone 2, 114–129%; plan already approved on
  2026-09-14, on hold) — folds into Stage 3.
- Any other "is this intentional" flag from Stage 1.

### Stage 3 — two places that disagree
One number at a time, each ending with one server calculation read by every screen. Start with what shows on
every workout: (1) Execution score (two different numbers saved under one name) · (2) average pace / moving
time / distance written by two steps · (3) average heart rate and grade-adjusted pace sources · (4) ride
efficiency = normalized power ÷ average heart rate (TrainingPeaks) · (5) one drift line (5% written in four
places) · (6) FTP lookup · (7) easy pace (the approved range plan) · then the rest of §6/Stage 0's list
(race projection, form rounding, max-speed cut-off, RPE field, swim distance/pace unit).

### Stage 4 — maths off the phone
Move every phone calculation to the server, screen by screen: Adjust (all of it), State, Details, Performance,
then Stage 0's finds. Quick fixes that ride along: pace printing "x:60"; metric accounts labelling pound
values as kg.

### Stage 5 — every number sourced
For each number with no source: cite the book page or the commercial standard, or mark OURS with a ledger
row. Fix the ledger/code disagreements (removed State rows still showing; 84 days vs 52 weeks; rep limit 10 vs
comment).

### Stage 6 — the guard
Extend `docs/DESIGN-D237-lint-guard.md` to this standard and build it (after Michael approves the design): the
build fails when (a) a screen component computes a displayed number instead of rendering a server field,
(b) a numeric constant in a load-bearing module has neither a source citation nor an OURS marker, or (c) the
same derived field is written by two server steps.

### Stage 7 — final pass
One throwaway account per source (Garmin shape, Strava shape) with a plan: open every screen and confirm
each number equals the one server value, same on every screen. Report a table: number × screen × holds/breaks.

---

## 5. Rules for every terminal

- Read `CLAUDE.md`, this file, and `docs/TRUTH-MAP.md` §6–§9 first.
- **Fix what is there. Never build beside it (Michael, 2026-09-15: "a new feature, a new math, a whole new thing, as
  opposed to fixing what was there" is how the mess started).** The report names the existing function, file and line
  that already does the job and the one change it needs. The diff is edits and deletions. A new exported function,
  file, table column or screen is refused unless the report says why the existing one cannot be changed and the PM
  has agreed before the build. Two places become one by deleting one, never by adding a third that reads both. The PM
  reviews the diff, not only the report.
- **Trace before build.** Name what you searched; no "it doesn't exist" without the search.
- **Plan before code.** Report, then wait for Michael's word **go**.
- **Commit exact files. Never `git commit -a`** — other terminals share the tree.
- **The `_shared` deploy trap:** redeploy every function that imports a changed shared file; list them first.
- **Every athlete-facing line** goes to Michael word for word first.
- **Test on throwaway accounts**, created and deleted by script, with more than one data source. Never write
  to Michael's data by hand; read-only reads of his account only with his go-ahead.
- **Do not tune** to Michael's runs or to a number another app shows.
- **Talk plain:** what he would see, no function names unless asked, no idioms.
- **Report state precisely:** pushed · deployed · recalculated · checked on a phone.

---

## 6. Rules for the PM chat

- Hold this file as the plan. Hand out one stage per terminal session. Review each report against §1 before
  it reaches Michael.
- Where the book is silent, choose the commercial standard and say what was chosen; bring Michael only
  wording, real forks, and anything that changes what he sees.
- Keep answers short and plain. Say something once.

---

## 7. Unverified on a phone (as of 2026-09-15)

- Ride power line and segment row (Sunday 13 Sep ride).
- Run pace rows, colours, grade-adjusted pace "—" under 400 m.
- Talk test question (needs a planned easy or long run).
- Threshold suggestion "use 9:35" on Adjust — shown on the phone? accepted?
- Laps rows on 28 May, 24/28 Aug, 31 Aug, 2/7/14 Sep.
- From the 2026-09-13 banner: Run + Strength and Ride + Strength setups (checklist in POLISH-PUNCH-LIST).

---

## 8. Status (each stage updates its row)

| Stage | State | Date | Notes |
|---|---|---|---|
| 0 Finish the map | done — awaiting review | 2026-09-15 | `docs/TRUTH-MAP.md` §7: 514 rows over 7 screen groups; flags TWO 91 · PHONE 123 · NO-SRC 109 · LEDGER≠CODE 10; §7.0 lists two §6 citation errors; §7.9 = 8 rows re-read from code. Docs only, nothing committed. |
| 1 Verify the flags | done — awaiting review | 2026-09-15 | `docs/TRUTH-MAP.md` §8: 481 flag lines re-opened — confirmed 308 · corrected 88 · struck 85 · unverified 4. §8.0 = 42 rank-A items (wrong or contradicting number visible today), grouped: unit/label 6 · metric-only 6 · two-screens 22 · data lost 4 · setup 2 · State 2. Docs only, nothing committed. |
| 2 Book/commercial questions | accepted | 2026-09-15 | `docs/TRUTH-MAP.md` §9: five rulings (lift numbers · easy pace range 1.14–1.29 · provider avg HR · EF = NP ÷ whole-ride avg HR 2 dp · tested max nearest 5, athlete's Keep honoured). Three forks with recommendations. Q2 changes three athlete-facing lines (printed in §9). Race projection parked (§3a). Docs only, nothing committed. |
| 3 Two places that disagree | session 1 done: items 1, 2, 3 (item 4 no build) | 2026-09-15 | (1) Average heart rate = provider first, sample mean fallback; one resolver for Details, Performance, Today, ride facts (3c35dbac, D-477). (2) Ride efficiency factor = judged power ÷ whole-ride average HR, 2 dp, analyser writes, compute-facts copies (13e005f4). (3) Tested max nearest 5; result card uses the save's set pick, reads updated/kept off the file, last test = previous test session; "new baseline" struck (5e2c6416). (4) Lift number on file: both readers already share the rep ceiling; TRUTH-MAP §7.5 row 1b struck to C; ledger row written. Rule 7 on ride power: the device's normalized power first, ours as fallback (7c49f21c; deployed compute-workout-analysis, analyze-cycling-workout, compute-facts, compute-workout-summary). Deployed; throwaway Garmin + Strava accounts, 3 runs each round, all checks pass. Recalculated: 306 sessions on Michael's account (170 runs, 99 rides, 35 swims, 2 walks) + snapshot; every stored run/ride heart rate = provider, every ride efficiency factor matches between analysis and facts. No stored test cards existed. Not pushed (Today and the test card need the phone bundle). Not phone-checked. <br>**Session 2 done (2026-09-15): easy pace is one range** — threshold × 1.14 to × 1.29 (Friel Z2) on Adjust, Baselines, the plan's easy steps (heart-rate range first, the range as ref pace, not ±6%), the endurance library easy target and the run summary's easy-portion line; × 1.19 and its uncalled bound helpers deleted; easy off the plan pin (a pinned plan's range follows its pinned threshold); time-trial check, adaptation easy gate, long-run miles and VT1 fraction read the learner's measured value; race path / season wizard take the midpoint unedited (76c75ee4, D-478, D-462 annotated, ledger row rewritten). Deployed all 36 importers (one at a time after a Supabase maintenance 503/504). Throwaway: Garmin + Strava × accepted threshold / none — ranges 9:07–10:19 built and after re-materialize, empty with no threshold, a planted pin (7:30 threshold, 11:40 easy) gives 8:33–9:41, all pass. Not exercised live: the run summary's easy-portion line (needs a run with a finish segment) and the adaptation gate's pace branch (the heart-rate branch answered first). Not recalculated (no stored number on Michael's account changes until his plan re-materializes). Not pushed. Not phone-checked. |
| 4 Maths off the phone | not started | | |
| 5 Every number sourced | not started | | |
| 6 The guard | not started | | |
| 7 Final pass | not started | | |
