# Deterministic Layer Architecture

## The Problem

The app analyzes each discipline in isolation. 25K+ lines of analysis code
spread across discipline-specific edge functions that re-fetch data, re-compute
basics, and produce incompatible output formats. No unified view of the athlete.
No cross-discipline awareness. No progression tracking over time.

## The Principle

**One athlete, one truth.** Every workout — run, strength, ride, swim, mobility —
feeds into the same computation pipeline. The output is structured facts, not
narratives. Fast, cheap, deterministic. Everything else reads from it.

---

## Data Model

### New table: `workout_facts`

One row per workout. Computed on ingest. The single source of derived truth.

```sql
CREATE TABLE workout_facts (
  workout_id    uuid PRIMARY KEY REFERENCES workouts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  discipline    text NOT NULL,  -- 'run', 'ride', 'swim', 'strength', 'mobility', 'pilates_yoga'
  
  -- Universal metrics (every discipline)
  duration_minutes    numeric,
  workload            numeric,       -- unified scale (TRIMP / volume-based / sRPE)
  session_rpe         smallint,      -- 1-10, from workout_metadata
  readiness           jsonb,         -- { energy, soreness, sleep } snapshot
  
  -- Adherence (if linked to a plan)
  plan_id             uuid,
  planned_workout_id  uuid,
  adherence           jsonb,         -- { overall_pct, duration_pct, intensity_pct, notes }
  
  -- Discipline-specific facts (populated per type)
  run_facts           jsonb,         -- see below
  strength_facts      jsonb,         -- see below
  ride_facts          jsonb,         -- see below
  swim_facts          jsonb,         -- see below
  
  computed_at         timestamptz DEFAULT now(),
  version             smallint DEFAULT 1
);

CREATE INDEX idx_workout_facts_user_date ON workout_facts (user_id, date DESC);
CREATE INDEX idx_workout_facts_discipline ON workout_facts (user_id, discipline, date DESC);
```

#### `run_facts` shape
```jsonb
{
  "distance_m": 16093,
  "pace_avg_s_per_km": 332,
  "pace_at_easy_hr": 345,           -- pace when HR was in easy zone
  "hr_avg": 152,
  "hr_drift_pct": 4.2,              -- cardiac drift over the session
  "time_in_zone": { "z1": 300, "z2": 1800, "z3": 600, "z4": 120, "z5": 0 },
  "efficiency_index": 1.12,         -- pace / HR ratio (aerobic efficiency)
  "intervals_hit": 4,
  "intervals_total": 5,
  "elevation_gain_m": 87
}
```

#### `strength_facts` shape
```jsonb
{
  "total_volume_lbs": 6900,
  "total_sets": 11,
  "total_reps": 52,
  "exercises": [
    {
      "name": "Back Squat",
      "canonical": "squat",          -- normalized name for trend tracking
      "sets_completed": 3,
      "best_weight": 225,
      "best_reps": 3,
      "avg_rir": 3,
      "volume": 2025,
      "estimated_1rm": 246,          -- Epley
      "planned_weight": "80% 1RM",
      "planned_reps": 3,
      "planned_sets": 3,
      "adherence_pct": 100
    }
  ],
  "muscle_groups": { "legs": 3015, "back": 2400, "chest": 1485 },
  "density_lbs_per_min": 256
}
```

#### `ride_facts` shape
```jsonb
{
  "distance_m": 48000,
  "duration_minutes": 90,
  "avg_power": 185,
  "normalized_power": 198,
  "intensity_factor": 0.78,          -- NP / FTP
  "avg_hr": 142,
  "hr_drift_pct": 3.1,
  "time_in_zone": { "z1": 600, "z2": 3200, "z3": 1200, "z4": 400, "z5": 0 },
  "efficiency_factor": 1.30          -- NP / avg_hr
}
```

#### `swim_facts` shape
```jsonb
{
  "distance_m": 2500,
  "pace_per_100m": 108,
  "stroke_count_avg": 18,
  "intervals_hit": 8,
  "intervals_total": 10
}
```

---

### New table: `exercise_log`

One row per exercise per workout. Makes trend queries trivial.

