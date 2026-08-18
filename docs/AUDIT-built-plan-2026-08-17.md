# WORK ORDER — repair the built plan (2026-08-17)

**What happened.** Michael built a real Strong Focus plan on current, deployed code and read the
export end to end. It fails review. Every mechanism test is green (465/0) because the fixtures
read fields; nothing reads the assembled plan the way the athlete does. This document is the
repair order.

**The athlete config that produced it** (build every verification fixture from this):
run 3d maintain · bike 2d maintain · strength develop · long run Sunday · long ride Saturday ·
hard days: Friday run + Tuesday ride, both prescribed · pullup progression on ·
focus chest/glutes/abs · 15 mi/wk · 3 h/wk ride · maxes on file.

**The model the plan must match** — all decided, all in the parent docs; none of this is open:
- Three lifting days: Squat · Bench · Deadlift + Press (§1f-0).
- Hard endurance days are ENERGY SYSTEMS (§7): the VO2 day (4×3 uphill run / 4×4 ride) and the
  threshold day (4×5 → 3×7 → 2×10 wave). 1 day → VO2 · 2 days → one of each · club → threshold.
- The scheduling laws hold: heavy lower lifts 48h from the long run and from each other; a test
  week is measured rested.
- Copy is fact-first, stated once, and never promises what §6 has not built.

**Verification.** Fixtures from the config above. The acceptance test is GENERATING the plan and
READING it as a document. Michael does not test intermediate states; he reads one finished plan.

---

## The defects, in fix order

### 0. The 48h long-run law is breached ⛔ LAW
Monday's Back Squat sits 24h after Sunday's long run, with a compromise line disclosing it. The
48h clearance between a heavy lower lift and the long run is pinned law
(`easy-session-spread.test.ts`), and this week shape — two hard days Fri+Tue, long ride Sat, long
run Sun — is evidently outside the fixtures. Breach-and-disclose is not acceptable for this pair:
the engine drops or moves a LESSER session and says so. Find what lets the breach be bought
(suspect: the two-hard-day work crowding the week until `breachPenalty` is outbid, or a path that
bypasses the prune), fix it, and add this exact week shape to the law's fixture.

### 1. Week 1 has no exercise rows ⛔ BLOCKS TRAINING
Weeks 2–12 export full exercise blocks; week 1 exports descriptions only — nothing to log in the
week the athlete is in. The export (`AllPlansInterface.tsx:1816`) reads `computed.steps` then
`strength_exercises`; week 1 comes from materialized `planned_workouts` rows, later weeks from
plan JSON. Determine whether week 1's rows lack the fields (materializer bug) or carry them under
names the export does not read (export bug). Fix at the source. The same rows price the threshold
ride at 43m where every later week prices the identical session at 24m — one clock must win, and
one cause may explain both.

### 2. The run's hard day speaks the old vocabulary
The session is named "Hill Repeats" and the wizard frames the day as a terrain menu. That is the
maintenance-dose era. The day is the VO2 DAY (§7): named for what it builds, 4×3 uphill as its
prescription, terrain surviving as a detail inside it (the hill/treadmill/flat variants exist).
The run's threshold day matches the ride's naming ("Threshold Run" beside "Threshold Ride"). The
offer follows the role; the role comes from §7's assignment. Nothing here needs a new decision.

### 3. The descriptions are boilerplate walls
The same sentences — assistance load-by-feel, the chins programme, the 50-in-10 standard, the FSL
explanation — print on every strength session, every week: ~36 times each. The rule: a sentence
true every week moves to the plan header, once. A session keeps only what is its own — this day's
sets, this day's grip, this week's step in the wave, this day's sharing note. Cut duplication,
never information: every fact still exists exactly once.

### 4. The paired-day note is doubled and names itself
Verbatim: *"…Deadlift + Overhead Press goes first and Overhead Press follows…"* — the merged
SESSION name used as a lift name, in a second sentence restating the first. Two writers
(`pairNoteFor` and the merge's order sentence, which reads `ordered[0].name` after the title
rewrite). One note, one writer, naming the lift: deadlift first, press follows fatigued.

### 5. The week-cost paragraph is garbled
The back-to-back sentence prints twice with different day pairs; weekday names print lowercase;
and "You asked for 2 ride days; the week had room for 1" is false on a calendar showing two rides
— if the line means easy rides it says easy rides, and it counts what the athlete sees. The
24h-squat disclosure itself is honest behaviour; #0 removes its cause, the casing gets fixed
regardless.

### 6. The saved goal still speaks four-day
The goal's stored prefs read "Strength Frequency: 4×/week" and strength days
"monday, tuesday, thursday, thursday". Something on the goal-write path still derives from the
four-lift list. Fix the writer; check whether the stored value feeds anything beyond display.

### 7. Sentence lint
Grip fragments ("overhand this day.") fold into the chins line. No lowercase weekdays anywhere
copy interpolates a day. No raw tokens in athlete-facing text (week 1 prints
"(Bike Threshold 5min)").

---

## The missing test class

One fixture that renders a full session description and the week-cost paragraph AS STRINGS and
asserts: no sentence appears twice, no lowercase weekday, no token text. This is the gap that let
every mechanism pass while the document failed.

## Done means

The plan generated from the config above, read start to finish: week 1 logs like every other
week; the squat is never within 48h of the long run; the hard days are named by energy system;
each session's description is a few lines that are all about that session; the paired day states
its order once; the cost paragraph states only true things; one clock per session; the goal
speaks three-day. Suites hold `72c0126b`'s baseline except fixtures that pinned the doubled or
boilerplate copy — those move with it, none weakened.
