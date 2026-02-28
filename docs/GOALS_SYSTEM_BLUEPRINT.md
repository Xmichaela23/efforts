# Goals System Blueprint

> From static plans to goal-driven, rolling training.
> The athlete says what they want. The system figures out the rest.

---

## 1. The Problem

Today, Efforts treats plans as isolated, static blocks. A 16-week marathon plan is generated once, activated, and runs to completion. When life happens — race date changes, new goals emerge, fitness shifts — the athlete deletes the plan and starts over. The system has amnesia between plans.

Meanwhile, the data pipeline (`compute-facts` → `compute-snapshot` → `coach`) knows everything about the athlete: their ACWR, pace trends, strength progressions, recovery patterns. But `generate-run-plan` never reads it. The plan generator is stateless.

**The gap:** the system knows where you are but doesn't use it to decide where you're going.

---

## 2. The Solution

**Goals are the top-level entity.** A goal is what the athlete is training toward — a race, a capacity target, or ongoing fitness. Plans support goals as the system's training strategy. Workouts are generated week-by-week based on the athlete's current state, not a static schedule baked at creation time.

### Core Principles

1. **Goals on top, plans underneath.** The athlete manages goals. The system manages plans.
2. **Rolling generation.** Workouts are produced weekly from the athlete's current snapshot + the macro periodization phase, not all at once.
3. **Multiple goals coexist.** Marathon in April and 70.3 in September live side by side. The system coordinates them.
4. **Data is the intake form.** For established athletes, adding a goal requires only "what" and "when." The system infers fitness level, paces, available days, and strength baselines from existing data.
5. **Static plans still work.** The old wizard/catalog flow is preserved for power users and new athletes. Nothing breaks.

---

## 3. Schema

### 3.1 New Table: `goals`

The user-facing primary entity. What the athlete is training toward.

```sql
CREATE TABLE goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name            text NOT NULL,
  goal_type       text NOT NULL CHECK (goal_type IN ('event', 'capacity', 'maintenance')),

  -- Event goals (race or time-bound target)
  target_date     date,                           -- race day; null for capacity/maintenance
  sport           text,                           -- run, ride, swim, triathlon, strength, hybrid
  distance        text,                           -- marathon, half, 70.3, 140.6, 5k, 10k, ultra, century
  course_profile  jsonb DEFAULT '{}'::jsonb,      -- { elevation, terrain, net_elevation_m, swim_type, bike_climbing_m }

  -- Capacity goals (ongoing, metric-driven)
  target_metric   text,                           -- squat_1rm, 5k_time, weekly_volume_km, ftp
  target_value    numeric,                        -- target number
  current_value   numeric,                        -- latest reading, updated by pipeline

  -- Common
  priority        text DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C')),
  status          text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  training_prefs  jsonb DEFAULT '{}'::jsonb,      -- see §3.1.1
  notes           text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

#### 3.1.1 `training_prefs` shape (JSONB, sport-flexible)

```jsonc
// Runner
{
  "days_per_week": 5,
  "long_run_day": "Saturday",
  "strength_frequency": 2,
  "strength_tier": "strength_power",
  "equipment": "commercial_gym"
}

// Triathlete
{
  "days_per_week": 6,
  "swim": { "pool_access": true, "pool_unit": "yd", "open_water": true, "sessions_per_week": 3 },
  "bike": { "trainer": true, "power_meter": true, "sessions_per_week": 3 },
  "run": { "sessions_per_week": 3 },
  "strength_frequency": 2,
  "brick_day": "Saturday",
  "long_ride_day": "Saturday"
}

// Cyclist
{
  "days_per_week": 5,
  "has_power_meter": true,
  "trainer": "smart",
  "outdoor_days": ["Saturday", "Sunday"]
}

// Strength-only
{
  "days_per_week": 4,
  "split": "upper_lower",
  "equipment": "home_gym"
}
```

#### 3.1.2 `course_profile` examples

```jsonc
// M2B Marathon (downhill)
{ "elevation": "downhill", "terrain": "road", "net_elevation_m": -213 }