```sql
CREATE TABLE exercise_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id      uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date NOT NULL,
  exercise_name   text NOT NULL,            -- raw name from user
  canonical_name  text NOT NULL,            -- normalized ("back squat" → "squat")
  discipline      text NOT NULL DEFAULT 'strength',
  
  sets_completed  smallint,
  best_weight     numeric,
  best_reps       smallint,
  total_volume    numeric,                  -- weight × reps across all sets
  avg_rir         numeric,
  estimated_1rm   numeric,                  -- Epley
  
  -- For cardio "exercises" (intervals, long runs, etc.)
  -- This can track interval types over time too
  
  computed_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_exercise_log_user_exercise ON exercise_log (user_id, canonical_name, date DESC);
CREATE INDEX idx_exercise_log_workout ON exercise_log (workout_id);
```

This makes queries like "squat estimated 1RM over last 12 weeks" a single indexed query
instead of scanning JSONB across hundreds of workout rows.

---

### New table: `athlete_snapshot`

One row per user per week. The rolling state of the athlete.

```sql
CREATE TABLE athlete_snapshot (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start      date NOT NULL,            -- Monday of the week
  
  -- Load
  workload_total          numeric,          -- sum of all workloads
  workload_by_discipline  jsonb,            -- { run: 320, strength: 85, ride: 110 }
  acwr                    numeric,          -- acute:chronic ratio
  session_count           smallint,
  session_count_planned   smallint,
  adherence_pct           numeric,          -- sessions completed / sessions planned
  
  -- Running fitness signals
  run_easy_pace_at_hr     numeric,          -- avg pace when HR in easy zone (s/km)
  run_easy_hr_trend       numeric,          -- change vs 4-week avg
  run_long_run_duration   numeric,          -- longest run this week (minutes)
  run_interval_adherence  numeric,          -- % of interval targets hit
  
  -- Strength fitness signals
  strength_volume_total   numeric,          -- total lbs this week
  strength_volume_trend   numeric,          -- % change vs 4-week avg
  strength_top_lifts      jsonb,            -- { "squat": { "est_1rm": 250, "trend": "+2.1%" }, ... }
  
  -- Cycling fitness signals
  ride_avg_power          numeric,
  ride_efficiency_factor  numeric,          -- NP / avg_hr trend
  
  -- Fatigue / recovery signals
  avg_session_rpe         numeric,
  avg_readiness           jsonb,            -- { energy: 3.2, soreness: 2.1, sleep: 3.5 }
  rpe_trend               numeric,          -- vs 4-week avg (rising = accumulating fatigue)
  
  -- Plan context
  plan_id                 uuid,
  plan_week_number        smallint,
  plan_phase              text,             -- 'base', 'build', 'peak', 'taper', 'recovery'
  
  computed_at             timestamptz DEFAULT now(),
  
  UNIQUE (user_id, week_start)
);

CREATE INDEX idx_athlete_snapshot_user ON athlete_snapshot (user_id, week_start DESC);
```

---

## Computation Pipeline

### Trigger: Every workout ingest

```
Workout saved/imported
        │
        ▼
┌─────────────────────┐
│  compute-facts      │   NEW edge function (~500 lines)
│                     │
│  1. Read workout    │   - workouts row + planned_workout if linked
│  2. Read baselines  │   - user_baselines (1RMs, FTP, threshold HR)
│  3. Compute facts   │   - discipline-specific math (deterministic, no AI)
│  4. Write tables    │   - INSERT/UPSERT workout_facts + exercise_log rows
│                     │
└─────────────────────┘
        │
        ▼
  Existing pipeline continues (compute-workout-analysis, etc.)
  These become optional — they add narratives on top of facts
```

### Trigger: Weekly (or on-demand)

```
Sunday night / user opens context screen
        │
        ▼
┌─────────────────────┐
│  compute-snapshot   │   NEW edge function (~400 lines)
│                     │
│  1. Query workout_facts for this week + last 4 weeks
│  2. Query exercise_log for strength trends
│  3. Aggregate into athlete_snapshot row
│  4. UPSERT athlete_snapshot
│                     │
└─────────────────────┘
        │
        ▼
  UI reads athlete_snapshot directly
  AI coaching reads athlete_snapshot (when we build it)
  Plan adaptation reads athlete_snapshot (when we build it)
```

---

## What This Replaces vs What It Doesn't

### Replaces (over time)
- `compute-adaptation-metrics` → absorbed into `compute-facts` (strength 1RM snapshots)
- `calculate-workload` → absorbed into `compute-facts` (workload is just one fact)
- Per-workout adherence in `analyze-*` → `workout_facts.adherence`
- JSONB scanning for strength progression → `exercise_log` queries
- Weekly aggregation in `generate-training-context` → `athlete_snapshot`
- Block adaptation cache → `athlete_snapshot` series

