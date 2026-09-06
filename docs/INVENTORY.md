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

### `src/lib/` — 27 files · anything in it → 41 functions

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `arc-setup-chat` · `auto-attach-planned` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `save-imported-workout` · `send-workout-to-garmin` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `assistance-catalog.ts` | `generate-strength-plan` |
| `assistance-slot.ts` | `analyze-strength-workout` · `auto-attach-planned` |
| `band-assistance.ts` | `activate-plan` · `analyze-strength-workout` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `compute-facts` · `compute-snapshot` · `materialize-plan` · `workout-detail` |
| `bar-types.ts` | `activate-plan` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `compute-facts` · `materialize-plan` · `workout-detail` |
| `bike-ftp-estimator.ts` | `compute-workout-analysis` · `learn-fitness-profile` |
| `estimate-1rm.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `save-baseline-test` · `strava-webhook` · `workout-detail` |
| `exercise-config.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `arc-setup-chat` · `auto-attach-planned` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `resolve-exercise-weight` · `strava-webhook` · `workout-detail` |
| `exercise-role.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `arc-setup-chat` · `auto-attach-planned` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `friel-zones.ts` | `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `learn-fitness-profile` · `save-imported-workout` |
| `lift-slots.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `maintenance-volume-band.ts` | `create-goal-and-materialize-plan` · `generate-strength-plan` |
| `normalize-strength-set.ts` | `get-week` · `workout-detail` |
| `pullup-progression.ts` | `compute-snapshot` |
| `resolve-current-5k-pace.ts` | `analyze-running-workout` · `coach` · `compute-workout-analysis` · `course-detail` · `generate-strength-plan` · `materialize-plan` |
| `resolve-current-ftp.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `send-workout-to-garmin` · `strava-webhook` · `workout-detail` |
| `resolve-current-lthr.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `calculate-workload` · `coach` · `compute-adaptation-metrics` · `compute-facts` · `compute-workout-analysis` · `endurance-checkpoint` · `generate-run-plan` · `learn-fitness-profile` · `materialize-plan` |
| `resolve-current-max-hr.ts` | `analyze-running-workout` · `compute-adaptation-metrics` · `compute-workout-analysis` · `generate-run-plan` |
| `resolve-current-run-pace.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `run-critical-speed.ts` | `compute-workout-analysis` · `learn-fitness-profile` |
| `run-paces-from-threshold.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `run-threshold-from-easy.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `run-volume-tables.ts` | `create-goal-and-materialize-plan` · `generate-run-plan` |
| `session-frequency-defaults.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `strength-focus-copy.ts` | `compute-facts` |
| `strength-gear.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `strength-logging-mode.ts` | `activate-plan` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `compute-facts` · `materialize-plan` · `workout-detail` |
| `tracked-max-lifts.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |

### `src/lib/plan-tokens/` — 1 file · anything in it → 3 functions

`generate-combined-plan` · `generate-triathlon-plan` · `materialize-plan`

| touch this file | redeploy these |
|---|---|
| `swim-drill-tokens.ts` | `generate-combined-plan` · `generate-triathlon-plan` · `materialize-plan` |

### `supabase/functions/_shared/` — 108 files · anything in it → 57 functions

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `arc-setup-chat` · `auto-attach-planned` · `backfill-planned-workload` · `backfill-routes` · `backfill-strength-load` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `course-upload` · `create-goal-and-materialize-plan` · `delete-plan` · `detach-planned` · `detect-cores` · `disconnect-connection` · `end-plan` · `endurance-checkpoint` · `fetch-strava-route` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `ingest-activity` · `learn-fitness-profile` · `match-cores` · `materialize-plan` · `planning-context` · `readiness` · `recompute-athlete-memory` · `recompute-workout` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `share-strength-to-strava` · `strava-webhook` · `sweep-user-history` · `sweep-week` · `weekly-workload` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `absorption.ts` | `coach` |
| `acwr-state.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-facts` · `compute-snapshot` · `workout-detail` |
| `acwr.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-facts` · `compute-snapshot` · `workout-detail` |
| `adherence-plan.ts` | `coach` |
| `analyze-routing.ts` | `auto-attach-planned` · `recompute-workout` |
| `arc-context.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `arc-narrative-ai-appendix.ts` | — nothing bundles it |
| `arc-narrative-state.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `arc-setup-prompt.ts` | `arc-setup-chat` |
| `arc-setup-schedule-rules.ts` | `arc-setup-chat` |
| `athlete-identity-inference.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `athlete-memory.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-run-plan` |
| `athlete-snapshot.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `materialize-plan` |
| `athlete-timezone.ts` | `backfill-strength-load` · `compute-snapshot` |
| `athlete-weekly-intent.ts` | `create-goal-and-materialize-plan` · `generate-strength-plan` |
| `auto-complete-goals-from-workouts.ts` | `import-strava-history` · `strava-webhook` |
| `block-identity.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `get-week` · `workout-detail` |
| `build-coaching-context.ts` | — nothing bundles it |
| `canonicalize.ts` | `activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `arc-setup-chat` · `auto-attach-planned` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `combined-schedule-prefs.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` |
| `core-detect.ts` | `detect-cores` |
| `core-effort.ts` | `match-cores` |
| `core-match.ts` | `detect-cores` · `match-cores` |
| `core-verdict.ts` | `compute-core-verdict` · `workout-detail` |
| `course-segmentation.ts` | `coach` · `course-detail` · `course-strategy` · `course-upload` |
| `course-strategy-helpers.ts` | `coach` · `course-detail` · `course-strategy` |
| `cross-domain-carryover.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `analyze-swim-workout` · `coach` |
| `cross-sport-key-scrub.ts` | `analyze-cycling-workout` |
| `cycling-goal-race-completion.ts` | `analyze-cycling-workout` |
| `demand-mapping.ts` | `readiness` · `workout-detail` |
| `easy-hr.ts` | `analyze-running-workout` · `compute-facts` · `compute-workout-analysis` · `learn-fitness-profile` |
| `efficiency-index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `end-plan-core.ts` | `complete-race` · `end-plan` |
| `exercise-registry-lookup.ts` | `compute-facts` |
| `fatigue-weights.ts` | `coach` · `workout-detail` |
| `fetch-race-weather-archive.ts` | `course-strategy` |
| `fitness-fatigue.ts` | `coach` |
| `gap.ts` | `analyze-running-workout` · `compute-workout-analysis` · `compute-workout-summary` · `ingest-activity` |
| `geohash.ts` | `backfill-routes` · `compute-facts` |
| `goal-context.ts` | `coach` |
| `goal-finish-from-workouts.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `goal-race-completion.ts` | `analyze-running-workout` |
| `gps-points.ts` | `detect-cores` · `match-cores` |
| `group-ride-route-snapshot.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `fetch-strava-route` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `heat-adjust.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `hr-drift-halves.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `hr-plausibility.ts` | `compute-facts` |
| `hr-quality.ts` | `coach` |
| `infer-race-course-leg.ts` | `course-upload` |
| `infer-training-fitness.ts` | `create-goal-and-materialize-plan` |
| `invalidate-user-training-cache.ts` | `create-goal-and-materialize-plan` · `delete-plan` · `generate-combined-plan` · `ingest-activity` · `recompute-workout` |
| `last-weight-by-movement.ts` | `backfill-strength-load` · `materialize-plan` |
| `llm-arc-setup.ts` | `arc-setup-chat` |
| `llm.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `coach` · `course-strategy` · `workout-detail` |
| `load-status-reconcile.ts` | `coach` |
| `local-date.ts` | `compute-snapshot` |
| `longitudinal-signals.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `match-goal-for-course.ts` | `course-strategy` · `course-upload` |
| `novel-movements.ts` | `coach` |
| `off-plan-banner.ts` | `coach` |
| `parse-local-date.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `generate-combined-plan` · `recompute-athlete-memory` |
| `per-domain-load.ts` | `coach` |
| `plan-context.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `workout-detail` |
| `plan-generation-trade-offs.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `plan-phase.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `plan-week.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `rematerialize-strength-block` · `strava-webhook` · `workout-detail` |
| `planned-duration.ts` | `analyze-cycling-workout` · `auto-attach-planned` · `workout-detail` |
| `planning-context.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `post-import-athlete-pipeline.ts` | `import-strava-history` · `strava-webhook` |
| `prior-similar-race-coach.ts` | `arc-setup-chat` · `coach` |
| `race-debrief.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `race-feedback.ts` | `analyze-running-workout` |
| `race-finish-seconds.ts` | `complete-race` |
| `race-narrative.ts` | `workout-detail` |
| `race-projections.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `race-research-cache.ts` | `arc-setup-chat` |
| `readiness-scale.ts` | `analyze-strength-workout` |
| `readiness-thresholds.ts` | `readiness` · `workout-detail` |
| `readiness-types.ts` | `readiness` · `workout-detail` |
| `readiness.ts` | `readiness` · `workout-detail` |
| `recompute-goal-race-projections.ts` | `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `refresh-goal-race-projections` · `strava-webhook` |
| `require-user.ts` | `adapt-plan` · `auto-attach-planned` · `backfill-strength-load` · `calculate-workload` · `detach-planned` · `disconnect-connection` · `endurance-checkpoint` · `fetch-strava-route` · `get-arc-context` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `save-baseline-test` · `share-strength-to-strava` · `sweep-user-history` · `sweep-week` · `weekly-workload` |
| `resolve-goal-target-time.ts` | `coach` · `course-detail` · `course-strategy` |
| `resolve-server-predicted-finish.ts` | `coach` · `course-detail` · `course-strategy` |
| `ride-easy-hr.ts` | `analyze-cycling-workout` |
| `riegel.ts` | `analyze-running-workout` · `workout-detail` |
| `route-intelligence.ts` | `backfill-routes` · `compute-facts` |
| `route-match.ts` | `backfill-routes` · `compute-facts` |
| `run-warmup-easy.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` |
| `schedule-session-constraints.ts` | `adapt-plan` · `arc-setup-chat` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-triathlon-plan` |
| `session-load.ts` | `compute-facts` |
| `stack-tagging-validator.ts` | `generate-combined-plan` |
| `strava-access-token.ts` | `fetch-strava-route` · `share-strength-to-strava` |
| `strength-equipment-tier.ts` | `create-goal-and-materialize-plan` · `generate-combined-plan` · `materialize-plan` |
| `strength-profiles.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-week` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `strength-session-types.ts` | `coach` |
| `swim-cutoff-pressure.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `swim-program-templates.ts` | `generate-combined-plan` |
| `swim-sessions.ts` | `coach` |
| `time-under-ceiling.ts` | `analyze-cycling-workout` · `analyze-running-workout` |
| `token-parser.ts` | `analyze-running-workout` · `compute-workout-analysis` |
| `training-intent.ts` | `create-goal-and-materialize-plan` |
| `tri-optimizer-prefs.ts` | `create-goal-and-materialize-plan` |
| `tri-preferred-days-sanity.ts` | `create-goal-and-materialize-plan` |
| `week-conflict-resolver.ts` | `generate-combined-plan` |
| `week-optimizer.ts` | `arc-setup-chat` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-triathlon-plan` |
| `week-solver.ts` | `adapt-plan` · `generate-run-plan` |
| `workload.ts` | `activate-plan` · `backfill-planned-workload` · `backfill-strength-load` · `calculate-workload` · `coach` · `compute-facts` · `materialize-plan` · `workout-detail` |

### `supabase/functions/_shared/accessory-dosing/` — 5 files · anything in it → 30 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `dose.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `index.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `ledger.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `muscles.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `performed-ledger.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |

### `supabase/functions/_shared/athlete-snapshot/` — 7 files · anything in it → 2 functions

`coach` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `adaptation.ts` | `coach` |
| `body-response.ts` | `coach` · `workout-detail` |
| `coaching.ts` | `coach` |
| `daily-ledger.ts` | `coach` · `workout-detail` |
| `identity.ts` | `coach` |
| `index.ts` | `coach` |
| `types.ts` | `coach` · `workout-detail` |

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

### `supabase/functions/_shared/coaching/` — 4 files · anything in it → 1 function

`validate-reschedule`

| touch this file | redeploy these |
|---|---|
| `analysis-builder.ts` | `validate-reschedule` |
| `index.ts` | `validate-reschedule` |
| `reschedule-factory.ts` | `validate-reschedule` |
| `types.ts` | `validate-reschedule` |

### `supabase/functions/_shared/coaching/engines/` — 2 files · anything in it → 1 function

`validate-reschedule`

| touch this file | redeploy these |
|---|---|
| `base.ts` | `validate-reschedule` |
| `performance-engine.ts` | `validate-reschedule` |

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

### `supabase/functions/_shared/endurance-library/` — 6 files · anything in it → 5 functions

`coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block`

| touch this file | redeploy these |
|---|---|
| `anchors.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `classification.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `generate.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `index.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `source-rules.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `types.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |

### `supabase/functions/_shared/endurance/` — 5 files · anything in it → 2 functions

`generate-run-plan` · `materialize-plan`

| touch this file | redeploy these |
|---|---|
| `distribution.ts` | `generate-run-plan` |
| `hr-zones.ts` | `generate-run-plan` · `materialize-plan` |
| `index.ts` | `generate-run-plan` |
| `pace-zones.ts` | `generate-run-plan` |
| `volume.ts` | `generate-run-plan` |

### `supabase/functions/_shared/fact-packet/` — 10 files · anything in it → 4 functions

`analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `build.ts` | `analyze-running-workout` |
| `execution-honesty.ts` | `analyze-running-workout` |
| `flags.ts` | `analyze-running-workout` |
| `limiter.ts` | `analyze-running-workout` |
| `pace-at-hr-direction.ts` | `analyze-running-workout` |
| `pace-resolution.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `workout-detail` |
| `queries.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `workout-detail` |
| `stimulus.ts` | `analyze-running-workout` |
| `types.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `workout-detail` |
| `utils.ts` | `analyze-cycling-workout` · `analyze-running-workout` · `compute-facts` · `workout-detail` |

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

### `supabase/functions/_shared/marathon-readiness/` — 1 file · anything in it → 1 function

`coach`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` |

### `supabase/functions/_shared/narrative-core/adapters/` — 5 files · anything in it → 3 functions

`analyze-cycling-workout` · `analyze-swim-workout` · `coach`

| touch this file | redeploy these |
|---|---|
| `coach.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `ride.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `run.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `strength.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `swim.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |

### `supabase/functions/_shared/narrative-core/` — 5 files · anything in it → 3 functions

`analyze-cycling-workout` · `analyze-swim-workout` · `coach`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `orchestrate.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `scaffold.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `types.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |
| `validate.ts` | `analyze-cycling-workout` · `analyze-swim-workout` · `coach` |

### `supabase/functions/_shared/periodization/` — 1 file · anything in it → 2 functions

`adapt-plan` · `generate-run-plan`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `adapt-plan` · `generate-run-plan` |

### `supabase/functions/_shared/race-readiness/` — 2 files · anything in it → 10 functions

`coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `refresh-goal-race-projections` · `strava-webhook`

| touch this file | redeploy these |
|---|---|
| `index.ts` | `coach` · `compute-snapshot` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `import-strava-history` · `learn-fitness-profile` · `refresh-goal-race-projections` · `strava-webhook` |
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

### `supabase/functions/_shared/session-detail/` — 7 files · anything in it → 1 function

`workout-detail`

| touch this file | redeploy these |
|---|---|
| `arc-performance-bridge.ts` | `workout-detail` |
| `build.ts` | `workout-detail` |
| `forward-context.ts` | `workout-detail` |
| `index.ts` | — nothing bundles it |
| `race-readiness-llm.ts` | `workout-detail` |
| `readiness-load-context.ts` | `workout-detail` |
| `types.ts` | `workout-detail` |