// Gran Fondo
{ "elevation": "hilly", "total_climbing_m": 2400, "terrain": "mixed" }

// 70.3
{ "swim": "ocean", "bike_climbing_m": 800, "run_terrain": "flat" }

// Trail ultra
{ "elevation": "mountainous", "total_climbing_m": 3000, "terrain": "trail", "altitude_m": 2500 }
```

### 3.2 Modified Table: `plans`

Existing columns unchanged. New columns added:

```sql
-- Link to goal (null for legacy static plans)
ALTER TABLE plans ADD COLUMN goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

-- Rolling plan machinery
ALTER TABLE plans ADD COLUMN plan_mode text DEFAULT 'static';       -- 'static' | 'rolling'
ALTER TABLE plans ADD COLUMN macro_phases jsonb;                     -- see §3.2.1
ALTER TABLE plans ADD COLUMN methodology_params jsonb DEFAULT '{}'::jsonb;  -- see §3.2.2
ALTER TABLE plans ADD COLUMN last_advanced_at timestamptz;
ALTER TABLE plans ADD COLUMN last_advanced_week date;

-- Expand status constraint
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;
ALTER TABLE plans ADD CONSTRAINT plans_status_check
  CHECK (status IN ('active', 'completed', 'paused', 'ended', 'rolling'));
