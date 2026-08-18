# AUDIT — the built plan read as one document (2026-08-17)

**Michael exported his real Strong Focus plan and read it end to end. Verdict: "a clown car."**
He is right, and the lesson is the forever-block-map lesson at the next level up: **465 tests
green, every mechanism pinned, and the assembled document fails review** — because every fixture
reads fields and no test reads the plan the way the athlete does.

**The source document:** the athlete-facing export of the live plan (goal prefs: run 3d maintain +
bike 2d maintain + strength develop, long run Sun, long ride Sat, hard days Fri run + Tue ride,
pullup progression on, focus chest/glutes/abs). Every defect below was observed in that real
export, not hypothesized.

⚠️ **THE MIXED-BUILD THEORY IS DEAD (2026-08-17, late).** Michael confirmed the export came off a
REFRESHED client. Everything below is current code. (The goal row may still carry old-wizard
values — #6 — but nothing else gets blamed on staleness.)

⛔ **MICHAEL IS DONE TESTING. Verify with fixtures built from HIS EXACT CONFIG (the prefs block on
the export: run 3d maintain, bike 2d maintain, strength develop, long run Sun, long ride Sat, hard
days Fri run + Tue ride, pullup progression on, focus chest/glutes/abs, 15 mi, 3h ride). The
acceptance test is READING the generated plan as a document. He gets one finished plan, not QA
rounds.**

⛔ **FIX IN THIS ORDER. #0 is a broken LAW; #1 blocks training; the rest make the plan unreadable
or untrustworthy.**

---

## 0. THE 48H LONG-RUN LAW IS BREACHED ⛔ REGRESSION AGAINST THE OLDEST RULE

Observed: **Monday's Back Squat, 24h after Sunday's long run**, with a compromise line disclosing
it. The 48h clearance between a heavy lower lift and the long run is a law the fixtures pin
(`easy-session-spread.test.ts` "a LOWER lift keeps its 48h from the long run") — and this week
shape (two hard days Fri+Tue, long ride Sat, long run Sun) evidently is not covered by them. The
two-hard-day work (slices 6–8) crowded the week until the solver bought a breach and apologised.

**A breach-and-disclose is NOT acceptable for this pair.** The old behaviour refused or found
another shape. Find which change let `breachPenalty` be outbid (or which path bypasses the prune),
fix it, and add HIS week shape to the law's fixture so it cannot re-open. If the week genuinely
cannot hold everything, the engine drops or moves a LESSER session and says so — it does not put a
squat the morning after the long run.

---

## 1. WEEK 1 HAS NO EXERCISE ROWS — the current week is not loggable ⛔ TRAINING-BLOCKING

Weeks 2–12 carry full `**Exercises:**` blocks (warmups, work sets, FSL, assistance with totals).
Week 1 — the week the athlete is IN — has descriptions only. Nothing to log.

**Where to look, traced:** the export (`AllPlansInterface.tsx:1816`) reads
`w.computed?.steps` (strength kind) `|| w.strength_exercises`. Weeks come from week-scoped
`planned_workouts` when materialized (`:632-657`), falling back to `plans.sessions_by_week`.
So week 1's MATERIALIZED rows are missing their strength steps/exercises while the unmaterialized
weeks render fine from the plan JSON. Suspect `materialize-plan` (it was changed today for the
`run_thr_*` token) or the on-demand week-1 materialization path. **Find whether week 1's
`planned_workouts` rows have `computed.steps` / `strength_exercises` at all — if they do, the bug
is the export's field priority; if they don't, it is the materializer.** Fix at the source, not in
the export.

Also observable on the same rows: week 1's threshold ride says 43m where every later week prices
the same 4×5 session at 24m (defect #5) — consistent with week 1 coming off a different, older
path. One cause may explain both.

## 2. THE DESCRIPTIONS ARE BOILERPLATE WALLS — say it once, not 36 times

Every strength session, every week, carries the same concatenated sentences: the assistance
load-by-feel note + the 100-chins note + the 50-in-10 note + the grip + the FSL explanation + the
sharing note. A 12-week plan prints each ~36 times. The athlete reads a paragraph of boilerplate to
find the one line that is about TODAY.

**The rule: a sentence that is true every week belongs in the plan header (once), not in every
session.** A session's description carries only what is specific to it: the day's sets summary,
the grip for THIS day, what changed this week in the wave, and this day's sharing/order note.
- The chins programme (100/wk, 50-in-10 standard, split guidance) → header. The session keeps
  "chins 33 — underhand today."
- The FSL explanation → header once. The session keeps "First Set Last — 5×5 @ 55."
- The assistance load-by-feel rule → header once.
- ⚠️ Cut duplication, not information. Every fact must still exist exactly once.

## 3. THE PAIRED-DAY NOTE IS GARBLED AND DOUBLED

Observed, verbatim: *"Shares the day with Overhead Press, and goes first — the second lift of a
session is done fatigued, so it gives up load and reps. **Deadlift + Overhead Press goes first and
Overhead Press follows on the same day.** The second lift of a session is trained fatigued, so it
gives up load and reps. 5/3/1 adds weight…"*

Two writers say the same thing, and the second uses the MERGED SESSION NAME as the first lift's
name ("Deadlift + Overhead Press goes first"). The merge's order sentence
(`strength-primary-plan.ts`, the block that builds `first.description`) derives `firstName` from
`ordered[0].name` AFTER the name has been rewritten to the joined title. And `pairNoteFor` fires
on top of it. **One note, written once, naming the lift not the session: "Deadlift goes first;
Overhead Press follows fatigued…"**

## 4. THE WEEK-COST PARAGRAPH IS GARBLED

Observed: the back-to-back sentence prints twice with different pairs ("long ride and long run…
Saturday into Sunday", then "hard run and long ride… Friday into Saturday", both ending "Both are
your days, so the week is built around them"); day names print lowercase mid-sentence ("monday's
Back Squat"); and **"You asked for 2 ride days; the week had room for 1" reads FALSE** — the
calendar shows two rides (Tue threshold + Sat long). If the line means EASY rides, it must say
easy rides, and it must count what the athlete sees, not an internal category.

The 24h-after-long-run squat disclosure is CORRECT behaviour (a jammed week, honestly stated) —
keep the disclosure, fix its casing.

## 5. THE THRESHOLD RIDE'S CLOCK DISAGREES WITH ITSELF

Week 1: "4 × 5 min at threshold, 1 min easy" priced at **43m**. Week 5, the identical session:
**24m**. Weeks 2/3: 27m/26m for the longer-interval variants. Two pricing paths for one session;
at most one is right. (20 min work + 3 min rests + warmup/cooldown — decide what the session
actually includes and price it in ONE place.) Likely the same week-1-different-path cause as #1.

## 6. THE SAVED GOAL STILL SPEAKS FOUR-DAY

The prefs block on the export: **"Strength Frequency: 4×/week"** and **"Strength (scheduled by
app): monday, tuesday, thursday, thursday"** — Thursday twice, four entries for three days.
Something on the goal-write path (`create-goal-and-materialize-plan` or what seeds
`training_prefs`) still derives strength days from the four-lift list. §1f-0 said the four-day
vocabulary is deleted; this is a live remnant on the wire. Fix the writer; note whether the stored
value feeds anything besides display.

## 7. SENTENCE-LEVEL LINT, while in there

- "overhand this day." / "neutral grip this day." — fragments; fold the grip into the chins line.
- Lowercase weekday names anywhere copy interpolates a day.
- The week-1 threshold ride prints its raw token "(Bike Threshold 5min)"; later weeks do not.
  Tokens are plumbing and never print.

## 8. MICHAEL'S TWO FINDINGS FROM THE DEVICE, mid-audit

- **"It's running the old builder."** ⚠️ SUPERSEDED by the banner above: the client was refreshed,
  so the only stale thing left is the GOAL ROW's stored prefs (#6). Rebuild-from-scratch remains
  useful as a diagnostic, but nobody asks Michael to do it — reproduce in fixtures.
- **"We didn't offer the correct run drills."** The hard-run options screen still offers only the
  VO2 terrain menu (hill / treadmill / short hill / flat). Under §7 the run can now be the
  THRESHOLD day, and a threshold run is not a hill-repeat session — the offer has to follow the
  role. ⚠️ UNSPECIFIED: what the correct threshold-run offer is (track / flat road / treadmill?).
  **Ask Michael before building — do not invent the menu.**

---

## Done means

Michael exports the same plan and reads it: week 1 logs like every other week, each session's
description is a few lines all specific to that session, the paired day names the lift order once,
the cost paragraph states only true things with capitalized days, one clock for the threshold
ride, and the goal prefs speak three-day. The suites hold `72c0126b`'s baseline
(465/0 · 3000/3 · 683/3) except where a fixture pinned the doubled/boilerplate copy — those move
with the fix, none weakened.

⚠️ **And add the missing class of test: ONE fixture that renders a full session description and a
full week-cost paragraph as STRINGS and asserts no sentence appears twice, no lowercase weekday,
no token text.** That is the gap that let every mechanism pass while the document failed.
