# SPEC — "Know your numbers?" baseline entry before a plan

**Status:** specified, not built. One terminal session.
**Date:** 2026-09-04

## Why
A plan prices strength off `learned_fitness.strength_1rms` (tested, from exercise_log) → then
`user_baselines.performance_numbers` (typed) → then defaults (`materialize-plan/index.ts:3982`
"manual performance_numbers first, then learned_fitness.strength_1rms, then defaults" — confirm the
exact order in code and match it; FTP/paces resolve the same way via `resolve-current-*`). A brand-new
athlete has neither tested nor typed numbers, so every priced lift falls to `awaiting_test` / "by feel"
and endurance to defaults — the "no sessions logged yet" empty state. The field (TrainingPeaks,
TrainerRoad) never gates entry on a test: you type what you know or skip, and estimation fills the rest.

This feature is the entry point: an optional screen to type known numbers into baselines before a plan
builds. Enter → the plan prices immediately. Skip → week-one tests establish them through the loop that
already exists (exercise_log → learn-fitness-profile → strength_1rms; endurance six-week checkpoint).

## What to build — IN THE WIZARD, not a separate screen
The ask lives in `ArcSetupWizard` (Michael, 2026-09-04). The wizard already loads
`user_baselines.performance_numbers` and `learned_fitness` at mount (`ArcSetupWizard.tsx:73` select),
so it already knows whether a number exists per discipline. It just never asks.

1. **A per-discipline choice inside the wizard**, shown ONLY when baselines already hold that number
   (typed OR learned/tested): **"Use your current numbers" | "Test in week one."**
   - *Use current* → the plan prices off the number on file (no change to today's pricing path).
   - *Test in week one* → the plan opens with the test sessions for that discipline; the number on
     file is not used to price the priced rows, they wait on the test (the `awaiting_test` path, used
     ON PURPOSE here).
   - When baselines are **empty** for a discipline: offer *enter a number* (optional inline field) or
     *test in week one*; no "use current" option because there is nothing current.
   Disciplines: strength 1RMs (squat / bench / deadlift / OHP + pull-up reps, Q-102 `0` valid), FTP,
   run threshold pace, swim CSS. Each independent — an athlete can bring a bike FTP and test their lifts.
2. **Writes** go to `user_baselines.performance_numbers` through the SAME path Training Baselines uses
   today (no new write path, no DB write from chat/agent — the app writes it). Nothing is invented and
   nothing is required.
3. **No engine change.** The plan builder already reads the numbers (learned/tested first, then typed);
   the wizard choice only decides whether that number is USED or the discipline opens with tests.
   Verify: with a squat 1RM on file, "use current" prices the ME squat off it; "test in week one"
   opens the test and leaves the priced rows awaiting it.

## Guardrails
- Skippable at every step; skip is a first-class outcome, not a dead end.
- No test is ever required to enter the app or to start a plan (field standard; no hard gates).
- Prefill from an existing estimate, never overwrite a typed number with an estimate.
- Athlete-agnostic; judge against a new empty profile, never Michael's numbers.

## Also closes
The `awaiting_test`-on-a-known-lift artifact (a plan materialized on top of a plan / a backfilled
test leaving one row frozen): if baselines carry the number, no lift prices off `awaiting_test` in the
first place. Note this is a mitigation, not the root cause — the stale-state bug is still worth the
separate trace in the polish list.

## Acceptance
Three throwaway accounts through the wizard: (a) numbers on file, chooses "use current" everywhere →
plan fully priced, no `awaiting_test`; (b) numbers on file, chooses "test in week one" → plan opens
with tests, priced rows wait, and after logging the tests a rematerialize prices the rest from the new
exercise_log maxes; (c) empty baselines, enters some inline and tests others → mixed, no crash, every
blank says why. Screenshot each. Never a DB write; always through the app.