```

#### 3.2.1 `macro_phases` shape

Output of `generate-macro`. Array of training phases derived from all active goals.

```jsonc
{
  "generated_at": "2026-02-27T08:00:00Z",
  "generated_from_goals": ["uuid-m2b", "uuid-sc703"],
  "phases": [
    {
      "start": "2026-02-24",
      "end": "2026-03-08",
      "phase": "maintenance",
      "goal_id": "uuid-m2b",
      "sport_focus": "run",
      "volume_pct": 75,
      "intensity": "low",
      "note": "Hold fitness post-peak, absorb training"
    },
    {
      "start": "2026-03-09",
      "end": "2026-03-29",
      "phase": "specificity",
      "goal_id": "uuid-m2b",
      "sport_focus": "run",
      "volume_pct": 85,
      "intensity": "moderate",
      "note": "Downhill long runs, eccentric focus for M2B course"
    },
    {
      "start": "2026-03-30",
      "end": "2026-04-12",
      "phase": "sharpening",
      "goal_id": "uuid-m2b",
      "sport_focus": "run",
      "volume_pct": 70,
      "intensity": "high_short"
    },
    {
      "start": "2026-04-13",
      "end": "2026-04-19",
      "phase": "taper",
      "goal_id": "uuid-m2b",
      "sport_focus": "run",
      "volume_pct": 40
    },
    {
      "start": "2026-04-20",
      "end": "2026-05-03",
      "phase": "recovery",
      "goal_id": null,
      "note": "Post-marathon recovery"
    },
    {
      "start": "2026-05-04",
      "end": "2026-06-28",
      "phase": "tri_base",
      "goal_id": "uuid-sc703",
      "sport_focus": "triathlon",
      "note": "Swim/bike ramp, run maintenance"
    },
    {
      "start": "2026-06-29",
      "end": "2026-08-16",
      "phase": "tri_build",
      "goal_id": "uuid-sc703",
      "sport_focus": "triathlon",
      "note": "Bricks, race-pace, increasing volume"
    },
    {
      "start": "2026-08-17",
      "end": "2026-09-06",
      "phase": "tri_specific",
      "goal_id": "uuid-sc703",
      "sport_focus": "triathlon",
      "note": "Race simulation, open water, race nutrition"
    },
    {
      "start": "2026-09-07",
      "end": "2026-09-13",
      "phase": "taper",
      "goal_id": "uuid-sc703",
      "sport_focus": "triathlon"
    }
  ]
}
```

#### 3.2.2 `methodology_params` shape

Preserved generation parameters so weekly generation stays consistent.

```jsonc
{
  "approach": "performance_build",
  "effort_score": 52.3,
  "days_per_week": 5,
  "strength_frequency": 2,
  "strength_tier": "strength_power",
  "equipment": "commercial_gym"
}
```

### 3.3 Modified Table: `planned_workouts`

```sql
ALTER TABLE planned_workouts ADD COLUMN goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE planned_workouts ADD COLUMN phase text;  -- base, build, specificity, taper, recovery, maintenance, tri_base, tri_build, tri_specific
```

### 3.4 No changes to

- `workouts` — completed workouts are untouched
- `workout_facts` — deterministic facts pipeline unchanged
- `athlete_snapshot` — weekly aggregation unchanged
- `exercise_log` — strength logging unchanged
- `user_baselines` — paces, 1RM, preferences unchanged

---

## 4. Entity Relationships

```
┌─────────────────────────────────────────────────────┐
│                     ATHLETE                          │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │  Goal 1   │   │  Goal 2   │   │   Goal 3      │   │
│  │  M2B Mar  │   │  SC 70.3  │   │   Squat 225   │   │
│  │  Apr 19   │   │  Sep 13   │   │   ongoing     │   │
│  └─────┬────┘   └─────┬────┘   └──────┬───────┘   │
│        │              │               │             │
│        ▼              ▼               ▼             │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐   │
│  │  Plan     │   │  Plan     │   │   Plan        │   │
│  │  rolling  │   │  rolling  │   │   rolling     │   │
│  │  run-mara │   │  tri-703  │   │   strength    │   │
│  └─────┬────┘   └─────┬────┘   └──────┬───────┘   │
│        │              │               │             │
│        └──────────────┼───────────────┘             │
│                       │                             │
│               ┌───────▼────────┐                    │
│               │  generate-macro │ ← reads all goals │
│               │  + snapshot     │   + athlete state  │
│               └───────┬────────┘                    │
│                       │                             │
│               ┌───────▼────────┐                    │
│               │  macro_phases   │ ← unified timeline │
│               └───────┬────────┘                    │
│                       │                             │
│               ┌───────▼────────┐                    │
│               │  advance-plan   │ ← weekly roller    │
│               └───────┬────────┘                    │
│                       │                             │
│               ┌───────▼────────┐                    │
│               │planned_workouts │ ← this week only   │
│               └───────┬────────┘                    │
│                       │                             │
│          ┌────────────┼────────────┐                │
│          ▼            ▼            ▼                │
│  materialize-plan  get-week   calendar              │
│  (expand tokens)  (serve UI) (display)              │
└─────────────────────────────────────────────────────┘
```

---

## 5. New Edge Functions

### 5.1 `generate-macro`

**Purpose:** Reads all active goals + latest athlete snapshot → produces a unified macro periodization timeline.

**Trigger:** Called when a goal is added, changed, or removed. Also callable manually.

**Input:**
```jsonc
{
  "user_id": "uuid"
}
```

**Logic:**
1. Load all active goals for user (`goals` where `status = 'active'`)
2. Load latest `athlete_snapshot`
3. Load `user_baselines` (paces, FTP, 1RM)
4. Sort event goals by `target_date`
5. For each event goal, calculate weeks remaining and assign phases:
   - If > 16 weeks: full periodization (base → build → peak → taper)
   - If 8-16 weeks: compressed (build → peak → taper)
   - If < 8 weeks: bridge (maintenance → specificity → taper)
   - If < 3 weeks: taper only
   - Use snapshot to determine starting state (peaked? base? recovering?)
6. Insert recovery gaps between events (7-14 days depending on race distance)
7. For capacity goals without dates, assign rolling 4-week progressive blocks with deload weeks
8. For maintenance goals, assign steady-state training blocks
9. Handle interference between goals (strength + endurance priority allocation)
10. Write `macro_phases` to each goal's plan record

**Output:**
```jsonc
{
  "success": true,
  "phases_count": 9,
  "plans_updated": ["uuid-plan-1", "uuid-plan-2"]
}
```

**Tables:** Reads `goals`, `athlete_snapshot`, `user_baselines`. Writes `plans.macro_phases`.

### 5.2 `advance-plan`

**Purpose:** The weekly roller. Generates next week's workouts for all active rolling plans based on current phase + athlete state.

**Trigger:**
- On-demand: "Refresh my week" button
- Automatic: called by `get-week` if the current week hasn't been generated
- Future: Supabase cron (Sunday night, user's timezone)

**Input:**
```jsonc
{
  "user_id": "uuid",
  "target_week_start": "2026-03-02"  // optional, defaults to current week Monday
}
```

**Logic:**
1. Load all active rolling plans for user (`plans` where `plan_mode = 'rolling'` and `status IN ('active', 'rolling')`)
2. For each rolling plan:
   a. Check if `last_advanced_week >= target_week_start` → skip (already generated)
   b. Read `macro_phases` → find the phase for this week
   c. Load latest `athlete_snapshot`
   d. Load `user_baselines`
   e. Call `generate-run-plan` (or future `generate-tri-plan`, `generate-strength-plan`) in **weekly mode**:
      - Pass: `phase`, `weeks_to_race`, `snapshot`, `course_profile`, `training_prefs`, `methodology_params`
      - Receive: 7 days of sessions
   f. Delete any unexecuted `planned_workouts` for this plan in the target week date range
   g. Insert new `planned_workouts` rows (same format as `activate-plan`)
      - Set `goal_id` and `phase` on each row
   h. Call `materialize-plan` for the new rows
   i. Update `plans.last_advanced_at` and `plans.last_advanced_week`
3. Return summary

**Output:**
```jsonc
{
  "success": true,
  "plans_advanced": [
    { "plan_id": "uuid", "goal": "M2B Marathon", "phase": "specificity", "sessions_generated": 5 }
  ]
}
```

**Tables:** Reads `plans`, `goals`, `athlete_snapshot`, `user_baselines`. Writes `planned_workouts`, updates `plans`.

### 5.3 Modified: `generate-run-plan`

Add a `mode: 'weekly'` option alongside the existing full-plan generation.

**New input shape (weekly mode):**
```jsonc
{
  "mode": "weekly",
  "phase": "specificity",
  "race_type": "marathon",
  "weeks_to_race": 5,
  "days_per_week": 5,
  "course_profile": { "elevation": "downhill" },
  "strength_config": { "frequency": 2, "tier": "strength_power" },
  "snapshot": {
    "acwr": 1.1,
    "workload_total": 450,
    "workload_by_discipline": { "run": 350, "strength": 100 },
    "run_easy_pace_at_hr": 345,
    "strength_top_lifts": { "squat": { "est_1rm": 195 } },
    "avg_session_rpe": 6.5,
    "rpe_trend": -0.05
  },
  "effort_score": 52.3
}
```

**New output (weekly mode):**
```jsonc
{
  "sessions": [
    {
      "day": "Monday",
      "type": "strength",
      "name": "Upper Body: Maintenance",
      "duration": 45,
      "strength_exercises": [...],
      "tags": ["maintenance"]
    },
    {
      "day": "Monday",
      "type": "run",
      "name": "Run — Easy",
      "duration": 56,
      "steps_preset": ["warmup_10min", "run_easy_40min", "cooldown_6min"],
      "tags": ["easy_run"]
    },
    {
      "day": "Tuesday",
      "type": "run",
      "name": "Run — Tempo",
      "duration": 50,
      "steps_preset": ["warmup_15min", "tempo_20min_threshold", "cooldown_15min"],
      "tags": ["hard_run", "tempo"]
    }
    // ... rest of week
  ]
}
```

**Phase-aware logic:**
| Phase | Volume | Intensity | Key Sessions |
|-------|--------|-----------|--------------|
| `recovery` | 40-50% of peak | Easy only | Easy runs, light strength, mobility |
| `base` | Progressive 60-80% | Low-moderate | Long run building, aerobic runs, strength progression |
| `build` | 80-95% | Moderate-high | Intervals, tempo, long run at distance, strength maintenance |
| `specificity` | 85-95% | Race-specific | Race-pace work, course-specific sessions (downhill for M2B) |
| `sharpening` | 70% | High-short | Short sharp intervals, race-pace strides |
| `taper` | 40-60% | Maintain intensity, drop volume | Short quality sessions, easy runs |
| `maintenance` | Steady | Moderate | Hold current fitness, no progression |
| `tri_base` | Progressive | Moderate, multi-sport | Swim technique, bike endurance, run maintenance |
| `tri_build` | High | Progressive multi-sport | Bricks, race-pace, open water |
| `tri_specific` | High | Race simulation | Transition practice, nutrition rehearsal |

**Snapshot-reactive adjustments:**
- `acwr > 1.4` → reduce volume by 15%, swap one hard session for easy
- `acwr < 0.8` → athlete is undertraining, increase volume
- `avg_session_rpe > 7.5 for 2+ weeks` → fatigue accumulating, insert extra recovery day
- `rpe_trend > +15%` → trending harder, back off intensity
- `run_easy_hr_trend > +5%` → cardiac drift worsening, reduce intensity

### 5.4 Future: `generate-tri-plan` (weekly mode)

Same contract as `generate-run-plan` weekly mode, but for triathlon goals. Handles:
- Multi-sport session allocation (swim/bike/run/strength across available days)
- Brick sessions (bike + run on same day)
- Interference management (no VO2 bike within 24h of threshold run)
- Sport-specific periodization within the macro phase

### 5.5 Modified: `get-week`

Add a check at the start of the request handler:

```
1. If user has active rolling plans:
   a. For each rolling plan, check if last_advanced_week covers the requested date range
   b. If not → call advance-plan for the missing week(s)
   c. Then proceed with normal get-week logic (fetch planned + completed, unify, return)
