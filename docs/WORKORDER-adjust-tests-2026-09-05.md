# WORKORDER — Adjust tab retests: what each one does, and the throwaway-account verification
**Written 2026-09-05 (chat trace; commit pending). For a terminal session with the service key.**

## What was changed on the screen (built, not pushed)
`src/components/context/StateAdjustLens.tsx`: the standalone RETEST section is gone. Each sport now has a
"Retest" row under its numbers, same row shape: Strength → Lower lifts / Upper lifts; Run → Threshold;
Bike → 20 min / 5 min. Copy under each sport says what that test does (traced below). `docs/STATE-NUMBERS.md`
Retest row updated. Build clean.

## The trace (code, not device) — what happens when each test is tapped

### Lifts (Lower / Upper)
1. `baselines:openTest` event → `AppLayout.openBaselineTest` → the logger opens a session named
   "Baseline Test: Lower" (Back Squat, Deadlift) or "…Upper" (Bench, OHP, Pull ups). No tags, no planned_id.
2. Ramp seeded at ~88% of `performance_numbers` (`storedMaxFor`), else bar-start. One all-out set per lift.
3. "Save as baseline" → `save-baseline-test` → writes `user_baselines.performance_numbers[lift]`
   (raise/first: written; lower: Keep/Update dialog).
4. **SEAM — the block does not re-price from this.** `rematerialize-standing-block` prices from
   `locked_baselines` > the week-one test read (`readTestWeek`, refuses any row not provably week 1) >
   `config.working_numbers`. It never reads `performance_numbers`. So a mid-block retest from Adjust changes the
   number on file and nothing in the block. The old copy said "A logged test re-prices the block" — false for lifts;
   removed.
5. **Second seam — Adjust may not even show it.** The Adjust lift row reads `resolveStrengthCapacity`
   (locked > trusted learned > typed). A fresh test lands as typed; if the learned e1RM is trusted (≥3 samples,
   ≥medium, fresh) the row keeps showing learned.
   Fix candidate (not built — Michael's call): make the lift retest a calendar row like run/bike
   (tags `standing_plan 1rm_test retest`, dated today, linked to the plan) and let the restate read the LATEST tested
   session, not only week one. That is "make lifts look like run".

### Run threshold
1. `runThresholdTestRow(today+3)` → `addPlannedWorkout` inserts the row (tags `assessment run_test …`,
   steps_preset incl. `run_tt_12min`). Steps materialize lazily on open (`buildAssessmentSteps`, p210).
2. The athlete runs it. `auto-attach-planned` links a completed run of the same sport on the same calendar date,
   then re-runs `compute-workout-analysis`. **A run on a different day never attaches → nothing is read.**
3. `extractAssessmentBaseline` finds the 450–780 s lap (>500 m), threshold = trial pace ÷ 0.88, refuses if not
   faster than easy pace or outside 3:00–10:00/km, writes `learned_fitness.run_threshold_pace_sec_per_km`
   (high, source "Run time trial…"). `learn-fitness-profile` keeps a trial over its own best-20 read.
4. `run_threshold_pace_accepted` is held → `pendingRunThresholdProposal` → "Your runs measure X · use X" on
   Adjust and in `PostWorkoutFeedback` after the run. Accept → `acceptLearnedRunThreshold` + `endurance-checkpoint`
   reprice of unstarted rows.
5. **Gate:** if `threshold_pace_source === 'manual'` (the athlete typed a pace on Adjust), the proposal never shows.
   The test measures and cannot be accepted anywhere. This is the punch-list "auto / my-number switch" item.

### FTP 20 min / 5 min
1. `ftpTestRow` / `ftp5MinTestRow` (today+2), tags `ftp_test` (+`ftp_test_5min`), no `assessment` tag → token
   expansion; `bike_ftp_test_\d+min` regex covers both. Steps materialize lazily.
2. No link needed. `learn-fitness-profile` (fired by the popup, and by the pipeline) takes best-per-duration across
   90 days, fits CP over 2–20 min (`bike-ftp-estimator.ts`), FTP = 0.97 × CP. Needs ≥3 durations; medium/high only
   with a 20-min point. A 20-min test ride alone can produce medium. **A 5-min test alone → low → never proposes.**
3. `ride_ftp_accepted` held → `pendingFtpProposal` → Adjust + post-ride popup. Accept → `acceptEstimatedFtp` +
   reprice. **Gate:** `ftp_source === 'manual'` hides the proposal (same as run).

## Throwaway-account verification (terminal)
Pattern: `scripts/_burner-ftp-accept.mjs` (setup / status / teardown, reads `.env`, state file in repo root).
Write `scripts/_burner-adjust-tests-2026-09-05.mjs` with the same shape. Accounts:
- **run** — 5 easy runs with HR (seed easy pace + a learned threshold + the seeded accepted), then schedule
  `runThresholdTestRow(D)`, insert a completed run on D with laps incl. one 720 s lap at threshold-ish speed
  (`scripts/_build-laps-verify.mjs` builds laps), call `auto-attach-planned` then `compute-workout-analysis`.
  Assert: `run_threshold_pace_sec_per_km.source` contains "time trial"; `learn-fitness-profile` run keeps it;
  `pendingRunThresholdProposal` non-null; accept via `acceptLearnedRunThreshold` shape; `endurance-checkpoint`
  reprice returns rows_repriced ≥ 1 when a run plan exists.
  Negative: same run landed on D+1 → no attach, no write.
- **bike20** — 3 rides with power (1 Hz streams) incl. one with a 20-min best; schedule `ftpTestRow`; add the
  test ride with a clean 20-min block; run analysis + learner. Assert: estimator source "power-duration fit",
  confidence ≥ medium, `pendingFtpProposal` non-null, accept writes `ride_ftp_accepted`.
- **bike5** — same but ONLY 5-min efforts on file, then the 5-min test. Assert: confidence low, no proposal
  (documents the copy: "prices alongside a ride with a 20-minute effort").
- **manual** — `ftp_source: 'manual'` + `threshold_pace_source: 'manual'`; run both tests. Assert: no proposal
  on either (the gate).
- **lift** — Standard Focus block at week 3 with working numbers; call `save-baseline-test` with a raise on
  squat; call `rematerialize-standing-block apply:true`; assert upcoming squat rows UNCHANGED (confirms the seam);
  then set `locked_baselines.squat` and re-apply; assert rows re-priced (the only path that works today).
Teardown deletes auth users. Report per account: written / proposed / accepted / repriced, plus the negatives.