### `supabase/functions/_shared/standing-plan/` — 23 files · anything in it → 5 functions

`coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block`

| touch this file | redeploy these |
|---|---|
| `accessory-picks.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `compose.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `day-map.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `demonstrated-history.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `endurance-checkpoint.ts` | `endurance-checkpoint` |
| `endurance-ledger.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `frame-resolver.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `frames.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `golden-block.ts` | — nothing bundles it |
| `index.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `me-history.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `plan-row.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `plyo.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `progression.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `restate.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `session-vocabulary.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `sport-slots.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `test-skip.ts` | `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `volume-bounds.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `warmup.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `week-conflicts.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `week-ledger.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `working-number.ts` | `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |

### `supabase/functions/_shared/state-trend/` — 24 files · anything in it → 30 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `adherence.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `assemble.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `baseline-derive.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `bike-fitness.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `bike.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `capacity-resolver.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `materialize-plan` · `workout-detail` |
| `classify.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `deload.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `discipline.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `headline.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `index.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `load-floor.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `position-in-range.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `posture.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `reconcile.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `materialize-plan` · `workout-detail` |
| `run.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `severity.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |
| `state-screen-print.ts` | — nothing bundles it |
| `strength.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `swim.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `thresholds.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `types.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `week-accent.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` · `workout-detail` |
| `zones.ts` | `analyze-cycling-workout` · `coach` · `compute-snapshot` · `workout-detail` |

### `supabase/functions/_shared/strava/` — 1 file · anything in it → 1 function

`share-strength-to-strava`

| touch this file | redeploy these |
|---|---|
| `strength-description.ts` | `share-strength-to-strava` |

### `supabase/functions/_shared/strength-grid/` — 4 files · anything in it → 30 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `grid.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `index.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `intents.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `taxonomy.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |

### `supabase/functions/_shared/strength/` — 5 files · anything in it → 12 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `auto-attach-planned` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `get-week` · `rematerialize-strength-block` · `share-strength-to-strava` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `all-out-set.ts` | `coach` · `compute-snapshot` · `workout-detail` |
| `match-exercises.ts` | `analyze-strength-workout` · `auto-attach-planned` |
| `performed-set.ts` | `analyze-strength-workout` · `share-strength-to-strava` |
| `substitution-note.ts` | `analyze-strength-workout` |
| `trusted-reps.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `coach` · `compute-snapshot` · `create-goal-and-materialize-plan` · `get-week` · `rematerialize-strength-block` · `workout-detail` |

### `supabase/functions/_shared/swim/` — 7 files · anything in it → 7 functions

`analyze-swim-workout` · `compute-facts` · `compute-workout-summary` · `learn-fitness-profile` · `materialize-plan` · `send-workout-to-garmin` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `resolve-pool-length.ts` | `analyze-swim-workout` · `compute-workout-summary` |
| `rest-norm.ts` | `analyze-swim-workout` |
| `swim-css-learner.ts` | `learn-fitness-profile` |
| `swim-equipment.ts` | `analyze-swim-workout` · `compute-facts` · `workout-detail` |
| `swim-pace.ts` | `analyze-swim-workout` · `workout-detail` |
| `swim-scalars.ts` | `analyze-swim-workout` · `compute-facts` · `workout-detail` |
| `swim-step-equipment.ts` | `materialize-plan` · `send-workout-to-garmin` |

### `supabase/functions/_shared/types/` — 1 file · anything in it → 0 functions

(nothing bundles this folder)

| touch this file | redeploy these |
|---|---|
| `computed-workout.ts` | — nothing bundles it |

### `supabase/functions/_shared/week-model/` — 4 files · anything in it → 4 functions

`coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block`

| touch this file | redeploy these |
|---|---|
| `fixture.ts` | — nothing bundles it |
| `model.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `resolve.ts` | `coach` · `endurance-checkpoint` · `generate-strength-plan` · `rematerialize-standing-block` |
| `solver-adapter.ts` | — nothing bundles it |