```

This makes rolling generation invisible to the client. The calendar "just works."

### 5.6 Modified: `coach`

Update plan context reading to include goals:

```
1. Load active goals for user
2. Load rolling plans with macro_phases
3. Include in narrative prompt:
   - Goal names and target dates
   - Current phase and weeks to next event
   - Season arc (what comes after this race)
   - Capacity goal progress (current vs target)
```

Narrative shifts from "Week 10 of your marathon plan" to:
> "You're 3 weeks out from M2B. Your aerobic base is holding well through the specificity phase. After the race, I'll start building your bike and swim volume for Santa Cruz in September. Your squat is at 195 — on track for 225 by mid-summer."

---

## 6. UI Changes

### 6.1 Bottom Nav: "Plans" → "Goals"

**File:** `src/components/AppLayout.tsx`

- Rename tab label from "Plans" to "Goals"
- Replace `PlansMenu` (Radix popover dropdown) with direct navigation to `GoalsScreen`
- Remove `plansMenuOpen` state
- Add `showGoals` state (same pattern as `showContext`)

### 6.2 New Component: `GoalsScreen.tsx`

The primary Goals view. Shows:

```
┌─────────────────────────────────────────┐
│  ← Goals                                │
│                                         │
│  🏁  M2B Marathon               Apr 19  │
│      A race · Specificity phase         │
│      ▓▓▓▓▓▓▓▓▓▓░░░░  5 of 7 weeks     │
│      [View Plan →]                      │
│                                         │
│  🏁  Santa Cruz 70.3            Sep 13  │
│      A race · Starts after M2B          │
│      ░░░░░░░░░░░░░░  28 weeks out      │
│      [Build Plan]                       │
│                                         │
│  ⬆️  Squat → 225 lb                     │
│      Currently 195 lb · ▲ trending up   │
│      ▓▓▓▓▓▓▓▓░░░░░░  ~8 weeks          │
│      [View Plan →]                      │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Completed                              │
│  ✓ LA Marathon 2026 Plan                │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │          + Add Goal              │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### 6.3 "Add Goal" Flow