### Does NOT replace
- `compute-workout-analysis` — raw sensor processing (power curves, series data, chart data)
- `compute-workout-summary` — interval parsing, planned-vs-actual alignment
- `analyze-running-workout` narrative — AI-generated coaching text (but it reads from facts)
- `analyze-strength-workout` narrative — same
- `generate-training-context` — still produces the coaching context, but reads from snapshot

The existing analyzers gradually become thin wrappers: fetch facts, feed to AI, write narrative.

---

## Migration Path

### Phase 1: Build the foundation — DONE
- [x] Create tables: `workout_facts`, `exercise_log`, `athlete_snapshot`
- [x] Build `compute-facts` edge function
- [x] Wire it into ingest pipeline (after `compute-workout-summary`)
- [x] Build `compute-snapshot` (aggregates facts → athlete_snapshot, includes interference)
- [x] Coach function reads `athlete_snapshot` (interference, fitness_direction, readiness_state)

### Phase 2: Wire up consumers
- [x] `generate-training-context` reads from `athlete_snapshot` (ACWR, sport breakdown, week comparison when available)
- [x] **UI reads `exercise_log` for strength progression charts** — BlockSummaryTab + StrengthSummaryView use useExerciseLog; validates the layer to the athlete.
- [x] **Update `user_baselines.learned_fitness` from strength data** — auto-update 1RMs from `exercise_log` via `compute-facts`. `learned_fitness.strength_1rms` fills gaps when `performance_numbers` lacks squat/bench/deadlift/overhead. Materialize-plan merges learned into baselines.
- [~] UI reads `athlete_snapshot` for weekly dashboard — *skipped*; perf optimization only, context tab already works via generate-training-context.

### Phase 3: Close the loop

**First deliverable: baseline drift suggestion.** "Your squat has progressed to 315 but your baseline says 275 — update?" Low-risk, high-confidence, easy to validate. Data is already in `exercise_log` vs `performance_numbers`. Wires the full suggestion + confirm pipeline end-to-end before tackling harder judgment calls.

- [ ] **Baseline drift suggestion** — Compare `learned_fitness.strength_1rms` (or exercise_log max) vs `performance_numbers` per lift. When learned > baseline by meaningful margin (e.g. 5%+), show inline card: accept updates baseline, dismiss records feedback.
- [ ] **Plan adaptation (stalling/overreaching)** — Read `athlete_snapshot` to detect stalls, overreaching. Suggest "deload and rebuild", "add recovery day", etc. Harder judgment calls; ship after baseline drift proves the UX.

**Phase 3 UX (design decision):** Suggestion + confirm as default. Do not auto-apply changes — athletes lose trust when the system changes plans without consent. Instead:

1. **Suggestion + confirm** — Inline card on the week tab. One tap to accept or dismiss, optional note when declining.
2. **Feedback loop** — Track dismissals. If athletes consistently decline certain suggestion types, that's signal to tune the detection or messaging.
3. Follow the same pattern as athlete context capture: low-friction, inline, on existing screens.

- [x] AI coaching layer reads facts + snapshot, produces weekly narrative (coach function already does this)
- [ ] **Per-workout analyzers slim down** — `analyze-running-workout` / `analyze-strength-workout` read from facts instead of re-computing. *Deprioritized:* current analyzers work; this is a code-quality pass after Phase 2 and Phase 3 adaptation logic ship.

### Phase 4: Multi-discipline (horizon)
- [ ] Cycling plan generation reads from same pipeline
- [ ] Triathlon planning composes across disciplines using unified load model
- [ ] Cross-discipline interference detection (heavy legs + quality run = flag) — extends existing `athlete_snapshot.interference` pattern

---

## Design Principles

1. **Facts are cheap, narratives are expensive.** Compute facts on every workout.
   Generate narratives sparingly (weekly, or on user request).

2. **One table per concern.** `workout_facts` = per-workout truth. `exercise_log` =
   per-exercise history. `athlete_snapshot` = weekly state. No JSONB archaeology.

3. **Discipline math differs, output format is unified.** The 1RM formula is different
   from TRIMP, but both produce a number in `workout_facts` that downstream consumers
   read the same way.

4. **Additive, not rewrite.** The existing analyzers keep working. The new layer grows
   underneath. Migration happens gradually as consumers switch to reading facts.

5. **The edge function stays small.** `compute-facts` does math and writes rows.
   No AI calls, no narrative generation, no 5000-line files. If it grows past 800 lines,
   it's doing too much.
