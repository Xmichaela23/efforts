# Target tops, round 5 (2026-09-18)

Branch `blf/round5` (worktree `/Users/michaelambp/efforts-blf-r5`), merged with `stage/one-truth-drift` d642b3f8e.

State: **committed on `blf/round5` only. Not pushed, not deployed, not checked on a phone.**

| commit | what |
|---|---|
| `dcf39c39e` | the tops, the one owner, the readers, the tests, the ledger rows |
| `8dbc2d343` | merge of `stage/one-truth-drift` (d642b3f8e) |
| `303c42850` | plan-writer version 12 → 13 |

## The ruling, as built

Every ride and run step has a top, except sprints. One owner: `singleTargetBand` and `wattsAt`
(`_shared/plan-tokens/quality-work.ts`). The ride type's rule comes from the row's family (`ridePowerRuleOf`).

| step | top | page |
|---|---|---|
| endurance ride (easy, VT1) | 75% of FTP, from 0 | p239 "below 75%" |
| sweet spot, a step at or below 100% | 100% of FTP (a 95% step is 85.5–100%) | pp238–239 "without exceeding it" |
| anaerobic work | floor to 130% of FTP on the screen and the watch; the score counts at or above the floor | p237 "125–130%", "by feel with a power floor" |
| easy / VT1 / long run | the easy pace range's own top | p235 |
| a printed range (VO2 110–120%) | the range's own top | p238 |
| a single printed number | ±10% | TrainingPeaks device range |
| sprint, all-out | no target anywhere | p236, pp229–231 |

- The "never over FTP at or below 100%" rule for every ride type is removed, and its OURS ledger row with it.
- The FTP top is now sweet spot's alone.
- A 105% surge inside sweet spot is a number the page prints itself. It keeps its ±10% (236–289 W).
- How the anaerobic step is saved:
  - The floor is saved as the step's lower end.
  - The step has no upper end, so every score still counts everything at or above the floor.
  - The 130% top is saved beside it for the screens and the sends.
- The Performance rows after a ride show the score's range: "N W and up".

## Before → after, FTP 250 W, threshold 7:00/mi

| step | screen (Planned tab, Today) | Garmin | Intervals.icu / Zwift | scoring range |
|---|---|---|---|---|
| endurance ride, easy | `under 188 W` → unchanged | 0–188 W → unchanged | freeride, "under 188 W" → unchanged | 188 W or under → unchanged |
| sweet spot 95% | `214–250 W` → unchanged | 214–250 W → unchanged | `86-100%` → unchanged | 214–250 W → unchanged |
| VO2 110–120% | `275–300 W` → unchanged | 275–300 W → unchanged | `110-120%` → unchanged | 275–300 W → unchanged |
| VO2 warm-up 95% (p238) | `214–250 W` → `214–261 W` | 214–250 → 214–261 W | `86-100%` → `86-104%` | 214–250 → 214–261 W |
| anaerobic 125% floor | `313 W and up` → `313–325 W` | no power target, text "313 W and up" → power target 313–325 W | freeride under "313 W and up" → `125-130%` | 313 W and up → unchanged |
| anaerobic 110% floor (p237's own) | `275 W and up` → `275–325 W` | no target → 275–325 W | freeride → `110-130%` | 275 W and up → unchanged |
| easy run | `7:59–9:02/mi` (easy range) → unchanged | unchanged | not sent (rides only) | 7:59–9:02/mi → unchanged |
| run step 90% (7:47/mi) | `7:00–8:34/mi` → unchanged | 3.13–3.83 m/s → unchanged | not sent | saved range → unchanged |
| sprint (all-out) | the page's word, no target → unchanged | no target → unchanged | freeride → unchanged | nothing scored → unchanged |

What changed on the run score side:
- A single run pace with no saved range was widened by our own ±5 / 7 / 8 / 10 / 15%, by segment type. It is now
  widened by ±10%. This includes race day's one pace.
- A saved range the analyzer thought "too tight" was widened again by the same numbers. That is gone: a saved range
  is read as saved.
- A rep on an easy run was flagged only when it was more than 5% from the middle of the range. Now it is flagged
  when it is outside the range.
- The fast-finish check had its own margins (5 s around one pace, 1% around a range). It now reads the saved range,
  or ±10% around one pace.

## Checked

- The endurance ride's "under N W" is 75% of the plan's FTP (p239): "under 188 W" at FTP 250. It is pinned from the
  saved step to the printed line and the Garmin target.
- The easy run's top is the fast end of the easy pace range (Friel zone 2 off threshold, 479–542 s/mi at 7:00). It
  is pinned on an easy run and on a VT1 recovery inside a hard run.
- Other band code was found and routed through the owner or removed:
  - the run analyzer's per-segment tolerances (`garmin-execution.ts`, deleted)
  - its "too tight" re-widening
  - its 5%-of-midpoint easy flag, the 5 s point widening and the 1% range buffer
  - the endurance ride's own 0–75% arithmetic (now `wattsAt` rule `easy`)
- The Garmin ×0.97 / ×1.03 and bucket widening were already gone in round 4.
- Pins in `supabase/functions/_shared/plan-tokens/single-target-band.test.ts`:
  - 95% sweet spot is 214–250 W
  - endurance ride tops at 188 W
  - VO2 is 275–300 W
  - anaerobic is 313–325 W on the screen, Garmin and Intervals; 313, 400 and 500 W are in range, 312 W is below
  - a 90% run step is 420–514 s/mi
  - the easy range's top is kept
  - a sprint carries no target

## Checks (on the merged result)

- `deno test -A --no-check supabase/functions src`: 5566 passed, 5 failed. The 5 are the known base failures:
  - `run-threshold-test.test.ts:75`
  - 2 in `anchor-resolver-lint`
  - 2 in `wizard-day-lock.lint`
- `node scripts/check-estimate-provenance.mjs`: exit 0. No pinned book line changed, so the pins were not rewritten.
- Goldens (`scripts/print-block.ts`): no diff (the golden test passes), not rewritten.
- `npx tsc --noEmit -p tsconfig.app.json`: 305 errors (base 305).
- `npx vite build`: ok.
- `docs/INVENTORY.md` regenerated: no change.

## Deploy list

These server functions import changed code (`deno info` over every `supabase/functions/*/index.ts`):

`analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` ·
`compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `create-goal-and-materialize-plan` ·
`endurance-checkpoint` · `generate-strength-plan` · `get-arc-context` · `get-week` · `ingest-phone-workout` ·
`materialize-plan` · `rematerialize-standing-block` · `send-workout-to-garmin` · `swap-list` · `swap-session` ·
`workout-detail`

The phone app (`StructuredPlannedView`, the step list shown for rows written before step lines existed) ships with the
client build.

Plans already on file keep the old ranges until they are rewritten. The version bump (13) makes the refresh rewrite
them.