Tapping "+ Add Goal" shows options:

| Option | Creates | Flow |
|--------|---------|------|
| **I have a race** | Event goal + rolling plan | Name → Date → Sport/Distance → Done (2-4 taps) |
| **I want to improve** | Capacity goal + rolling plan | Metric → Target → Done (2 taps) |
| **Keep me consistent** | Maintenance goal + rolling plan | Sport → Days/week → Done (2 taps) |
| **Build a custom plan** | Static plan (legacy) | Full PlanWizard (existing flow) |
| **Browse plan library** | Static plan (legacy) | PlanCatalog (existing flow) |

For established users (6+ months of data), the first three options collect minimal input. The system reads `athlete_snapshot` and `user_baselines` to fill in everything else.

For new users (no data), the event/capacity/maintenance flows expand with additional questions:
- Rough fitness level
- Current weekly training volume
- Race history (if event goal)
- Known paces or recent race times
These are the same questions the wizard asks, just presented contextually.

### 6.4 Goal Detail View

Tapping a goal card opens the detail:

- Goal info (name, date, priority, notes)
- Edit goal (change date, rename, adjust priority)
- Macro phase timeline (horizontal colored bar showing phases)
- Supporting plan → drills into `AllPlansInterface` (existing weekly view)
- Cancel / Complete goal actions

