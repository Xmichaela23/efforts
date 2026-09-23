# INVENTORY — generated from the code

⛔ **GENERATED. Do not hand-edit.** Regenerate with:

```
npm run inventory:write
```

These are the lists that rotted last time, so they are no longer written by hand. Anything here
is a fact read off the tree; anything needing judgement — built vs surfaced, open vs closed, why —
lives in `WHAT-IS-BUILT.md` and the decisions logs, written by a person.

---

## 1. THE DEPLOY CLOSURE — what you must redeploy when you touch a shared file

⛔ Supabase freezes a copy of `_shared` into each function **at deploy time**. Editing a shared
file changes nothing in production until every function that imports it is redeployed. There is
no warning, no error, and no test that catches it.

⚠️ Read off the real import graph and followed transitively. Dynamic and bare specifiers are
not followed, so treat every list as the FLOOR on what to deploy.

⛔ **PER FILE, NOT PER FOLDER, AND THAT MATTERS.** A directory-level answer over-reports: a
function that imports only `frames.ts` does not carry `compose.ts` in its bundle, and deploying
it on a `compose.ts` change is noise that trains people to ignore the list.

⛔ **EVERY FOLDER A BUNDLE REACHES, NOT A HAND-NAMED FEW.** An earlier shape of this table listed
`standing-plan/` per file and named two other markers by hand; `state-trend/` was in neither, so
an edit there met a blank row and read as "nothing to deploy". Folders are now read off the
bundles themselves — `_shared/`, `shared/`, `src/lib/`, and whatever else a relative import
reaches — plus everything on disk under `_shared/` and `shared/`, so an unbundled file still
prints as such. **If the file you touched has no row here, that is a generator bug, not a
no-deploy.**

### `src/lib/` — 37 files · anything in it → 53 functions

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `athletic-record` · `auto-attach-planned` · `calculate-workload` · `calendar-sync` · `check-feedback-needed` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `export-data` · `gear-list` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `save-imported-workout` · `send-workout-to-garmin` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `assistance-catalog.ts` | `generate-strength-plan` |
| `assistance-slot.ts` | `analyze-strength-workout` · `auto-attach-planned` · `workout-detail` |
| `associate-candidates.ts` | `get-week` |
| `band-assistance.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `bar-types.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `athletic-record` · `calculate-workload` · `check-feedback-needed` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `gear-list` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `best-efforts.ts` | `compute-workout-analysis` |
| `bike-ftp-estimator.ts` | `compute-session-boom` · `compute-workout-analysis` · `learn-fitness-profile` |
| `derive-workout-title.ts` | `calendar-sync` · `coach` · `export-data` · `get-week` · `send-workout-to-garmin` |
| `discipline.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `estimate-1rm.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `save-baseline-test` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `exercise-config.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `auto-attach-planned` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `exercise-role.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `auto-attach-planned` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `friel-zones.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `save-imported-workout` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `lift-slots.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `maintenance-volume-band.ts` | `create-goal-and-materialize-plan` · `generate-strength-plan` |
| `normalize-strength-set.ts` | `get-week` · `workout-detail` |
| `plan-wizard-distance-label.ts` | `athletic-record` |
| `pullup-progression.ts` | `analyze-strength-workout` · `compute-snapshot` · `materialize-plan` · `rematerialize-standing-block` · `save-baseline-test` |
| `resolve-current-5k-pace.ts` | `analyze-running-workout` · `coach` · `compute-workout-analysis` · `course-detail` · `generate-strength-plan` · `learn-fitness-profile` · `materialize-plan` · `save-baselines` |
| `resolve-current-ftp.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `athletic-record` · `calculate-workload` · `calendar-sync` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `resolve-current-lthr.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `compute-adaptation-metrics` · `compute-facts` · `compute-session-boom` · `compute-workout-analysis` · `endurance-checkpoint` · `export-data` · `generate-run-plan` · `learn-fitness-profile` · `materialize-plan` · `save-baselines` |
| `resolve-current-max-hr.ts` | `analyze-running-workout` · `compute-adaptation-metrics` · `compute-facts` · `compute-workout-analysis` · `export-data` · `generate-run-plan` · `learn-fitness-profile` · `save-baselines` |
| `resolve-current-run-pace.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `run-critical-speed.ts` | `compute-workout-analysis` · `learn-fitness-profile` |
| `run-paces-from-threshold.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `run-volume-tables.ts` | `create-goal-and-materialize-plan` · `generate-run-plan` |
| `session-frequency-defaults.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `standing-plan-week-bounds.ts` | `generate-strength-plan` |
| `standing-plan-week-copy.ts` | `generate-strength-plan` |
| `strength-calibration-copy.ts` | `rematerialize-strength-block` |
| `strength-focus-copy.ts` | `compute-facts` |
| `strength-gear.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `strength-logging-mode.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `swimBaselineNudge.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `tracked-max-lifts.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `trend-receipt.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `week-budget.ts` | `create-goal-and-materialize-plan` |

### `src/lib/plan-tokens/` — 1 file · anything in it → 3 functions

`generate-combined-plan` · `generate-triathlon-plan` · `materialize-plan`

| touch this file | redeploy these |
|---|---|
| `swim-drill-tokens.ts` | `generate-combined-plan` · `generate-triathlon-plan` · `materialize-plan` |

### `src/utils/` — 1 file · anything in it → 5 functions

`calendar-sync` · `coach` · `export-data` · `get-week` · `send-workout-to-garmin`

| touch this file | redeploy these |
|---|---|
| `swimPlanTokens.ts` | `calendar-sync` · `coach` · `export-data` · `get-week` · `send-workout-to-garmin` |

