# SESSION 2026-09-04 → 05 — State is sourced, Adjust owns the week, numbers are proposed then accepted

**Read this first for the UI pass.** Main at 71393e6b; everything here is pushed,
the server functions deployed, the iOS project synced (Xcode build is Michael's).

## The rules that now hold (and where they are written)
1. **Every number on State has a named source** — TrainingPeaks / WKO5 / Garmin / Friel / Viada — or an
   explicit OURS row. Ledgers: `docs/STATE-NUMBERS.md` (plain English) and `docs/STATE-SOURCES.md`
   (code-level). CLAUDE.md rule 5. Zero OURS remain on the run/ride surface.
2. **No AI in the numbers.** Deterministic: same logged sessions, same screen. Fixed copy, no narration.
3. **Proposed, then accepted.** FTP and run threshold pace: the learner measures, the athlete accepts
   (Adjust, the post-workout popup, the six-week checkpoint). Nothing re-prices on its own. Lifts: a
   logged test re-prices the block on save.
4. **Deload is a tool you deploy, never a scheduled week** (p120, p247). Adjust → Deload.
5. **The plan's word outlives the plan**: a linked session's plan tags are stamped on the workout.
6. **One grader for "was this an interval run"**: plan tag → detected type → Friel Z3 (≥90% LTHR).
   The analyser's pace-variance stamp is a hedge, never a filter (D-372 item 3, restored).

## What the screens look like now
- **State → Status**: LOAD (TrainingPeaks PMC), BODY, week bars, then the sport rows in the athlete's
  order (reorder control). Each row opens to cards drawn by ONE chart template (label · big number ·
  qualifier · chart · "over N weeks: start → end" · key line). Bike: FTP over time (TrainingPeaks
  threshold history) · Best 20-minute power · Efficiency · Drift. Run: Efficiency · Drift · the named
  session card. Strength: e1RM per lift.
- **State → Adjust**: Rebuild · Deload · Retest (Lower / Upper / Run threshold / FTP 20 / FTP 5) ·
  the numbers the block prices from, per sport, tap-to-edit, with proposals and accept.
- **Post-workout popup**: a new measured FTP / threshold pace as a card with accept.
- **Wizard**: "Know your numbers?" step — use current or test, per discipline.

## Open for the UI pass (docs/POLISH-PUNCH-LIST.md, bottom)
- Baselines becomes the profile page; Adjust owns the plan's numbers and gains the auto / my-number switch.
- Paired fresh/tired 1RM read; VT1 talk test; home-gym pick pass (held for the course material).
- Five standing-plan tests are red on main from the wizard engine work (listed in chat to c0).

## Specs written this session
`SPEC-baseline-entry-2026-09-04.md` (built), `SPEC-ftp-trend-line-2026-09-04.md` (built),
`SPEC-ftp-estimator-2026-09-04.md`, `SPEC-ftp-accept-2026-09-04.md`, `SPEC-state-nothing-invented-2026-09-04.md`.

## Run MLSS level-2 round matches p232 (2026-09-05)

Michael's Monday Hard Run showed 45 s @ 125% / 53 s @ 115% / 1:30 easy per round. The page says 45 s @ 125% / 45 s @ 115% / 30 s @ 100% / 1:30 @ VT1. The float is now fixed at 45 s and the 30 s at threshold is emitted as a third step (counted as work). Hard Run goes 42 → 45 min in the golden plans; the long run gives back 2–3 min under the weekly run budget. Goldens and docs/INVENTORY.md regenerated. Functions to deploy: coach, compute-snapshot, endurance-checkpoint, generate-strength-plan, rematerialize-standing-block. Michael's row updates on his next rebuild.

## Rebuild now restates runs and rides (2026-09-05)

Michael tapped Rebuild after the MLSS fix and Monday did not change. Cause: the rebuild rewrote lift rows only; run and ride rows kept the tokens they were built with, so a library correction or a deload column never reached an existing calendar. Now `restateEndurance` (restate.ts) matches composed run/ride/swim sessions to unstarted rows by week + weekday + type, skips scheduled tests by tag, rewrites tokens/minutes/name/description/tags and re-estimates planned load; the whole-plan refresh re-expands the steps. Dry run returns `endurance_changes`. Button copy: lifts and weights, runs and rides.