### 6.5 Existing Views: Unchanged

- `AllPlansInterface` — still works, accessed via "View Plan" on a goal
- `PlanWizard` — still works, accessed via "Build a custom plan"
- `PlanCatalog` — still works, accessed via "Browse plan library"
- `TodaysEffort` / `WorkoutCalendar` — unchanged, displays `planned_workouts` as before
- `UnifiedWorkoutView` — unchanged, shows planned/completed detail
- `ContextTabs` / `CoachWeekTab` — updated narrative, same UI

---

## 7. Data Flow: End to End

### 7.1 Adding a Goal (New)

```
User taps "I have a race" → enters "M2B Marathon, April 19"
    │
    ▼
Insert into `goals`: { name, goal_type: 'event', target_date, sport: 'run', distance: 'marathon', course_profile }
    │
    ▼
Insert into `plans`: { goal_id, plan_mode: 'rolling', name: 'M2B Marathon Plan', status: 'active' }
    │
    ▼
Call `generate-macro`: reads all active goals + athlete_snapshot
    │    → produces macro_phases (maintenance → specificity → sharpening → taper)
    │    → writes to plans.macro_phases
    │
    ▼
Call `advance-plan`: reads macro phase for current week + snapshot
    │    → calls generate-run-plan (weekly mode)
    │    → inserts planned_workouts for this week
    │    → calls materialize-plan to expand tokens
    │
    ▼
Workouts appear on calendar (via get-week, same as today)
```

### 7.2 Weekly Rollover (Automatic)

```
Monday morning: user opens app → get-week called for this week
    │
    ▼
get-week checks: does the rolling plan cover this week?
    │    last_advanced_week < this Monday → NO
    │
    ▼
get-week calls advance-plan for this week
    │
    ▼
advance-plan:
    1. Reads macro_phases → current phase = "specificity"
    2. Reads athlete_snapshot → acwr: 1.1, rpe: 6.2, long run: 32km
    3. Calls generate-run-plan (weekly mode, phase: specificity, weeks_to_race: 4)
    4. Gets back 5 sessions for the week
    5. Deletes any unexecuted planned_workouts for this week
    6. Inserts new planned_workouts
    7. Calls materialize-plan
    8. Updates last_advanced_week
    │
    ▼
get-week returns unified data (planned + completed) → calendar renders
```

### 7.3 Goal Change (Race Date Moves)

```
User edits goal: target_date April 19 → April 26
    │
    ▼
Update `goals` row
    │
    ▼
Call `generate-macro`: recalculates phases with new date
    │    → shifts taper week, extends specificity by 1 week
    │    → writes updated macro_phases
    │
    ▼
Next time get-week runs → advance-plan generates from new macro
    │    → old unexecuted workouts for the week are replaced
    │
    ▼
Calendar shows updated workouts. No manual intervention.
```

### 7.4 Adding a Second Goal