### `supabase/functions/_shared/` — 148 files · anything in it → 90 functions

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `athletic-record` · `auto-attach-planned` · `backfill-facts` · `backfill-power-curves` · `backfill-routes` · `bright-service` · `calculate-workload` · `calendar-sync` · `check-feedback-needed` · `coach` · `complete-race` · `compute-core-verdict` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `course-upload` · `create-goal-and-materialize-plan` · `delete-account` · `delete-goal` · `delete-plan` · `detach-planned` · `detect-cores` · `disconnect-connection` · `end-plan` · `endurance-checkpoint` · `export-data` · `fetch-strava-route` · `garmin-webhook-activities` · `garmin-webhook-user` · `gear-list` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `get-week` · `import-fit-file` · `import-garmin-history` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `intervals-activity-probe` · `intervals-connect-key` · `intervals-oauth` · `learn-fitness-profile` · `mark-planned-complete` · `match-cores` · `materialize-plan` · `place-lost-day` · `plan-overview` · `planning-context` · `post-import-athlete-pipeline` · `process-workouts-batch` · `readiness` · `recompute-athlete-memory` · `recompute-workout` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `resume-plan` · `run-jobs` · `save-baseline-test` · `save-baselines` · `save-imported-workout` · `send-workout-to-garmin` · `share-strength-to-strava` · `strava-token-exchange` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `sweep-user-history` · `sweep-week` · `swift-task` · `validate-reschedule` · `warm-athletic-record` · `weekly-workload` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `absorption.ts` | `coach` |
| `acwr-state.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `get-week` · `workout-detail` |
| `acwr.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `get-week` · `workout-detail` |
| `adherence-plan.ts` | `coach` |
| `alarm.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `compute-session-boom` · `compute-workout-analysis` · `garmin-webhook-activities` · `recompute-workout` · `run-jobs` · `strava-webhook` |
| `analysis-state.ts` | `get-week` · `recompute-workout` · `workout-detail` |
| `analysis-version.ts` | `backfill-power-curves` · `compute-workout-analysis` |
| `analyze-routing.ts` | `auto-attach-planned` · `recompute-workout` |
| `arc-context.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `arc-narrative-ai-appendix.ts` | — nothing bundles it |
| `arc-narrative-state.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `athlete-identity-inference.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `athlete-memory.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-run-plan` |
| `athlete-snapshot.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `materialize-plan` |
| `athlete-timezone.ts` | `calendar-sync` · `compute-snapshot` · `endurance-checkpoint` · `get-week` · `intervals-connect-key` · `intervals-oauth` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `athlete-weekly-intent.ts` | `create-goal-and-materialize-plan` · `generate-strength-plan` |
| `auto-complete-goals-from-workouts.ts` | `import-strava-history` · `post-import-athlete-pipeline` · `strava-webhook` |
| `baseline-suggestions.ts` | `athletic-record` · `save-baselines` |
| `baseline-test-rows.ts` | `create-goal-and-materialize-plan` · `materialize-plan` |
| `block-identity.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `get-week` · `workout-detail` |
| `build-coaching-context.ts` | — nothing bundles it |
| `canonicalize.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `auto-attach-planned` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `coach-payload-version.ts` | `coach` |
| `combined-schedule-prefs.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` |
| `connection-health.ts` | `bright-service` · `calendar-sync` · `fetch-strava-route` · `garmin-webhook-activities` · `import-garmin-history` · `import-strava-history` · `intervals-connect-key` · `intervals-oauth` · `send-workout-to-garmin` · `share-strength-to-strava` · `strava-token-exchange` · `strava-webhook` · `swift-task` |
| `core-detect.ts` | `detect-cores` |
| `core-effort.ts` | `match-cores` |
| `core-match.ts` | `detect-cores` · `match-cores` |
| `core-verdict.ts` | `compute-core-verdict` · `workout-detail` |
| `course-segmentation.ts` | `athletic-record` · `coach` · `course-detail` · `course-strategy` · `course-upload` |
| `course-strategy-build.ts` | `course-strategy` |
| `course-strategy-helpers.ts` | `athletic-record` · `coach` · `course-detail` · `course-strategy` |
| `cross-domain-carryover.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` |
| `cross-sport-key-scrub.ts` | `analyze-cycling-workout` |
| `cycling-goal-race-completion.ts` | `analyze-cycling-workout` |
| `day-order.ts` | `get-week` · `plan-overview` |
| `day-seq.ts` | `activate-plan` · `coach` · `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `demand-mapping.ts` | `readiness` · `workout-detail` |
| `display-format.ts` | `check-feedback-needed` · `endurance-checkpoint` · `export-data` · `gear-list` · `get-arc-context` · `get-week` · `materialize-plan` · `workout-detail` |
| `easy-hr.ts` | `analyze-running-workout` · `compute-facts` · `compute-session-boom` · `compute-workout-analysis` · `export-data` · `learn-fitness-profile` · `save-baselines` |
| `efficiency-index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-core-verdict` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `effort-words.ts` | `check-feedback-needed` · `workout-detail` |
| `empty-day-line.ts` | `create-goal-and-materialize-plan` · `get-week` · `plan-overview` |
| `end-plan-core.ts` | `complete-race` · `end-plan` |
| `execution-score.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `exercise-registry-lookup.ts` | `compute-facts` |
| `fatigue-weights.ts` | `coach` · `workout-detail` |
| `fetch-race-weather-archive.ts` | `course-strategy` |
| `fitness-fatigue.ts` | `coach` |
| `gap.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `geohash.ts` | `backfill-routes` · `compute-facts` |
| `goal-context.ts` | `coach` |
| `goal-finish-from-workouts.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `goal-race-completion.ts` | `analyze-running-workout` |
| `gps-points.ts` | `detect-cores` · `match-cores` |
| `group-ride-route-snapshot.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `fetch-strava-route` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `heat-adjust.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-core-verdict` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `hr-drift-halves.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `hr-plausibility.ts` | `compute-facts` |
| `hr-quality.ts` | `coach` |
| `indoor-session.ts` | `coach` · `compute-workout-analysis` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` · `workout-detail` |
| `infer-race-course-leg.ts` | `course-upload` |
| `infer-training-fitness.ts` | `create-goal-and-materialize-plan` |
| `intent-title.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `invalidate-user-training-cache.ts` | `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` |
| `is-executed.ts` | `get-week` · `workout-detail` |
| `jobs.ts` | `ingest-activity` · `run-jobs` |
| `last-weight-by-movement.ts` | `materialize-plan` |
| `limiter-sport.ts` | `create-goal-and-materialize-plan` · `get-arc-context` |
| `live-cue.ts` | `analyze-running-workout` · `materialize-plan` |
| `load-status-reconcile.ts` | `coach` |
| `local-date.ts` | `calendar-sync` · `compute-snapshot` · `endurance-checkpoint` · `get-week` · `intervals-connect-key` · `intervals-oauth` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `longitudinal-signals.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `match-goal-for-course.ts` | `course-strategy` · `course-upload` |
| `middle-half.ts` | `workout-detail` |
| `mobility-sets.ts` | `materialize-plan` |
| `moved-from.ts` | `activate-plan` · `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `moving-seconds.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-workout-summary` · `get-week` · `workout-detail` |
| `novel-movements.ts` | `coach` |
| `off-plan-banner.ts` | `coach` |
| `pace-benchmark.ts` | `create-goal-and-materialize-plan` · `get-arc-context` |
| `parse-local-date.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `generate-combined-plan` · `recompute-athlete-memory` |
| `per-domain-load.ts` | `coach` |
| `plan-context.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `workout-detail` |
| `plan-generation-trade-offs.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `plan-line.ts` | `coach` · `get-week` · `workout-detail` |
| `plan-overview.ts` | `get-week` · `plan-overview` |
| `plan-phase.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `plan-overview` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `plan-refresh.ts` | `endurance-checkpoint` · `get-week` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `plan-week.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `plan-overview` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `planned-duration-label.ts` | `get-week` · `workout-detail` |
| `planned-duration.ts` | `analyze-cycling-workout` · `auto-attach-planned` · `coach` · `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `mark-planned-complete` · `materialize-plan` · `plan-overview` · `rematerialize-standing-block` · `swap-session` · `workout-detail` |
| `planned-narrative.ts` | `materialize-plan` |
| `planned-step-lines.ts` | `materialize-plan` |
| `planning-context.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `post-import-athlete-pipeline.ts` | `import-strava-history` · `post-import-athlete-pipeline` · `strava-webhook` |
| `prior-similar-race-coach.ts` | — nothing bundles it |
| `provider-deregister.ts` | `delete-account` · `disconnect-connection` · `garmin-webhook-user` · `intervals-oauth` · `strava-webhook` |
| `race-day-workout.ts` | `coach` · `complete-race` |
| `race-debrief.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `race-feedback.ts` | `analyze-running-workout` |
| `race-finish-seconds.ts` | `athletic-record` · `coach` · `complete-race` |
| `race-projections.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `race-research-cache.ts` | — nothing bundles it |
| `readiness-scale.ts` | `analyze-strength-workout` |
| `readiness-thresholds.ts` | `readiness` · `workout-detail` |
| `readiness-types.ts` | `ingest-phone-workout` · `readiness` · `workout-detail` |
| `readiness.ts` | `readiness` · `workout-detail` |
| `recompute-goal-race-projections.ts` | `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `strava-webhook` |
| `require-user.ts` | `adapt-plan` · `athletic-record` · `auto-attach-planned` · `backfill-facts` · `backfill-routes` · `calculate-workload` · `coach` · `compute-core-verdict` · `compute-session-boom` · `compute-snapshot` · `delete-account` · `delete-goal` · `detach-planned` · `detect-cores` · `disconnect-connection` · `endurance-checkpoint` · `export-data` · `fetch-strava-route` · `gear-list` · `generate-combined-plan` · `get-arc-context` · `import-fit-file` · `import-strava-history` · `intervals-activity-probe` · `intervals-connect-key` · `intervals-oauth` · `learn-fitness-profile` · `mark-planned-complete` · `match-cores` · `plan-overview` · `planning-context` · `process-workouts-batch` · `readiness` · `recompute-athlete-memory` · `recompute-workout` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `resume-plan` · `save-baseline-test` · `save-baselines` · `save-imported-workout` · `share-strength-to-strava` · `strength-test-session` · `swap-list` · `swap-session` · `sweep-user-history` · `sweep-week` · `warm-athletic-record` · `weekly-workload` |
| `resolve-goal-target-time.ts` | `coach` · `course-detail` · `course-strategy` |
| `resolve-server-predicted-finish.ts` | `coach` · `course-detail` · `course-strategy` |
| `ride-easy-hr.ts` | `analyze-cycling-workout` |
| `ride-power.ts` | `analyze-cycling-workout` · `calendar-sync` · `compute-workout-analysis` · `compute-workout-summary` · `ingest-phone-workout` · `materialize-plan` · `send-workout-to-garmin` · `workout-detail` |
| `riegel.ts` | `analyze-running-workout` · `workout-detail` |
| `route-intelligence.ts` | `backfill-routes` · `compute-facts` |
| `route-match.ts` | `backfill-routes` · `compute-facts` |
| `run-pace.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `run-warmup-easy.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` |
| `schedule-session-constraints.ts` | `adapt-plan` · `coach` · `create-goal-and-materialize-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `session-load.ts` | `compute-facts` |
| `session-title.ts` | `calendar-sync` · `coach` · `export-data` · `get-week` · `send-workout-to-garmin` |
| `stack-tagging-validator.ts` | `generate-combined-plan` |
| `strava-access-token.ts` | `fetch-strava-route` · `share-strength-to-strava` |
| `strength-equipment-tier.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` · `get-arc-context` · `materialize-plan` |
| `strength-profiles.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `strength-session-minutes.ts` | `get-week` · `workout-detail` |
| `strength-session-types.ts` | `coach` |
| `strength-test-key.ts` | `analyze-strength-workout` · `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `save-baseline-test` · `strength-test-session` · `swap-session` · `validate-reschedule` |
| `swim-cutoff-pressure.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `swim-program-templates.ts` | `generate-combined-plan` |
| `swim-sessions.ts` | `coach` |
| `time-under-ceiling.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `token-crypto.ts` | `calendar-sync` · `intervals-activity-probe` · `intervals-connect-key` · `intervals-oauth` |
| `token-parser.ts` | `analyze-running-workout` · `compute-workout-analysis` |
| `training-intent.ts` | `create-goal-and-materialize-plan` |
| `tri-optimizer-prefs.ts` | `create-goal-and-materialize-plan` |
| `tri-preferred-days-sanity.ts` | `create-goal-and-materialize-plan` |
| `unattached-planned.ts` | `auto-attach-planned` · `detach-planned` · `workout-detail` |
| `webhook-secret.ts` | `garmin-webhook-activities` · `garmin-webhook-user` |
| `week-conflict-resolver.ts` | `generate-combined-plan` |
| `week-one-summary.ts` | `create-goal-and-materialize-plan` |
| `week-optimizer.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-triathlon-plan` |
| `week-solver.ts` | `adapt-plan` · `generate-run-plan` |
| `week-time-line.ts` | `coach` |
| `weeks-until-race.ts` | `create-goal-and-materialize-plan` · `get-arc-context` |
| `workload.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `workout-list-select.ts` | `get-week` |

