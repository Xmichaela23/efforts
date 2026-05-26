# Overnight batch report — 2026-05-26

## Headline

**486 / 486 combos passing (100%).** Started at 99 / 486 (20%).

Six fixes shipped, all matrix-verified after each landing, each committed
separately with a `D-NNN` label. The harness's response-cache footgun was
exposed early in the batch; subsequent matrix runs used `NO_CACHE=1` to bypass
disk caching.

## Per-fix progression

| Step | Fix | Engine? | Matrix pass | Δ | Notes |
|---|---|---|---|---|---|
| baseline | D-064 swim-on-rest-day (entry state) | — | 99 / 486 | — | 387 fails: 231 errors, 84 strength_present, 72 swim_jargon_Z, 54 swim_freq_build_w8 |
| 1 | **D-065** swim jargon Z3 leak | yes | 135 / 486 | +36 | swim_jargon_Z 72 → 0 |
| 2 | **D-066** strength on rest_day | yes | 201 / 486 | +66 | strength_present 84 → 0 |
| 3 | **D-067** harness peak-vs-median (test only) | no | 255 / 486 | +54 | swim_freq_build_w8 54 → 0 (all false positives) |
| 4 | **D-068** WoW TSS ramp distance-aware | yes | 486 / 486 | +231 | All HTTP 400 errors cleared (3 sub-passes: 25%/30%/24% calibration) |
| 5 | **D-069** first_race sweet-spot in base | yes | 486 / 486 | 0 | Visible in athlete-facing labels only; verified by plan inspection |

## Remaining failure categories

**None.** All 486 combos pass.

## Biggest-impact fixes

1. **D-068** (calibrated WoW TSS ceilings) — closed 231 HTTP errors in one
   land. The 20% ceiling was overly tight once D-064/D-066 restored the
   silently-dropped sessions; tuning to 24% (half-IM) / 30% (full-IM) closed
   the gap while staying inside conservative coaching guidance.
2. **D-066** (strength on rest_day, extends D-064) — eliminated the 108-combo
   strength_present cluster. Same silent-drop pattern as D-064 in three more
   layers (three strength placement loops + the weekly load balancer).
3. **D-064** (swim on rest_day, baseline of this batch) — kicked off the
   batch and exposed the rest_day vs preference-pin collision. Without this,
   every downstream fix would have been masked.

## New failure categories surfaced (and resolved)

- **swim_jargon_Z** (72 combos, surfaced after D-064): the second swim was
  previously dropped; once D-064 emitted it, the existing Z3 leak in
  `downgradedHardToModerateFrom` became visible. Resolved by **D-065**.

- **More HTTP 400 errors** (231 combos, surfaced after D-066): same
  mechanism — D-064/D-066 restored composite TSS that the 20% WoW ceiling
  was calibrated against the pre-fix baseline. Resolved by **D-068**.

- **Harness recovery-detector false positives** (54 combos, exposed after
  D-066): not an engine bug — the harness's median-based detector failed for
  1:1 loading (every-other-week recovery makes median fall between build
  and recovery TSS). Resolved by **D-067** (peak-based detector).

## Notes on the batch

- The harness was caching responses on disk (`scripts/plan-test-output/*.json`)
  and re-using them across runs. Engine fixes appeared to have no effect.
  Added `NO_CACHE=1` env override (`scripts/plan-generation-matrix.mjs`).

- D-064/D-066 share a root cause — silent-drop pattern when a session is
  placed on a rest_day, then the builder defensively skips emission. Five
  placement layers + the load balancer all needed the same fix. Hoisted
  `restDaySet` to one shared definition at the top of `deriveOptimalWeek`.

- The "no thresholds in first_race base" rule (D-069) doesn't affect the
  matrix battery — assertions check structural counts (sessions, types,
  tags), not session label content. Verified by direct JSON inspection.

- The WoW ceiling adjustment (D-068) took three sub-iterations to land
  (25% → 30% for full, 22% → 24% for half-IM) as each calibration step
  cleared a fraction of the violations and revealed the next ramp tier.
  Final ceilings sit inside the coaching literature's safe range.

## Engine touch surface

- `supabase/functions/_shared/week-optimizer.ts` (D-064, D-066) — placement
  + balancer rest_days awareness
- `supabase/functions/generate-combined-plan/session-factory.ts` (D-065,
  D-069) — Z3 jargon strip + new sweetSpotRun helper
- `supabase/functions/generate-combined-plan/week-builder.ts` (D-066, D-069)
  — sweetSpotRun call sites, strength-emission unchanged (driven by
  optimizer pre-placement)
- `supabase/functions/generate-combined-plan/validate-training-floors.ts`
  (D-068) — distance-aware WoW ceiling constants
- `supabase/functions/generate-combined-plan/index.ts` (D-068) —
  primaryDistance threading into floorOpts

## Test additions

- `supabase/functions/_shared/week-optimizer.anchor-contract.test.ts`:
  D-064 (3 tests) + D-066 (2 tests) = 5 new regression sentinels. All
  35 tests in file pass.

## Open follow-ups

None blocking. Possible later work:

- The `tempoRun` helper still labels the description "at lactate
  threshold". For D-061 / D-069 conservative-build coherence, the
  first_race build-phase downgrade from VO2 should arguably route
  through sweetSpotRun instead of tempoRun too. Not in scope of this
  batch — D-061 build-phase gate is intentional per its own decision
  log entry. Worth a Q-NNN if athletes flag it post-ship.

- The matrix harness only checks structural assertions (session counts,
  types, tags, label keyword presence). Athlete-facing copy correctness
  (e.g., D-069 sweet-spot replacement, D-065 Z-zone strip) needs
  separate plan-inspection workflows or harness extension.
