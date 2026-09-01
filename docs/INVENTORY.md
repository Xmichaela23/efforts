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

| touch this file | redeploy these |
|---|---|
| `accessory-picks.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `compose.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `day-map.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `demonstrated-history.ts` | `generate-strength-plan` · `rematerialize-standing-block` |
| `endurance-ledger.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `frame-resolver.ts` | `generate-strength-plan` · `rematerialize-standing-block` |
| `frames.ts` | `coach` · `compute-snapshot` · `generate-strength-plan` · `rematerialize-standing-block` |
| `golden-block.ts` | — nothing bundles it |
| `index.ts` | `generate-strength-plan` · `rematerialize-standing-block` |
| `me-history.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `plan-row.ts` | `generate-strength-plan` · `rematerialize-standing-block` |
| `plyo.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `progression.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `restate.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `session-vocabulary.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `sport-slots.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `test-skip.ts` | `generate-strength-plan` · `rematerialize-standing-block` |
| `volume-bounds.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `warmup.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `week-conflicts.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `week-ledger.ts` | `coach` · `generate-strength-plan` · `rematerialize-standing-block` |
| `working-number.ts` | `coach` · `compute-snapshot` · `generate-strength-plan` · `rematerialize-standing-block` |

**Anything in `_shared/strength-grid/`** → 27 functions: `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

**`src/lib/strength-gear.ts`** → 27 functions: `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` · `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` · `strava-webhook` · `workout-detail`

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

88 functions with an entry point:

`activate-plan` · `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `analyze-strength-workout` · `analyze-swim-workout` · `analyze-user-profile` · `arc-setup-chat` · `auto-attach-planned` · `backfill-adaptation-metrics` · `backfill-facts` · `backfill-planned-workload` · `backfill-power-curves` · `backfill-routes` · `backfill-strength-load` · `backfill-week-summaries` · `bright-service` · `bulk-reanalyze-workouts` · `calculate-workload` · `check-feedback-needed` · `coach` · `complete-race` · `compute-adaptation-metrics` · `compute-core-verdict` · `compute-facts` · `compute-snapshot` · `compute-workout-analysis` · `compute-workout-summary` · `course-detail` · `course-strategy` · `course-upload` · `create-goal-and-materialize-plan` · `delete-goal` · `delete-plan` · `detach-planned` · `detect-cores` · `disconnect-connection` · `dismiss-feedback` · `end-plan` · `enrich-history` · `ensure-planned-ready` · `extract-races` · `fetch-strava-route` · `garmin-webhook-activities` · `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` · `get-arc-context` · `get-weather` · `get-week` · `import-connect-history` · `import-garmin-history` · `import-strava-history` · `ingest-activity` · `ingest-phone-workout` · `learn-fitness-profile` · `match-cores` · `materialize-plan` · `notify-admin-signup` · `pause-plan` · `planning-context` · `process-workouts-batch` · `readiness` · `reassociate-workouts` · `recompute-athlete-memory` · `recompute-workout` · `refresh-goal-race-projections` · `reingest-activity` · `rematerialize-standing-block` · `rematerialize-strength-block` · `resolve-exercise-weight` · `restore-gps-track` · `resume-plan` · `save-baseline-test` · `save-imported-workout` · `save-location` · `send-workout-to-garmin` · `strava-token-exchange` · `strava-webhook` · `strava-webhook-manager` · `sweep-user-history` · `sweep-week` · `swift-task` · `swim-activity-details` · `validate-reschedule` · `weekly-workload` · `workout-detail`