### `supabase/functions/_shared/accessory-dosing/` — 5 files · anything in it → 29 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `dose.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `ledger.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `muscles.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `performed-ledger.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/_shared/athlete-snapshot/` — 6 files · anything in it → 2 functions

`coach` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `adaptation.ts` | `coach` |
| `body-response.ts` | `coach` · `workout-detail` |
| `daily-ledger.ts` | `coach` · `workout-detail` |
| `identity.ts` | `coach` |
| `index.ts` | `coach` |
| `types.ts` | `coach` · `workout-detail` |

### `supabase/functions/_shared/athletic-record/` — 4 files · anything in it → 8 functions

`athletic-record` · `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` · `warm-athletic-record`

| touch this file | redeploy these |
|---|---|
| `build.ts` | `athletic-record` · `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` · `warm-athletic-record` |
| `display.ts` | `athletic-record` · `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` · `warm-athletic-record` |
| `rank.ts` | `athletic-record` · `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` · `warm-athletic-record` |
| `totals.ts` | `athletic-record` · `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` · `run-jobs` · `warm-athletic-record` |

### `supabase/functions/_shared/block-adaptation/` — 1 file · anything in it → 1 function

`coach`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` |

### `supabase/functions/_shared/block-analysis/` — 8 files · anything in it → 0 functions

(nothing bundles this folder)

| touch this file | redeploy these |
|---|---|
| `calculate-adherence.ts` | — nothing bundles it |
| `calculate-trends.ts` | — nothing bundles it |
| `calculate-week-summary.ts` | — nothing bundles it |
| `calculate-workout-quality.ts` | — nothing bundles it |
| `data-quality.ts` | — nothing bundles it |
| `generate-focus-areas.ts` | — nothing bundles it |
| `index.ts` | — nothing bundles it |
| `types.ts` | — nothing bundles it |

### `supabase/functions/_shared/calendar-sync/` — 2 files · anything in it → 1 function

`calendar-sync`

| touch this file | redeploy these |
|---|---|
| `plan.ts` | `calendar-sync` |
| `run.ts` | `calendar-sync` |

### `supabase/functions/_shared/cycling-v1/` — 10 files · anything in it → 2 functions

`analyze-cycling-workout` · `compute-workout-analysis`

| touch this file | redeploy these |
|---|---|
| `analysis-mode.ts` | — nothing bundles it |
| `build.ts` | `analyze-cycling-workout` |
| `cross-workout-queries.ts` | `analyze-cycling-workout` |
| `cross-workout-types.ts` | `analyze-cycling-workout` |
| `flags.ts` | `analyze-cycling-workout` |
| `np-trend.ts` | `analyze-cycling-workout` |
| `ride-physiology.ts` | `analyze-cycling-workout` · `compute-workout-analysis` |
| `segments.ts` | `analyze-cycling-workout` |
| `types.ts` | `analyze-cycling-workout` |
| `utils.ts` | `analyze-cycling-workout` |

### `supabase/functions/_shared/endurance-library/` — 7 files · anything in it → 31 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `anchors.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `classification.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `generate.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `source-rules.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `step-words.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `types.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/_shared/endurance/` — 6 files · anything in it → 6 functions

