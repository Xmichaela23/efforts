# Planned Workouts — Product Expectations (No Mechanics)

This document states what users should experience from the Planned Workouts area of the app. It does not contain implementation details, algorithms, or guidance on how to change behavior.

## What this system provides
- Stores a user’s training plan sessions (all sports) with names, dates, and basic details.
- Shows planned sessions in the UI where appropriate (calendar, daily views).
- Lets users complete workouts and later view a high‑level comparison between the plan and what was done.
- Reflects completion state for planned sessions when a matching workout exists.
- Supports choices within a plan (e.g., optional items that the user can elect to include or not).

## What users can rely on
- Planned sessions appear on the dates they belong to.
- Completed sessions remain visible in history.
- When a planned session is considered done, the plan reflects that status in the places where users check progress.
- Optional items remain out of the way unless the user chooses to include them.

## Not covered here
- No data model diagrams, queries, or code examples.
- No rules about internal linking, caching, or compute.
- No instructions for deployment, debugging, or edits.

(End of product‑level expectations.)

---

# Implementation Notes (Dev)

These details complement the product expectations for developers working on plan baking and week materialization.

## One‑week materialization strategy
- On accept/open of a plan, Week 1 is materialized automatically if empty.
- Subsequent weeks are materialized on demand to avoid server load.
- Function: `src/services/plans/ensureWeekMaterialized.ts`.

### Behavior guarantees
- Idempotent per `(plan_id, week_index)`.
- Run/ride/swim sessions insert even if full steps cannot be computed; minimal computed (labels/duration) prevents UI hangs.
- Strength sessions never block materialization.
- Swim warm‑up and cool‑down auto‑added from plan defaults if missing.

## Blueprint coverage
The materializer recognizes blueprint kinds used in triathlon race week and taper:
- `run_openers`, `bike_openers`, `shakeout`, `swim_open_water_or_pool`, `race_day`

## Acceptance metadata
- Plans store acceptance in `plans.config.tri_acceptance` (see data architecture doc).

