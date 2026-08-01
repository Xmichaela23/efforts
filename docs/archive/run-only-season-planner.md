# Run-Only Season Planner — Build Spec

**Status:** Tabled. Plan engine ready. Chat flow not yet built.

---

## What exists today

The plan generation engine fully supports run-only goals:

- `RUN_SPORT_DIST` in `science.ts` — TSS distributions for `marathon`, `half_marathon`, `10k`, `5k`
- Taper weeks, recovery days, and phase structure defined for all four distances
- `marathonPaceRun`, `racePaceRun` session types in `week-builder.ts`
- Assessment gate already sport-aware: run-only path checks run baseline only, offers a single 12-min TT (shipped May 2026)
- `buildAssessmentWeekSessions(['run'])` already returns one Wednesday session correctly

The only missing piece is the **setup chat flow**.

---

## What needs to be built

A run-only `SEASON_PLANNER_COVERAGE` block in `arc-setup-prompt.ts`, analogous to the triathlon block. It replaces the triathlon pillar sequence (swim → bike → run → budget → strength → start date) with a run-only sequence.

### Turn sequence

```
0. Training intent — PR / completion / first-timer
1. Quality run day — track night, tempo group, or flexible
2. Long run day — neutral question (do not assume weekend)
3. Easy run days — default to 1–2 easy days around quality and long
4. Training-day budget — days_per_week (4–7)
5. Strength — in or not; if yes, performance vs support (same logic as tri)
6. Plan start date
7. Assessment week (conditional) — gate: run baseline missing → ask
```

No swim questions. No bike questions. No brick questions.

### arc_setup JSON shape (run-only)

```json
{
  "plan_start_date": "YYYY-MM-DD",
  "goals": [{
    "name": "...",
    "goal_type": "event",
    "sport": "run",
    "distance": "marathon",
    "target_date": "YYYY-MM-DD",
    "priority": "A",
    "training_prefs": {
      "training_intent": "performance | completion | first_race",
      "days_per_week": 5,
      "strength_intent": "performance | support",
      "strength_frequency": 2,
      "preferred_days": {
        "long_run": "sunday",
        "quality_run": "tuesday",
        "easy_run": "thursday",
        "strength": ["monday", "thursday"]
      }
    }
  }],
  "assessment_week_preference": "assessment_first | jump_in"
}
```

### Where to add it

`supabase/functions/_shared/arc-setup-prompt.ts`

- Add a new `const RUN_SEASON_PLANNER_COVERAGE` block (similar to `SEASON_PLANNER_COVERAGE`)
- Add a sport-detection branch in `buildArcSetupSystemPrompt` to include the right block based on primary goal sport
- The triathlon block already checks `goal.sport === 'triathlon'`; run-only fires when `goal.sport === 'run'`

### Session types available in week-builder

Already implemented:
- `easyRun`, `longRun`, `tempoRun`, `intervalRun`, `vo2Run`, `marathonPaceRun`, `racePaceRun`
- Post-marathon week-1 recovery caps

No new session types needed.

---

## Out of scope for this task

- Cycling-only plans (no `BIKE_SPORT_DIST` defined, not a product priority)
- Multi-sport non-triathlon (e.g. duathlon)
- 5K / 10K as primary A-race (plan engine supports it; chat could reuse the run-only flow with minor distance-specific adjustments)