`compute-workout-analysis` · `export-data` · `generate-run-plan` · `learn-fitness-profile` · `materialize-plan` · `save-baselines`

| touch this file | redeploy these |
|---|---|
| `display-zones.ts` | `compute-workout-analysis` · `export-data` · `save-baselines` |
| `distribution.ts` | `generate-run-plan` |
| `hr-zones.ts` | `generate-run-plan` · `learn-fitness-profile` · `materialize-plan` · `save-baselines` |
| `index.ts` | `generate-run-plan` |
| `pace-zones.ts` | `generate-run-plan` |
| `volume.ts` | `generate-run-plan` |

### `supabase/functions/_shared/fact-packet/` — 10 files · anything in it → 6 functions

`analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `get-week` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `build.ts` | `analyze-running-workout` |
| `execution-honesty.ts` | `analyze-running-workout` |
| `flags.ts` | `analyze-running-workout` |
| `limiter.ts` | `analyze-running-workout` |
| `pace-at-hr-direction.ts` | `analyze-running-workout` |
| `pace-resolution.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `get-week` · `workout-detail` |
| `queries.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `get-week` · `workout-detail` |
| `stimulus.ts` | `analyze-running-workout` |
| `types.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `get-week` · `workout-detail` |
| `utils.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `get-week` · `workout-detail` |

### `supabase/functions/_shared/garmin/` — 3 files · anything in it → 2 functions

`calendar-sync` · `send-workout-to-garmin`

| touch this file | redeploy these |
|---|---|
| `convert-workout.ts` | `calendar-sync` · `send-workout-to-garmin` |
| `prepare.ts` | `calendar-sync` · `send-workout-to-garmin` |
| `training-api.ts` | `calendar-sync` · `send-workout-to-garmin` |

### `supabase/functions/_shared/goal-predictor/` — 1 file · anything in it → 1 function

`coach`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` |