```
User adds "Santa Cruz 70.3, September 13"
    │
    ▼
Insert into `goals`
    │
    ▼
Insert into `plans`: { goal_id, plan_mode: 'rolling', name: 'SC 70.3 Plan' }
    │
    ▼
Call `generate-macro`: reads BOTH goals
    │    → M2B phases stay the same (race is soon)
    │    → Adds post-M2B recovery phase
    │    → Adds tri_base → tri_build → tri_specific → taper for SC
    │    → Writes macro_phases to BOTH plan records
    │
    ▼
After M2B: advance-plan for the tri plan activates
    │    → starts generating swim/bike sessions
    │    → M2B plan stops advancing (race completed)
```

### 7.5 Completing a Goal

```
User marks "M2B Marathon" as completed (or race date passes)
    │
    ▼
Update goals.status = 'completed'
Update plans.status = 'completed' (for the M2B plan)
    │
    ▼
Call generate-macro: only SC 70.3 and Squat goals remain
    │    → macro_phases regenerate without M2B
    │    → recovery phase after M2B still present
    │
    ▼
advance-plan now only generates for active plans (SC 70.3, Strength)
```

### 7.6 Static Plan (Legacy, Unchanged)

```
User taps "Build a custom plan" → PlanWizard
    │
    ▼
Wizard collects 13 fields → calls generate-run-plan (full mode)
    │
    ▼
Plan created with plan_mode: 'static', goal_id: null
    │
    ▼
activate-plan creates all planned_workouts at once
    │
    ▼
Everything works exactly as today. No rolling generation.
```

---

## 8. Pipeline Integration

### What changes

| Component | Change | Reason |
|-----------|--------|--------|
| `get-week` | Add rolling plan check before serving data | Seamless weekly generation |
| `generate-run-plan` | Add `mode: 'weekly'` path | Weekly generation from phase + snapshot |
| `coach` | Read `goals` table, reference macro phases | Season-aware narrative |
| `compute-snapshot` | Optionally update `goals.current_value` for capacity goals | Progress tracking |
| `AppLayout.tsx` | Replace PlansMenu with GoalsScreen navigation | New entry point |
| `PlansMenu.tsx` | Deprecated (options move into GoalsScreen) | Replaced by Goals |

### What stays exactly the same

| Component | Why |
|-----------|-----|
| `compute-facts` | Runs on every workout, doesn't care about plan mode |
| `compute-snapshot` | Aggregates facts, doesn't care about plan mode |
| `materialize-plan` | Expands tokens → steps. Called by advance-plan same as activate-plan |
| `activate-plan` | Still used for static plans |
| `calculate-workload` | Called per workout, plan-mode agnostic |
| `auto-attach-planned` | Links completed → planned by date+type, unchanged |
| All `analyze-*-workout` functions | Analysis is workout-level, not plan-level |
| All webhook/ingestion functions | Data comes in the same way regardless |
| `AllPlansInterface` | Still used to view/edit plan details under a goal |
| `UnifiedWorkoutView` | Displays planned/completed, doesn't care how plan was created |
| `TodaysEffort` / `WorkoutCalendar` | Renders planned_workouts, source doesn't matter |
| `StrengthLogger` | Logging unchanged |
| All Strava/Garmin integrations | Ingestion pipeline unchanged |

---

## 9. New User Experience

### User with no data

```
Screen 1: "What brings you here?"
  → I have a race coming up
  → I want to get faster / stronger
  → I want to stay consistent
  → I'm coming back from a break

Screen 2: Based on selection, collect only what's needed
  Event: What race? When? Sport? Days/week? Ever raced this distance?
  Capacity: What metric? Target? Days/week?
  Maintenance: What sports? Days/week?
  (3-5 questions max)

Screen 3: Goals screen with first goal + plan generating

First week of workouts appears on calendar.
```

### User with Strava/Garmin import (has data, no goals yet)

```
System imports history → compute-facts → compute-snapshot

"Looks like you've been running about 40 miles a week with a long run around 14 miles.
 What are you training for?"

→ One question. System knows everything else.
```

