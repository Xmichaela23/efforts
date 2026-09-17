# WORKORDER — sessions that answer back (2026-09-17)

**What this is:** the next piece of work after the one-truth workorder (`docs/WORKORDER-app-one-truth-2026-09-15.md`,
DONE, merged to main 2026-09-17). Run from a fresh project-manager chat that hands ONE stage at a time to a terminal,
reviews the report against the standard, and brings Michael only words, real forks and anything that changes what he
sees. Every terminal updates §6 when its stage lands.

**How it started:** Michael's 2026-09-16 near-threshold run. Plan: 6 × 4:00 at 10:26–10:52/mi (90% of a 9:35
threshold, p234 `below_threshold` level 2). He ran the reps at 8:06–8:38/mi, heart rate 153→164 against a threshold
heart rate of 162. The watch recorded 12 laps against 13 plan steps, so the app matched nothing, printed the laps with
no colour, and scored Execution 95% from time alone. Nothing told him the reps were far over target, and nothing
suggested his 9:35 threshold (accepted 2026-09-16 17:48) is too slow. Michael, 2026-09-17: "should the app be
adjusting and mentioning?" — mention yes, adjust only on the athlete's accept.

---

## 1. The standard (unchanged — read the one-truth workorder §1 and §5; they bind every stage here)

In short: one source per number; the server computes, the phone prints; every number cites the book page or a named
app, or is marked `// OURS —` with a row in `docs/STATE-SOURCES.md`; the device's number wins (rule 7); fix what is
there, never build beside it; every athlete-facing line goes to Michael word for word first; commit exact files, never
`-a`; commit, push and deploy wait for his word; throwaway checks ONE round by default; recalculate the last 16 weeks,
never the whole history; nothing re-prices a plan without the athlete's accept (proposed-then-accepted). The guard
(`npm run lint:truth`, inside `npm run build`) has every rule on FAIL; a stage that trips it is not done.

Scope is the standing-plan path (Run + Strength, Ride + Strength, Run + Ride + Strength). Race path and season wizard
stay PARKED.

---

## 2. Stages — one terminal session each, in this order

Every stage: **trace → report → Michael's go → build → throwaway check → exact-file commits → deploy (list every
importer of a changed `_shared` file) → recalculate if stored numbers change (16 weeks) → update §6.**

### Stage A — make a red check mean something again

The test suite has about 48 failing checks (`docs/STAGE7-FINAL-PASS-2026-09-16.md`, tests section; every recent
session reports "failed before me too"). Three were named 2026-09-17: Adjust's readout with nothing on file (stale
since Stage 4 added a block, d3f7f3a4), the logged-lifts list (code changed 9ba9144a / 0957e09a / 186f89e6), the
equipment catalogue's singular/plural (code changed ed228810, the equipment session).

For every failing check: run it, read the failure, and give one verdict — **stale** (the app is right; update the check
to the current rule, citing the commit that changed the rule) or **real** (the app is wrong; file it on the punch list
with file:line, do not fix it here). Report a table: check · verdict · why · commit. End state: the suite passes
except the checks filed as real, each named in the report. No app behaviour changes in this stage.

### Stage B — the run that nobody judged

Punch list entries "LAP COUNT ≠ STEP COUNT → NO PACE VERDICT AT ALL" and "NEAR-THRESHOLD RUN: THE PACE IS THE
PAGE'S; RPE 8–10 AND THE PHONE'S 0.41 mi ARE NOT". Three items, one session, because they touch the same rows:

1. **Verdict when laps ≠ steps.** Trace `_shared/session-detail/interval-compare.ts` and the laps-as-rows fallback
   (6f3d7c19, 44a1ab79) first. Rule to propose: match the work laps to the plan's work steps by order, judge the
   matched ones against their range, print what was not matched; Execution must not read 95% on a session whose every
   work rep was outside its range. Check on Michael's 2026-09-16 run read-only, and on a throwaway with a watch that
   folds the last recovery into the cool-down.