### `supabase/functions/_shared/insights/` — 5 files · anything in it → 4 functions

`analyze-cycling-workout` · `analyze-running-workout` · `coach` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `bike-insights.ts` | `analyze-cycling-workout` |
| `coach-week-insights.ts` | `coach` |
| `cross-training-read.ts` | `coach` |
| `run-insights.ts` | `analyze-running-workout` · `workout-detail` |
| `strength-protocol-read.ts` | `coach` |

### `supabase/functions/_shared/intervals/` — 4 files · anything in it → 3 functions

`calendar-sync` · `intervals-connect-key` · `intervals-oauth`

| touch this file | redeploy these |
|---|---|
| `client.ts` | `calendar-sync` · `intervals-connect-key` · `intervals-oauth` |
| `connection.ts` | `intervals-connect-key` · `intervals-oauth` |
| `oauth.ts` | `intervals-oauth` |
| `serialize.ts` | `calendar-sync` |

### `supabase/functions/_shared/marathon-readiness/` — 1 file · anything in it → 1 function

`coach`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` |

### `supabase/functions/_shared/move-check/` — 2 files · anything in it → 9 functions

`coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `lost-day.ts` | `place-lost-day` |

### `supabase/functions/_shared/narrative-core/adapters/` — 5 files · anything in it → 1 function

`analyze-cycling-workout`

| touch this file | redeploy these |
|---|---|
| `coach.ts` | `analyze-cycling-workout` |
| `ride.ts` | `analyze-cycling-workout` |
| `run.ts` | `analyze-cycling-workout` |
| `strength.ts` | `analyze-cycling-workout` |
| `swim.ts` | `analyze-cycling-workout` |

### `supabase/functions/_shared/narrative-core/` — 5 files · anything in it → 1 function

`analyze-cycling-workout`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `analyze-cycling-workout` |
| `orchestrate.ts` | `analyze-cycling-workout` |
| `scaffold.ts` | `analyze-cycling-workout` |
| `types.ts` | `analyze-cycling-workout` |
| `validate.ts` | `analyze-cycling-workout` |

### `supabase/functions/_shared/periodization/` — 1 file · anything in it → 2 functions

`adapt-plan` · `generate-run-plan`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `adapt-plan` · `generate-run-plan` |

### `supabase/functions/_shared/plan-tokens/` — 1 file · anything in it → 33 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `quality-work.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/_shared/race-readiness/` — 2 files · anything in it → 11 functions

`coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `strava-webhook`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `strava-webhook` |
| `projection-facts.ts` | `coach` |

### `supabase/functions/_shared/response-model/` — 8 files · anything in it → 1 function

`coach`

| touch this file | redeploy these |
|---|---|
| `block.ts` | `coach` |
| `cross-domain.ts` | `coach` |
| `index.ts` | `coach` |
| `loaded-legs.ts` | `coach` |
| `readiness-receipts.ts` | `coach` |
| `readiness-state.ts` | `coach` |
| `types.ts` | `coach` |
| `weekly.ts` | `coach` |

### `supabase/functions/_shared/run/` — 1 file · anything in it → 2 functions

`compute-facts` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `run-scalars.ts` | `compute-facts` · `workout-detail` |

### `supabase/functions/_shared/session-boom/` — 3 files · anything in it → 2 functions

`compute-session-boom` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `compute.ts` | `compute-session-boom` |
| `line.ts` | `compute-session-boom` |
| `types.ts` | `compute-session-boom` · `workout-detail` |

### `supabase/functions/_shared/session-detail/` — 15 files · anything in it → 5 functions

`analyze-running-workout` · `compute-session-boom` · `compute-snapshot` · `ingest-phone-workout` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `arc-performance-bridge.ts` | `ingest-phone-workout` · `workout-detail` |
| `build.ts` | `workout-detail` |
| `drift-pct.ts` | `compute-session-boom` · `compute-snapshot` · `workout-detail` |
| `forward-context.ts` | `workout-detail` |
| `index.ts` | — nothing bundles it |
| `interval-compare.ts` | `ingest-phone-workout` · `workout-detail` |
| `off-prescription.ts` | `workout-detail` |
| `race-readiness.ts` | `workout-detail` |
| `readiness-load-context.ts` | `workout-detail` |
| `session-steadiness.ts` | `analyze-running-workout` · `compute-session-boom` · `compute-snapshot` · `workout-detail` |
| `strength-slots.ts` | `workout-detail` |
| `swim-plan-share.ts` | `workout-detail` |
| `types.ts` | `ingest-phone-workout` · `workout-detail` |
| `vt1-bout.ts` | `compute-session-boom` · `compute-snapshot` · `workout-detail` |
| `vt1-window-drift.ts` | `compute-session-boom` · `compute-snapshot` · `workout-detail` |

### `supabase/functions/_shared/session-swap/` — 8 files · anything in it → 6 functions

`coach` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `rematerialize-standing-block` · `swap-session`

| touch this file | redeploy these |
|---|---|
| `copy.ts` | `swap-session` |
| `library-session.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `lift-swap.ts` | `materialize-plan` |
| `plan-adjustments.ts` | `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `resolve-write.ts` | `swap-session` |
| `sheet.ts` | `swap-session` |
| `swap.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `rematerialize-standing-block` · `swap-session` |
| `workout-choice.ts` | `materialize-plan` · `rematerialize-standing-block` · `swap-session` |

