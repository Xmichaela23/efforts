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
| A Red checks mean something | done | 2026-09-17 | 47 → 8 red (556 files). 39 stale checks updated (953389af). 8 left red: 3 real on the punch list (5aa8b95c) — KB swing, seated DB press, eleven untyped movements; `docs/INVENTORY.md` out of date (needs `npm run inventory:write`); 3 checks whose rule is gone, proposed for deletion — the two wizard week-solve checks (9be46477) and the FTP easy-rides warning (abcd7988). Tests only; nothing deployed. |
| B The run nobody judged | done | 2026-09-17 | **B1** already had order pairing (`laps-paired`, 1da1fd91); the gap was the ±3 s tolerance — Michael's watch ran 198–211 s laps against 240 s steps, so nothing paired. New third rung `laps-in-order`: drop laps shorter than the shortest planned step, pair one-for-one when the counts match. No new constant. **B2** ~~the 8–10 band is gone; effort is Foster's CR-10 (2001) by the step's own percent of threshold, so a 90% rep reads 6–7 and a 120% rung 8–9. Ledger row 201 superseded.~~ **REVERSED 2026-09-17 (Michael): the effort band is OFF every run and ride step** — no `target_rpe` stamped or carried, no RPE in any planned line; CR-10 row and row 201 back-annotated DEAD. The book's words instead, approved word for word: the talk-test line on VT1 / LSD (p235), the all-out line on Sprint / Power when a work step has no target (p229–231); two new STATE-SOURCES rows. Throwaway (one Run + Strength plan, re-materialized by the unpushed code served locally): 243 lines, none with an effort number; near-threshold and MLSS keep their pace ranges; all 12 LSD rows print the talk-test line; no ride prints either line. **Not seen on a real plan:** VT1 (this frame has no VT1 run) and Sprint / Power (no standing-plan frame schedules `run_sprint_power`) — both unit-checked only. Existing plans keep the old text until rebuilt. **B3** was already fixed twice (ce39c5b3 Planned tab, 1da1fd91 row label) — only stored pre-2026-09-17 rows still carry it; the pattern is now guard rule 1 (a), and the two dead unguarded formatters in `performance-format.ts` are deleted. **B4** the ladder prints 5 lines, Michael's words pinned in `planned-step-lines.test.ts`. |
| C Words picked on the phone | done | 2026-09-17 | 6 of the 7 rows moved: empty-day line (`get-week.empty_day_lines`, one composer, the calendar's duplicate gone), deload pill (`get-week.is_deload`, was a name regex in two places), hard-card label (`preview-week-read.hardCardLabel` — NOT a server field: the wizard solves on the device by design), "By feel" (`materialize-plan` stamps `weight_display`), "unlinked" (`get-week.unlinked`, was one rule over two different inputs), the 5K row's two strings (`five_k_nudge.baselines_value_when_auto` / `.baselines_note_when_mine`). **Not moved: "Elapsed (chip) time"** — its list is a direct `goals` query on a PARKED race path with no server composer to hang it on; filed. Guard rule 6 added as a moved-words regression pin (a general status-word detector was tried and abandoned: 147 hits, almost all button text and Tailwind classes). 5 stale §7 rows struck. |
| D Sessions answer back | part | 2026-09-17 | **D1 built, unit-verified, NOT FIRING end to end** — `_shared/session-detail/off-prescription.ts` + `execution.off_prescription` + the render; all five approved strings pinned. On the throwaway it returned null, and the cause is visible in the payload: on a watch-row path `analyze-running-workout` rebuilds the rows, drops `planned_pace_range`, and stamps `interval_type: 'work'` on the warm-up, the cool-down and the recoveries (7 "work" rows where there are 6 reps). The composer is right; its input is not. Next session's first job. **The same-day change built, and the reported cause was wrong**: the weekly throttle was already deleted 2026-09-03; the learner runs on every completed Garmin workout. It ran BEFORE the session's own best efforts existed, because `recompute-workout` is queued and the pipeline was awaited inline. It is now a queued job behind that recompute (`post-import-athlete-pipeline` edge function, `run-jobs` ALLOWED_KINDS). **2026-09-17 (Execution build, not yet pushed): D1 FIRES** — the watch-row rows were typed `work` because `interval-breakdown.ts` typed every non-lap row `work`; they now take the step's own role, and the warm-up, jogs and cool-down are no longer added a second time. On a throwaway (laps-in-order, six reps at 8:23/mi) the line read "All six reps were faster than the 10:26–10:52/mi asked for. They ran 8:23/mi." The dropped range did not reproduce: the ranges were on every row. **D2 NOT built** — the two-in-a-row line needs the off-prescription verdict as a STORED per-session fact to count a streak; it is computed at read time in `session-detail/build.ts`. Storing it at analyze time is the remaining work. **D2 DROPPED 2026-09-17 (Michael) — do not build.** It was a second trigger beside the one path that exists: the learner re-fits threshold/FTP after every session and the post-run popup card (`PostWorkoutFeedback.tsx:641-665`) offers the new number. That card stayed quiet on 2026-09-16 only because the learner ran one session behind, fixed in f65c83c3 and deployed. The per-session off-prescription line (D1) stays: it describes the session and offers nothing. |