### Established user (6+ months)

```
Tap "+ Add Goal" → "I have a race"
→ Name: "Mountains to Beach Marathon"
→ Date: April 19
→ Done.

System reads snapshot: peaked, ACWR 1.2, long run 32km, easy pace 5:30/km
→ Generates maintenance → specificity → taper macro
→ First week of workouts appears immediately
```

---

## 10. Build Phases

### Phase 1: Foundation (Week 1)
> Goal: M2B problem solved. Rolling generation working.

| Step | Deliverable | Files |
|------|-------------|-------|
| 1 | Run migration | `20260226_create_goals_and_rolling_plans.sql` |
| 2 | `GoalsScreen.tsx` | New component |
| 3 | Rewire bottom nav | `AppLayout.tsx` — Goals tab replaces Plans dropdown |
| 4 | Add Goal flow (event) | Minimal form: name, date, sport, distance |
| 5 | `generate-macro` | New edge function (single-race case first) |
| 6 | Weekly mode in `generate-run-plan` | Add `mode: 'weekly'` path |
| 7 | `advance-plan` | New edge function |
| 8 | Hook into `get-week` | Rolling plan check before serving data |

**Result:** Add "M2B Marathon, April 19" as a goal. System generates weekly workouts based on current fitness. Calendar works. Coach works.

### Phase 2: Multi-Goal + Polish (Weeks 2-3)
> Goal: Multiple goals coordinate. Capacity goals work. UI polished.

| Step | Deliverable |
|------|-------------|
| 9 | Multi-race `generate-macro` (chain events with recovery) |
| 10 | Capacity goal flow (metric + target) |
| 11 | Maintenance goal flow |
| 12 | Update `coach` to read goals and macro phases |
| 13 | Goal detail view (edit, progress, phase timeline) |
| 14 | Goal completion flow |
| 15 | Update `compute-snapshot` to write `goals.current_value` |

**Result:** M2B + SC 70.3 + Squat 225 all active simultaneously. Coach talks about the full season. Capacity goals show progress.

### Phase 3: Triathlon Engine (Weeks 4-6)
> Goal: Tri plans generate properly for SC 70.3.

| Step | Deliverable |
|------|-------------|
| 16 | `generate-tri-plan` (weekly mode) |
| 17 | Swim/bike step tokens + token expansion in `materialize-plan` |
| 18 | Brick session support (bike + run same day) |
| 19 | Swim/bike baselines in `user_baselines` |
| 20 | Interference management in weekly scheduler |
| 21 | Tri-specific phases in `generate-macro` |

**Result:** After M2B, the system generates swim/bike/run sessions for Santa Cruz 70.3 prep.

### Phase 4: Conversational Layer (Weeks 7-8)
> Goal: Natural language goal input. Smart onboarding.

| Step | Deliverable |
|------|-------------|
| 22 | GPT-powered goal parsing ("I want to do M2B marathon April 19" → structured goal) |
| 23 | Smart onboarding (data-aware question reduction) |
| 24 | Strava import → auto-suggest goals based on history |
| 25 | Mid-week plan adjustments (missed workout → regenerate remaining days) |

**Result:** The app feels like talking to a coach, not filling out forms.

---

## 11. Migration SQL (Ready to Deploy)

See: `supabase/migrations/20260226_create_goals_and_rolling_plans.sql`

---

## 12. Open Questions

1. **Cron timing:** When does `advance-plan` run automatically? Sunday night in the user's timezone? Or purely on-demand via `get-week`?
2. **Mid-week regeneration:** If you miss Monday and Tuesday workouts, should Wednesday-Sunday regenerate? Or keep the original plan for the week?
3. **Goal conflicts:** What if someone adds a marathon 4 weeks out AND a 70.3 2 weeks later? The system should probably warn them.
4. **Plan sharing:** Should goals/plans be shareable between coach and athlete? (Future consideration.)
5. **Historical goals:** When a static plan exists without a goal, should we auto-create a goal from its config for continuity?