### `supabase/functions/_shared/standing-plan/` — 31 files · anything in it → 36 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `calendar-sync` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `plan-overview` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baseline-test` · `send-workout-to-garmin` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `accessory-picks.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `compose.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `day-map.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `demonstrated-history.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `endurance-checkpoint.ts` | `endurance-checkpoint` |
| `endurance-ledger.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `family-lines.ts` | `calendar-sync` · `coach` · `compute-session-boom` · `create-goal-and-materialize-plan` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `send-workout-to-garmin` · `swap-session` · `validate-reschedule` |
| `frame-resolver.ts` | `create-goal-and-materialize-plan` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `frames.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `golden-block.ts` | — nothing bundles it |
| `index.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `intake-readout.ts` | `generate-strength-plan` |
| `me-history.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `plan-row.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `plyo.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `progression.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `protocol-id.ts` | `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `restate.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `session-vocabulary.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `setup-copy.ts` | `generate-strength-plan` · `get-arc-context` · `rematerialize-standing-block` |
| `setup-readout.ts` | `get-arc-context` |
| `spacing-line.ts` | `get-week` · `plan-overview` |
| `sport-slots.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `swap-groups.ts` | `swap-list` |
| `test-skip.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `volume-bounds.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `warmup.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `strength-test-session` · `swap-session` · `validate-reschedule` |
| `week-arrangement.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `week-conflicts.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `week-ledger.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `working-number.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baseline-test` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/_shared/state-trend/` — 27 files · anything in it → 33 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `athletic-record` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `adherence.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `assemble.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `baseline-derive.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `bike-fitness.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `bike.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `capacity-resolver.ts` | `analyze-cycling-workout` · `athletic-record` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `learn-fitness-profile` · `materialize-plan` · `save-baselines` · `workout-detail` |
| `classify.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `deload.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `discipline.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `fold-lift-slots.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `headline.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `index.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `load-floor.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `logged-sets.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `position-in-range.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `posture.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `reconcile.ts` | `analyze-cycling-workout` · `athletic-record` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `export-data` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `learn-fitness-profile` · `materialize-plan` · `save-baselines` · `workout-detail` |
| `run.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `severity.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `state-screen-print.ts` | — nothing bundles it |
| `strength.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `swim.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `thresholds.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `trend-fit.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `types.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `week-accent.ts` | `analyze-cycling-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `zones.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |

### `supabase/functions/_shared/strava/` — 1 file · anything in it → 1 function

`share-strength-to-strava`

| touch this file | redeploy these |
|---|---|
| `strength-description.ts` | `share-strength-to-strava` |

### `supabase/functions/_shared/strength-grid/` — 4 files · anything in it → 32 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `grid.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `intents.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `taxonomy.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/_shared/strength/` — 10 files · anything in it → 39 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `auto-attach-planned` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `all-out-set.ts` | `coach` · `compute-snapshot` · `workout-detail` |
| `match-exercises.ts` | `analyze-strength-workout` · `auto-attach-planned` · `workout-detail` |
| `performed-set.ts` | `analyze-strength-workout` · `share-strength-to-strava` |
| `rest-seconds.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `get-week` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `session-volume.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `export-data` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-baselines` · `share-strength-to-strava` · `strava-webhook` · `strength-test-session` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `shown-name.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `strength-display-lines.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `strength-test-session` · `swap-session` · `validate-reschedule` |
| `substitution-note.ts` | `analyze-strength-workout` |
| `test-session.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `strength-test-session` · `swap-session` · `validate-reschedule` |
| `trusted-reps.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `get-week` · `rematerialize-strength-block` · `workout-detail` |

### `supabase/functions/_shared/swim/` — 10 files · anything in it → 13 functions

`analyze-cycling-workout` · `analyze-running-workout` · `analyze-swim-workout` · `calendar-sync` · `coach` · `compute-facts` · `compute-session-boom` · `compute-workout-summary` · `get-week` · `learn-fitness-profile` · `materialize-plan` · `send-workout-to-garmin` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `planned-pool.ts` | `materialize-plan` · `workout-detail` |
| `pool-label.ts` | `workout-detail` |
| `resolve-pool-length.ts` | `analyze-swim-workout` · `compute-workout-summary` · `workout-detail` |
| `rest-norm.ts` | — nothing bundles it |
| `swim-css-learner.ts` | `learn-fitness-profile` |
| `swim-equipment.ts` | `compute-facts` · `workout-detail` |
| `swim-pace.ts` | `analyze-swim-workout` · `workout-detail` |
| `swim-plan-summary.ts` | `materialize-plan` |
| `swim-scalars.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `analyze-swim-workout` · `coach` · `compute-facts` · `compute-session-boom` · `compute-workout-summary` · `get-week` · `workout-detail` |
| `swim-step-equipment.ts` | `calendar-sync` · `materialize-plan` · `send-workout-to-garmin` |

### `supabase/functions/_shared/types/` — 1 file · anything in it → 0 functions

(nothing bundles this folder)

| touch this file | redeploy these |
|---|---|
| `computed-workout.ts` | — nothing bundles it |

### `supabase/functions/_shared/week-model/` — 4 files · anything in it → 9 functions

`coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule`