2. **"RPE 8–10"** on the grouped planned line (OURS, `materialize-plan:698-699`) sits on sub-threshold work (the 90%
   reps, `short_above`'s 90% float). Threshold effort is about 7 on the CR-10 scale (Foster); the book prints "RPE
   9/10" only for the ME lift (p205). Find what the page says per archetype; print the page's target or strike it.
   Words to Michael.
3. **"0.41 mi"** on the Planned tab for a 4:00 step (`c/StructuredPlannedView.tsx:193`, time converted to distance on
   the phone). The page prescribes time; print time. Add the pattern to the guard's rule (a) so it cannot recur.

Also in this stage, **the ladder line** — Michael has NOT yet approved these words. The descending-ladder hard run
prints one line per step (20 lines) because nothing repeats. Proposed, for his yes before building:

```
10:00 warm-up · HR 138–144 · ref 10:56–12:22/mi
Set 1: 3:00, 2:00, 1:00, 45 s, 30 s @ 7:49–8:09/mi · jog 2:00, 1:20, 40 s, 30 s, 20 s @ 15:01–16:55/mi after each
2:00 @ 10:56–12:22/mi between sets
Set 2: 2:00, 1:00, 45 s, 30 s @ 7:49–8:09/mi · jog 1:20, 40 s, 30 s @ 15:01–16:55/mi after each
8:00 cool-down · HR 138–144 · ref 10:56–12:22/mi
```

### Stage C — words picked on the phone (read-only pass, then one fix session)

2026-09-17: State's bike row printed "168 W · estimated" while Adjust printed "accepted from your rides" for the same
number — a word chosen on the phone from a different field (fixed df71a674). The guard checks numbers, not words.
Using `docs/TRUTH-MAP.md` §7 rows flagged "label by rule", list every athlete-facing word or status still chosen on
the phone (source words, verdict words, colours by rule). Report the list with file:line and the server field that
should carry each. Then, after Michael's go: the server sends each word beside its number, the phone prints it, and the
guard gains a rule for a status word chosen on the phone. No new words: every word must already print somewhere.

### Stage D — the session that answers back (design first)

**Goal:** after each hard run or ride, the app says plainly when the session came in well off its prescription, and
when that happens consistently it offers a new threshold or FTP for the athlete to accept. It never re-prices on its
own.

**Trace before any design — the parts already exist:**
- The book's three signals, p123: faster at the same effort, lower heart rate at the same pace, lower effort rating.
  The week-6 checkpoint already reads them, first half of the block's hard sessions against the second
  (`_shared/standing-plan/endurance-checkpoint.ts`, `sf/endurance-checkpoint`).
- The learner re-fits threshold and FTP after every session (`learn-fitness-profile`; run critical speed from best
  efforts over 16 weeks, ride critical power over 90 days).
- The proposal the athlete accepts: Adjust's "use N" and the post-run popup's card (`save-baselines {accept}`,
  `lib/accept-measured.ts`).
- The rule for when to raise: "consistently superior at the target effort" (ledger; p123; the book's progression page).
- Per-rep verdicts on a session (Stage B makes them exist when laps ≠ steps).

**Research, quick look only (vendor help pages, no deep research):** how TrainerRoad (Adaptive Training, AI FTP
Detection), Garmin (auto-detected lactate threshold / FTP with accept/decline) and TrainingPeaks decide that a session
or a run of sessions warrants a new threshold — what signals, how many sessions, and what the athlete sees. Cite the
URL read for each; say "not found (searched: …)" where a vendor page does not say.

**The design report must answer, each with a source or marked OURS:**
1. What counts as "well off prescription" for one session, per sport (pace or power against the step's range, heart
   rate against threshold heart rate, the effort rating), and what the athlete sees on Performance.
2. How many sessions make "consistent", over what window, and whether a single strong session changes anything beyond
   feeding the learner. The book is silent on the count.
3. Where the offer appears (the popup card and Adjust already carry one; no new screen unless the report says why).
4. Whether the learner already produces the offer after a session like 2026-09-16 (six reps at 8:10 are now among his
   best efforts): check Michael's Adjust read-only before designing anything new.
5. Every athlete-facing line, word for word, for Michael.

Design report → Michael's go → build as a normal stage. No build in the design session.

---

## 3. Facts the next chat needs (verified 2026-09-16/17)

- Branch `stage/one-truth-drift` equals `main` as of 2026-09-17 (plus df71a674 and 40fce36a, pushed to both by
  Michael's command). Netlify builds the web client from main.
- Michael's run threshold: 9:35/mi, "accepted from runs", accepted 2026-09-16 17:48 (was 8:51). His plan re-priced off
  it. He was told a retest from Adjust lands on today and settles it.
- FTP 168 W, accepted from rides. Threshold heart rate 162.
- His plan was rebuilt on the final code: 50 of 50 run/ride rows updated, lifts unchanged.
- BODY stays on State (restored by Michael 2026-09-04, placed last 2026-09-10). Do not remove it.

## 4. Parked or queued elsewhere — do not start here

On the punch list, after this workorder: the stale-rows rebuild notice; manual "Send to Garmin" not recorded by the
sync; inbound source per sport for Intervals/Wahoo/Zwift with cross-source dedupe (design brief first); the metric plan
builder rounding in pounds; unattached-ride drift, the Zwift/Intervals title prefix, the header card re-pop, smart plate
math, the zone-5 edge, the one-beat trim. Race path and season wizard: parked, silent.

## 5. Rules for the PM chat

Hold this file as the plan; one stage per terminal; review every report against §1 before it reaches Michael; review
the diff, not only the report. Never state a number about Michael's plan without reading it from the row; label
evidence ("I read", "I am inferring"). Talk plain: what he would see, no function names unless asked, no idioms. Say
something once.

## 6. Status (each stage updates its row)

| Stage | State | Date | Notes |
|---|---|---|---|
| A Red checks mean something | not started | | |
| B The run nobody judged | not started | | ladder words await Michael |
| C Words picked on the phone | not started | | |
| D Sessions answer back (design) | not started | | |
