# SPEC — Non-race RUN via generate-run-plan (retest head)

**Status:** APPROVED — implementing. The (b)-run fork from `SPEC-non-race-goal-plan-contract.md`: route single-sport **run** non-race goals to the working `generate-run-plan` engine with a **retest head** (no race/taper/peak), instead of the triathlon-shaped `buildCombinedPlan` (which can't produce a single-sport week — F-9/F-12).
**Captured:** 2026-06-28. **Scope:** run-shaped non-race only. Tri non-race stays on `buildCombinedPlan` (works). Bike/swim/strength non-race stay `unsupported_sport` (F-10) — bike is the next build, against *this* proven pattern.

## Why (b)-run, why now
The combined engine is triathlon-shaped (optimizer pins bike/swim; week-builder returns no plan at 0-discipline — proven by the provisional cut in stash). `generate-run-plan` is a working single-sport engine that is NOT deeply race-shaped: length is a direct input (`duration_weeks`), `race_date` is optional, and the race-shaping is concentrated in a removable, name-keyed phase tail. So (b)-run is a clean head-swap that gets run non-race testable end-to-end — giving bike a proven single-sport pattern to build against instead of inventing it blind.

## The three pieces

### 1. Retest-tail transform — `applyRetestTail(phases)`
`generate-run-plan` generators build the tail `… → Race Prep → Taper` (`base-generator.ts:345-360`), sized from `duration`. The taper is name-keyed in two spots (`:414` finds `'Taper'`; `:655` special-cases it). Combined already parameterizes this as `terminalShape: 'taper' | 'retest'` (`phase-structure.ts:346`).
- **Cut:** a shared post-pass applied at the single `determinePhaseStructure()` call site (`index.ts:166`/`:184`) when the goal is non-race. It converts the race tail to a non-race tail by **renaming, preserving week boundaries**: `Taper → Retest` (the low-volume terminal becomes the hold-and-retest week) and `Race Prep → Build` (no race-specific sharpening). One function, not 9 generator edits.
- Teach the two name-checks (`:414`, `:655`) to treat `'Retest'` as a terminal phase (like Taper: low-volume terminal, but framed as retest, no race sharpening).

### 2. Retest week — copied from combined
Combined's retest is **structural, not a special session**: a terminal phase with retest science (`science.ts`: intensity `{low:0.77, tempo:0.13, high:0.10}`, strength `0`, TSS `200–400`). No literal time-trial — a light "hold + re-benchmark" week.
- **Cut:** the `Retest` phase reuses run-plan's existing terminal-phase machinery (the Taper path already emits a low-volume week) with retest framing — low `quality_density`, `volume_multiplier ≈ 0.6`, focus "hold fitness + retest." Intensity copied from combined. Cheap: rename + reframe, no new session type.

### 3. Routing — split the non-race short-circuit (create-goal)
create-goal already invokes `generate-run-plan` for run **races** (`index.ts:3062`, `generateBody.duration_weeks` `:2983`). The non-race short-circuit (`:2346`) currently sends ALL non-race → `buildCombinedPlan`.
- **Cut:** split by shape:
  - **non-race + run-shaped (single-sport, not hasTri)** → the existing `generate-run-plan` path, `generateBody` set for non-race: `duration_weeks = target_weeks`, `distance = proxyDistanceForNonRaceGoal(...)`, `race_date = null`, retest flag (`terminalShape:'retest'` / `goal_type`).
  - **non-race + tri-shaped** → `buildCombinedPlan` (unchanged).
  - **non-race bike/swim/strength** → `unsupported_sport` (F-10, deferred).

## Caveats (known, not new cost)
- **Strength is the support overlay** here (the `generate-run-plan` strength-overlay / Q-087 path), NOT the co-headliner peer track. (b)-run proves the *run plan materializes*; the peer/co-headliner strength is the separate **Q-088** build, layered later.
- The retest "week" is a light hold-and-benchmark terminal, not a literal time-trial. Matches combined; a real benchmark session is optional polish.

## Verification
- **Run non-race materializes end-to-end:** preview-sweep on `claudemore` (run goal → non-degenerate week, passes the 70% backstop — the real F-9 proof).
- **Run races byte-identical:** retest tail fires only for non-race; races keep `'taper'`. Unit tests assert race tail = Taper (unchanged), non-race tail = Retest (no taper).
- **Events untouched:** combined/tri path unchanged → 486 matrix stays 486/486.

## Out of scope (deferred)
Bike/swim/strength non-race (F-10); the co-headliner strength track (Q-088); the rich intake wiring (`non-race-intake-steps.tsx`, built, awaiting a materializing engine); the provisional combined single-sport cut (in stash — step-1 for bike).