| touch this file | redeploy these |
|---|---|
| `fixture.ts` | — nothing bundles it |
| `model.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `resolve.ts` | `coach` · `compute-session-boom` · `endurance-checkpoint` · `generate-strength-plan` · `materialize-plan` · `place-lost-day` · `rematerialize-standing-block` · `swap-session` · `validate-reschedule` |
| `solver-adapter.ts` | — nothing bundles it |

### `supabase/functions/generate-combined-plan/` — 2 files · anything in it → 29 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `science.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `types.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |

### `supabase/functions/generate-run-plan/` — 3 files · anything in it → 31 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `effort-score.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-session-boom` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `ingest-phone-workout` · `learn-fitness-profile` · `materialize-plan` · `place-lost-day` · `planning-context` · `post-import-athlete-pipeline` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `save-baselines` · `strava-webhook` · `swap-list` · `swap-session` · `validate-reschedule` · `workout-detail` |
| `strength-overlay.ts` | `adapt-plan` · `generate-run-plan` |
| `types.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-run-plan` |

### `supabase/functions/import-fit-file/` — 1 file · anything in it → 2 functions

`import-fit-file` · `intervals-activity-probe`

| touch this file | redeploy these |
|---|---|
| `parse.ts` | `import-fit-file` · `intervals-activity-probe` |

### `supabase/functions/save-baseline-test/` — 1 file · anything in it → 4 functions

`analyze-strength-workout` · `materialize-plan` · `rematerialize-standing-block` · `save-baseline-test`

| touch this file | redeploy these |
|---|---|
| `pick.ts` | `analyze-strength-workout` · `materialize-plan` · `rematerialize-standing-block` · `save-baseline-test` |

### `supabase/functions/save-baselines/` — 2 files · anything in it → 3 functions

`export-data` · `learn-fitness-profile` · `save-baselines`

| touch this file | redeploy these |
|---|---|
| `derive.ts` | `learn-fitness-profile` · `save-baselines` |
| `zones.ts` | `export-data` · `save-baselines` |

### `supabase/functions/shared/strength-system/` — 8 files · anything in it → 5 functions

`adapt-plan` · `create-goal-and-materialize-plan` · `generate-run-plan` · `generate-strength-plan` · `rematerialize-strength-block`

| touch this file | redeploy these |
|---|---|
| `amrap-catch-up.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `rematerialize-strength-block` |
| `barbell-maxes.ts` | `create-goal-and-materialize-plan` · `generate-strength-plan` |
| `frequency-policy.ts` | `generate-run-plan` |
| `index.ts` | — nothing bundles it |
| `place-week.ts` | — nothing bundles it |
| `quality-session.ts` | — nothing bundles it |
| `strength-arc.ts` | `adapt-plan` · `generate-run-plan` |
| `strength-primary-plan.ts` | — nothing bundles it |

### `supabase/functions/shared/strength-system/loading/` — 3 files · anything in it → 9 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `get-week` · `rematerialize-strength-block` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `calibration.ts` | `rematerialize-strength-block` |
| `cycle-verdicts.ts` | `create-goal-and-materialize-plan` · `rematerialize-strength-block` |
| `wendler-531.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `get-week` · `rematerialize-strength-block` · `workout-detail` |

### `supabase/functions/shared/strength-system/placement/` — 5 files · anything in it → 2 functions

`adapt-plan` · `generate-run-plan`

| touch this file | redeploy these |
|---|---|
| `simple.ts` | — nothing bundles it |
| `solver.ts` | `adapt-plan` · `generate-run-plan` |
| `strategy.ts` | `adapt-plan` · `generate-run-plan` |
| `strength-slot-resolver.ts` | `adapt-plan` · `generate-run-plan` |
| `types.ts` | `adapt-plan` · `generate-run-plan` |

### `supabase/functions/shared/strength-system/protocols/` — 12 files · anything in it → 5 functions

`adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan`

| touch this file | redeploy these |
|---|---|
| `db-prescription.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `five-by-five.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `foundation-durability.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `intent-taxonomy.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `minimum-dose.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `performance-neural.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `selector.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `strength-focus-split.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `triathlon.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `triathlon_performance.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `types.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `upper-priority-hybrid.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |

### `supabase/lib/analysis/sensor-data/` — 1 file · anything in it → 2 functions

`analyze-running-workout` · `compute-workout-analysis`

| touch this file | redeploy these |
|---|---|
| `extractor.ts` | `analyze-running-workout` · `compute-workout-analysis` |

---

## 2. THE FRAMES — the programmes, as transcribed

### `strength_5k` — Strength + 5K

Source: Viada pp246-247 · 4 lifting days · weekly rate anchor: **0.0033333333333333335**

**standard column**

```
  day 1   ME: Upper            ME:primary · ME:primary · DE:secondary · HYP:focused · HYP:focused
                               endurance: run_mlss
  day 2   ME: Lower            ME:primary · ME:primary · DE:secondary · HYP:secondary
  day 3   (plyometrics)        —
                               endurance: run_near_threshold
  day 4   DE: Upper            DE:primary · DE:primary · HYP:secondary · HYP:focused
                               endurance: run_vt1
  day 5   DE: Lower            DE:primary · DE:primary · HYP:secondary · HYP:focused
  day 6   —                    —
                               endurance: run_lsd
  day 7   (rest)               —
```

**taper column**

```
  day 1   ME: Upper            ME:primary · DE:primary · HYP:focused
                               endurance: run_mlss
  day 2   ME: Lower            ME:primary · DE:primary · HYP:secondary
  day 3   (plyometrics)        —
                               endurance: run_near_threshold
  day 4   DE: Upper            DE:primary · DE:primary · HYP:focused
  day 5   DE: Lower            DE:primary · DE:primary · HYP:secondary
  day 6   —                    —
                               endurance: run_vt1
  day 7   (rest)               —
```

### `all_rounder` — The All Rounder

Source: Viada pp274-275 · 4 lifting days · weekly rate anchor: **ZERO — progression is earned, never scheduled**

**standard column**

```
  day 1   Upper body: Push     ME:primary · DE:secondary · HYP:braced · HYP:focused · HYP:focused · HYP:focused
                               endurance: run_mlss
  day 2   Lower body: Hinge    ME:primary · HYP:braced · HYP:braced · HYP:focused · DE:braced
                               endurance: ride_anaerobic
  day 3   (plyometrics)        —
                               endurance: run_near_threshold
  day 4   Upper body: Pull     ME:primary · DE:secondary · HYP:braced · HYP:focused · HYP:focused · HYP:focused
                               endurance: ride_endurance
  day 5   Lower body: Push     ME:primary · HYP:braced · HYP:braced · HYP:focused · SKILL:braced
  day 6   —                    —
                               endurance: run_lsd
  day 7   (rest)               —
