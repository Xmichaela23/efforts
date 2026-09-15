# WORKORDER — run pace, one source (2026-09-14)

**Job:** find out whether a run's pace numbers are worked out in more than one place with different rules,
the way ride power was until today. **Trace and report first. Change nothing until Michael approves the
plan.**

## Why

On 2026-09-14 one ride showed four different "average powers" (99 / 129→131 / 130 / 131 W) and called the
same 130 W both red and "on target". Michael: *"nothing should do its own math — single source of truth,
smart server, dumb client."* Rides are fixed. Runs have the same shape of screen and have not been checked.

## What was done for rides (read it, do not redo it)

- `supabase/functions/_shared/ride-power.ts` (+ `.test.ts`) — the one set of power rules: coasting counts as
  0 W; the judged number is normalized power for a stretch of 20 min or longer, average power below that;
  "on target" = inside the range, no allowance. Sources are cited at the top of the file.
- `compute-workout-summary` writes `judged_power_w` / `normalized_power_w` / `avg_power_w` per segment and no
  longer drops 0 W seconds (`readPowerW`).
- `compute-workout-analysis` (Details NP, pedalling average) and `analyze-cycling-workout` (segment row,
  colour, power adherence, Execution, pacing halves) read those rules.
- The two ride sentences "Power adherence …% of work-interval time" and "Interval execution … within ±15%"
  were replaced by one approved line: `128 W against 109–126 W, 2 W over the top.` /
  `3 of 4 work intervals inside their range.` (`generateCyclingAdherenceSummary`).
- Commits: `b568fcb8`, `59c920e2`. Recalculated rides back to 2025-12-18.

## Also built today — do not touch

- `_shared/effort-words.ts`: talk test for easy and long runs only (`run_vt1`, `run_lsd`), Foster RPE words,
  the Effort and Talk test rows on Performance (`workout-detail` enrich), the popup question
  (`check-feedback-needed`, `PostWorkoutFeedback.tsx`). Commit `1cb27d2e`.

## What to trace

For one completed, plan-linked run, every pace or pace-judgement shown to the athlete:

1. **Performance, segment table:** the pace cell (`EnduranceIntervalTable.tsx`, `iv.executed.actual_pace_sec_per_mi`
   / `actual_gap_sec_per_mi`) and its colour (`executed.band` / `gap_band`,
   `_shared/session-detail/interval-compare.ts` `paceBand`, which has a `PACE_BAND_ALLOWANCE_S`).
2. **Performance, top readouts:** Execution, Duration (`AdherenceChips.tsx`, server fields).
3. **Performance, insight rows:** pace adherence, interval execution, pacing/splits, grade-adjusted pace,
   heart rate, drift (`analyze-running-workout`, `_shared/session-detail/build.ts`).
4. **Details tab:** average pace, moving pace, GAP (`CompletedTab.tsx` and the server fields it reads).
5. **State:** run easy pace, threshold pace, any per-run pace it reads (`_shared/state-trend/run.ts`,
   `compute-snapshot`).
6. **Leads, not findings:** the ride analyzer's comment said running uses the same `[85, 115]` interval hit
   window; `compute-facts` has its own `adh >= 85 && adh <= 115`. Stops: is pace moving time or elapsed,
   and does each place agree? GAP: one formula (`_shared/gap.ts`) or more?

For each number: the `file:line` where it is **computed** (not passed through), the rule (moving or elapsed,
GAP or raw, which samples, which allowance), and every screen that shows it.

## The book, for judging a run

Check the page before citing it (`docs/SOURCE-viada-hybrid-athlete.md`):
- Hard run / near-threshold (p233): percentages of threshold pace, per interval.
- Easy run and long run (p235): at or below VT1; the talk test (p211) — already built, see above.
- Decoupling (p107): stop at 10%, 5% for hybrid athletes.
- What TrainingPeaks does (field practice) goes beside the book, labelled as such.

## Report back (before any code)

1. A table: number → where computed → rule → shown on.
2. Every place two numbers a runner would read as the same thing disagree, with the run's actual values if
   you can read them through the app's own session (no `.env`, no prod queries without Michael's go-ahead).
3. A proposed plan in the ride shape: one shared rules file, which number judges which run, which sentences
   change — with the exact new wording for Michael's approval.

## Rules for this session

- Plain English to Michael: what he would see, no function names unless he asks.
- Edits are free. **Commit, push and deploy wait for Michael's word "go".** Add exact files; never
  `git commit -a` (other terminals share the tree).
- Every athlete-facing line goes to Michael word for word first.
- Every number has a source cited in code, or is marked OURS.
- The `_shared` deploy trap (CLAUDE.md): redeploy every function that imports a changed shared file.
