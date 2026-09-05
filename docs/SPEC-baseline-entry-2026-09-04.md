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

## What to build
1. **A setup screen, skippable**, shown before first plan creation (and reachable later from Training
   Baselines, which already edits these). Sections, each optional: strength 1RMs (the tested lifts —
   squat / bench / deadlift / OHP, plus pull-up rep count, Q-102 `0` valid), FTP, run threshold pace,
   swim CSS. Prefill any field the app can already estimate; leave the rest blank. One "Skip — I'll
   test in week one" control.
2. **Writes** go to `user_baselines.performance_numbers` through the SAME path Training Baselines uses
   today (no new write path, no DB write from chat/agent — the app writes it). Nothing is invented and
   nothing is required.
3. **No engine change.** The plan builder already reads `performance_numbers`; a number entered here is
   simply present when it materializes. Verify: enter a squat 1RM, build a Standard plan, confirm the
   ME squat prices off it instead of `awaiting_test`.

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
Three throwaway accounts: (a) enters all numbers → plan fully priced, no `awaiting_test`; (b) skips →
week-one tests, then baselines fill and a rematerialize prices the rest; (c) enters some, skips others
→ mixed, no crash, blanks say why. Screenshot each. Never a DB write; always through the app.