```

**taper column**

```
  day 1   Upper body: Push     SKILL:primary · HYP:braced · HYP:focused · HYP:focused · HYP:focused
                               endurance: run_mlss
  day 2   Lower body: Hinge    DE:primary · HYP:focused · DE:braced
  day 3   (plyometrics)        —
                               endurance: run_vt1
  day 4   Upper body: Pull     SKILL:primary · HYP:braced · HYP:focused · HYP:focused · HYP:focused
                               endurance: ride_endurance
  day 5   Lower body: Push     DE:primary · HYP:focused · SKILL:braced
  day 6   —                    —
                               endurance: run_lsd
  day 7   (rest)               —
```

### `cycling_base` — Cycling: Base

Source: Viada pp278, 280-281 · 3 lifting days · weekly rate anchor: **ZERO — progression is earned, never scheduled**

**standard column**

```
  day 1   ME Upper             ME:primary · ME:primary · DE:secondary · HYP:focused · HYP:focused
                               endurance: ride_sweet_spot
  day 2   ME Lower             ME:primary · ME:primary · DE:secondary · HYP:secondary
                               endurance: ride_endurance
  day 3   (plyometrics)        —
                               endurance: ride_vo2 · ride_sweet_spot
  day 4   DE: Full             DE:primary · DE:primary · DE:primary · DE:primary · SKILL:carry
  day 5   —                    —
                               endurance: ride_endurance · ride_sprints
  day 6   —                    —
                               endurance: ride_endurance
  day 7   (rest)               —
```

**taper column**

```
  day 1   ME Upper             ME:primary · ME:primary · DE:secondary · HYP:focused · HYP:focused
                               endurance: ride_sweet_spot
  day 2   ME Lower             ME:primary · ME:primary · HYP:secondary
                               endurance: ride_endurance
  day 3   (plyometrics)        —
                               endurance: ride_vo2
  day 4   DE: Full             DE:primary · DE:primary · DE:primary
  day 5   —                    —
                               endurance: ride_sprints
  day 6   —                    —
                               endurance: ride_endurance
  day 7   (rest)               —
```

---

## 3. THE PICKER — which cells each programme draws

⚠️ A cell is drawn when the frame carries an accessory slot the pick can fill. **`core` is
the deliberate exception**: neither page prints a core row, and it is offered anyway, opt-in.

**`strength_5k`** — 9 cells

- `db_press` — Press variation
- `iso_push` — Push isolation
- `iso_pull_a` — Pull isolation
- `iso_pull_b` — Pull isolation
- `hinge_lower` — Hinge variation
- `single_leg_a` — Leg variation
- `single_leg_b` — Leg variation
- `quad_iso` — Leg isolation
- `core` — Core  ⚠️ names no printed cell (opt-in addition)

**`all_rounder`** — 15 cells

- `braced_push` — Machine press
- `ar_arms_push_1` — Arms superset · push
- `ar_arms_pull_1` — Arms superset · pull
- `ar_push_iso_1` — Push isolation
- `braced_hinge` — Back extension
- `braced_leg` — Leg press
- `ham_iso` — Hamstring isolation
- `braced_pull` — Machine pull
- `ar_arms_push_4` — Arms superset · push
- `ar_arms_pull_4` — Arms superset · pull
- `ar_pull_iso_4` — Pull isolation
- `quad_iso` — Leg isolation
- `core` — Core  ⚠️ names no printed cell (opt-in addition)
- `core_2` — Core 2  ⚠️ names no printed cell (opt-in addition)
- `core_3` — Core 3  ⚠️ names no printed cell (opt-in addition)

**`cycling_base`** — 9 cells

- `db_press` — Press variation  ⚠️ names no printed cell (opt-in addition)
- `iso_push` — Push isolation
- `iso_pull_a` — Pull isolation
- `iso_pull_b` — Pull isolation  ⚠️ names no printed cell (opt-in addition)
- `hinge_lower` — Hinge variation
- `single_leg_a` — Leg variation
- `single_leg_b` — Leg variation  ⚠️ names no printed cell (opt-in addition)
- `quad_iso` — Leg isolation  ⚠️ names no printed cell (opt-in addition)
- `carry` — Carry

---

## 4. EDGE FUNCTIONS

107 functions with an entry point:

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `analyze-user-profile` · `athletic-record` · `auto-attach-planned` · `backfill-adaptation-metrics` · `backfill-facts` · `backfill-power-curves` · `backfill-routes` · `backfill-week-summaries` · `bright-service` · `bulk-reanalyze-workouts` · `calculate-workload` · `calendar-sync` · `check-feedback-needed` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-session-boom` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `course-upload` · `create-goal-and-materialize-plan` · `delete-account` · `delete-goal` · `delete-plan` · `detach-planned` · `detect-cores` · `disconnect-connection` · `dismiss-feedback` · `end-plan` · `endurance-checkpoint` · `enrich-history` · `ensure-planned-ready` · `export-data` · `fetch-strava-route` · `garmin-webhook-activities` · `garmin-webhook-user` · `gear-list` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `get-week` · `import-connect-history` · `import-fit-file` · `import-garmin-history` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `intervals-activity-probe` · `intervals-connect-key` · `intervals-oauth` · `learn-fitness-profile` · `mark-planned-complete` · `match-cores` · `materialize-plan` · `notify-admin-signup` · `pause-plan` · `place-lost-day` · `plan-overview` · `planning-context` · `post-import-athlete-pipeline` · `process-workouts-batch` · `readiness` · `reassociate-workouts` · `recompute-athlete-memory` · `recompute-workout` · `refresh-goal-race-projections` · `reingest-activity` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `restore-gps-track` · `resume-plan` · `run-jobs` · `save-baseline-test` · `save-baselines` · `save-imported-workout` · `save-location` · `send-workout-to-garmin` · `share-strength-to-strava` · `strava-token-exchange` · `strava-webhook` · `strava-webhook-manager` · `strength-test-session` · `swap-list` · `swap-session` · `sweep-user-history` · `sweep-week` · `swift-task` · `swim-activity-details` · `validate-reschedule` · `warm-athletic-record` · `weekly-workload` · `workout-detail`