### `supabase/functions/generate-combined-plan/` — 2 files · anything in it → 30 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `science.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `types.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |

### `supabase/functions/generate-run-plan/` — 3 files · anything in it → 30 functions

`adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

| touch this file | redeploy these |
|---|---|
| `effort-score.ts` | `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `calculate-workload` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `endurance-checkpoint` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail` |
| `strength-overlay.ts` | `adapt-plan` · `generate-run-plan` |
| `types.ts` | `adapt-plan` · `create-goal-and-materialize-plan` · `generate-run-plan` |

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

### `all_rounder` — Standard Focus (the source calls it The All Rounder)

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

---

## 3. THE PICKER — which cells each programme draws

⚠️ A cell is drawn when the frame carries an accessory slot the pick can fill. **`core` is
the deliberate exception**: neither page prints a core row, and it is offered anyway, opt-in.

**`strength_5k`** — 9 cells

- `db_press` — Press variation
- `iso_push` — Push isolation
- `iso_pull_a` — Pull isolation
- `iso_pull_b` — Pull isolation
- `hinge_lower` — Hinge variation  ⚠️ names no printed cell (opt-in addition)
- `single_leg_a` — Leg variation
- `single_leg_b` — Leg variation
- `quad_iso` — Leg isolation
- `core` — Core  ⚠️ names no printed cell (opt-in addition)

**`all_rounder`** — 12 cells

- `braced_push` — Machine press
- `iso_push` — Push isolation
- `iso_pull_a` — Pull isolation
- `braced_hinge` — Back extension
- `braced_leg` — Leg press
- `ham_iso` — Hamstring isolation
- `braced_pull` — Machine pull
- `iso_pull_b` — Pull isolation
- `quad_iso` — Leg isolation
- `core` — Core  ⚠️ names no printed cell (opt-in addition)
- `core_2` — Core 2  ⚠️ names no printed cell (opt-in addition)
- `core_3` — Core 3  ⚠️ names no printed cell (opt-in addition)

---

## 4. EDGE FUNCTIONS

90 functions with an entry point:

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `analyze-user-profile` · `arc-setup-chat` · `auto-attach-planned` · `backfill-adaptation-metrics` · `backfill-facts` · `backfill-planned-workload` · `backfill-power-curves` · `backfill-routes` · `backfill-strength-load` · `backfill-week-summaries` · `bright-service` · `bulk-reanalyze-workouts` · `calculate-workload` · `check-feedback-needed` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `course-upload` · `create-goal-and-materialize-plan` · `delete-goal` · `delete-plan` · `detach-planned` · `detect-cores` · `disconnect-connection` · `dismiss-feedback` · `end-plan` · `endurance-checkpoint` · `enrich-history` · `ensure-planned-ready` · `extract-races` · `fetch-strava-route` · `garmin-webhook-activities` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `get-week` · `import-connect-history` · `import-garmin-history` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `learn-fitness-profile` · `match-cores` · `materialize-plan` · `notify-admin-signup` · `pause-plan` · `planning-context` · `process-workouts-batch` · `readiness` · `reassociate-workouts` · `recompute-athlete-memory` · `recompute-workout` · `refresh-goal-race-projections` · `reingest-activity` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `restore-gps-track` · `resume-plan` · `save-baseline-test` · `save-imported-workout` · `save-location` · `send-workout-to-garmin` · `share-strength-to-strava` · `strava-token-exchange` · `strava-webhook` · `strava-webhook-manager` · `sweep-user-history` · `sweep-week` · `swift-task` · `swim-activity-details` · `validate-reschedule` · `weekly-workload` · `workout-detail`
