# Efforts App Architecture - Complete Reference

**For AI Assistants:** This document provides a comprehensive overview of the Efforts triathlon training app architecture, data flows, and patterns.

**Last Updated:** November 7, 2025

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Tech Stack](#tech-stack)
4. [Data Flow Overview](#data-flow-overview)
5. [Database Schema](#database-schema)
6. [JSONB Data Structures](#jsonb-data-structures)
7. [Edge Functions Catalog](#edge-functions-catalog)
8. [Frontend Architecture](#frontend-architecture)
9. [Key Data Flows](#key-data-flows)
10. [Design Patterns](#design-patterns)
11. [Analysis System](#analysis-system)
12. [Plan System](#plan-system)
13. [UI Data Access Patterns](#ui-data-access-patterns)

---

## System Overview

**Efforts** is a triathlon training application that:
- Syncs workouts from Garmin and Strava
- Manages training plans across multiple disciplines (run, ride, swim, strength, mobility)
- Analyzes workout execution vs planned workouts
- Provides AI-powered insights on training performance
- Tracks training load/workload across all disciplines

**Core Value Proposition:** Smart server does all computation; client just renders. Clean separation of concerns.

---

## Architecture Principles

### 1. Smart Server, Dumb Client

**Server (Supabase Edge Functions):**
- ALL business logic
- ALL data processing
- ALL computations
- Merges data sources
- Returns fully-formed responses

**Client (React):**
- ONLY renders data
- NO business logic
- NO data merging
- Calls edge functions, displays results

**Example:**
```typescript
// ❌ BAD: Client merging data
const planned = await supabase.from('planned_workouts').select();
const executed = await supabase.from('workouts').select();
const merged = mergePlannedExecuted(planned, executed); // NO!

// ✅ GOOD: Server does it all
const { data } = await supabase.functions.invoke('get-week', {
  body: { from: '2025-01-06', to: '2025-01-12' }
});
// data.items already has { planned, executed } merged
```

### 2. Single Source of Truth

**THE UNIFIED VIEW:** `get-week` edge function
- ONLY endpoint for calendar/week data
- Client NEVER queries `planned_workouts` or `workouts` directly
- Returns unified items: `{ planned: {...}, executed: {...}, status: 'completed' }`

### 3. JSONB for Flexibility

- All complex structures stored as JSONB
- No schema migrations for structure changes
- Queryable with JSONB operators
- Examples: `sensor_data`, `computed`, `workout_analysis`, `strength_exercises`

### 4. Direct Discipline Routing

- Frontend knows workout type
- Routes directly to appropriate analyzer
- No orchestrator layer
- Each discipline has specialized logic

---

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Radix UI** for components
- **React Query (TanStack Query)** for data fetching/caching
- **React Router** for navigation
- **MapLibre GL** for GPS map visualization
- **Recharts** for workout charts

### Backend
- **Supabase** (PostgreSQL + Edge Functions)
- **Deno** runtime for edge functions
- **PostgreSQL 15+** with JSONB support
- **Row Level Security (RLS)** for data isolation

### Integrations
- **Garmin Connect API** (OAuth 2.0 PKCE + webhooks)
- **Strava API** (OAuth 2.0 + webhooks)

### Deployment
- **Frontend:** Netlify (auto-deploy from `main` branch)
- **Edge Functions:** Supabase (manual deploy via CLI)
- **Database:** Supabase hosted PostgreSQL

---

## Data Flow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HIGH-LEVEL DATA FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Garmin/Strava                                              │
│       ↓                                                      │
│  Webhook → ingest-activity                                  │
│       ↓                                                      │
│  workouts.sensor_data (raw)                                 │
│       ↓                                                      │
│  auto-attach-planned (links to plan)                        │
│       ↓                                                      │
│  compute-workout-summary (creates intervals)                │
│       ↓                                                      │
│  workouts.computed.intervals (basic)                        │
│       ↓                                                      │
│  analyze-running-workout (deep analysis)                    │
│       ↓                                                      │
│  workouts.workout_analysis (insights)                       │
│       ↓                                                      │
│  get-week (unified view)                                    │
│       ↓                                                      │
│  React UI (calendar display)                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### `workouts` - Completed/Imported Workouts
Primary table for all workout data (Garmin, Strava, manual).

**Key Columns:**
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users)
- `type` (text) - run, ride, swim, strength, mobility, walk
- `date` (date) - Workout date
- `workout_status` (text) - planned, completed, skipped
- `planned_id` (uuid) - Link to planned_workouts

**Performance Metrics (top-level):**
- `distance`, `duration`, `moving_time`, `elapsed_time`
- `avg_heart_rate`, `max_heart_rate`
- `avg_power`, `max_power`, `normalized_power`
- `avg_speed`, `max_speed`, `avg_cadence`
- `elevation_gain`, `elevation_loss`, `calories`

**JSONB Columns (detailed data):**
- `sensor_data` - Raw time-series sensor readings
- `gps_track` - GPS coordinates + elevation
- `computed` - Processed intervals, series, overall metrics
- `workout_analysis` - AI insights, performance scores
- `strength_exercises` - Strength workout sets/reps
- `mobility_exercises` - Mobility/stretching exercises
- `swim_data` - Pool length, strokes, SWOLF

**Workload Tracking:**
- `workload_planned` (integer)
- `workload_actual` (integer)
- `intensity_factor` (decimal)

**Analysis Tracking:**
- `analysis_status` (text) - pending, analyzing, complete, failed
- `analysis_error` (text)
- `analyzed_at` (timestamp)

#### `planned_workouts` - Training Plan Sessions
Future/planned workouts from training plans or manual planning.

**Key Columns:**
- `id` (uuid, PK)
- `user_id` (uuid, FK)
- `type` (text) - run, ride, swim, strength, mobility
- `date` (date) - Scheduled date
- `workout_status` (text) - planned, completed, skipped
- `training_plan_id` (uuid) - Link to plans table
- `week_number` (integer) - Week in plan
- `day_number` (integer) - Day of week (1-7)
- `completed_workout_id` (uuid) - Link to completed workout

**Plan Structure (JSONB):**
- `steps_preset` - Token array (e.g., `["warmup_run_easy_15min", "5kpace_4x1mi_R2min"]`)
- `computed` - Expanded steps with paces/power/durations
- `strength_exercises` - Planned strength exercises
- `mobility_exercises` - Planned mobility exercises
- `workout_structure` - Alternative structure format

**Display Fields:**
- `description`, `rendered_description`, `friendly_summary`
- `total_duration_seconds`
- `export_hints` - Hints for Garmin export

#### `plans` - Training Plans
User's active training plans.

**Key Columns:**
- `id` (uuid, PK)
- `user_id` (uuid, FK)
- `name` (text) - Plan name
- `status` (text) - active, completed, paused
- `duration_weeks` (integer)
- `current_week` (integer)

**JSONB Configuration:**
- `config` - Full plan configuration
  - `sessions_by_week` - Weekly workout sessions
  - `weekly_summaries` - Focus/notes per week
  - `start_date`, `user_selected_start_date`

#### `user_baselines` - Performance Baselines
User's threshold values for pace/power calculations.

**JSONB Structure:**
```json
{
  "performance_numbers": {
    "fiveK_pace": 375,     // seconds per mile
    "easy_pace": 540,      // seconds per mile
    "ftp": 250,            // watts
    "threshold_heart_rate": 175,
    "max_heart_rate": 190,
    "squat_1rm": 315,      // pounds
    "bench_1rm": 225,
    "deadlift_1rm": 405,
    "overhead_press_1rm": 135
  }
}
```

#### `device_connections` - OAuth Connections
Garmin and Strava OAuth tokens and sync status.

**Key Columns:**
- `provider` (text) - garmin, strava
- `access_token`, `refresh_token`, `expires_at`
- `is_active` (boolean)
- `last_sync` (timestamp)
- `webhook_active`, `webhook_id`

---

## JSONB Data Structures

### `workouts.sensor_data` - Raw Sensor Readings

Time-series array of sensor readings from the workout.

**Structure:**
```json
[
  {
    "timestamp": 1754231873,
    "timerDurationInSeconds": 0,
    "totalDistanceInMeters": 0,
    "heartRate": 145,
    "powerInWatts": 180,
    "elevationInMeters": 351.6,
    "speedMetersPerSecond": 3.5,
    "cadence": 85
  },
  {
    "timestamp": 1754231874,
    "timerDurationInSeconds": 1,
    "totalDistanceInMeters": 3.5,
    "heartRate": 147,
    "powerInWatts": 185,
    "elevationInMeters": 351.8,
    "speedMetersPerSecond": 3.5,
    "cadence": 86
  }
  // ... thousands more samples
]
```

**Usage:**
- Input for `compute-workout-summary` and `analyze-running-workout`
- Used to slice intervals and calculate granular metrics
- NOT displayed directly in UI (processed into `computed`)

### `workouts.gps_track` - GPS Coordinates

Time-series array of GPS coordinates and elevation.

**Structure:**
```json
[
  {
    "timestamp": 1754231873,
    "lat": 34.203492,
    "lng": -118.166226,
    "elevation": 351.6
  },
  {
    "timestamp": 1754231874,
    "lat": 34.203495,
    "lng": -118.166230,
    "elevation": 351.8
  }
  // ... GPS points
]
```

**Usage:**
- Rendered on map in Details screen
- Used to calculate elevation profile
- Correlated with sensor_data by timestamp

### `workouts.computed` - Processed Workout Data

Computed intervals, time-series for charts, and overall metrics.

**Structure:**
```json
{
  "normalization_version": "v1",
  "intervals": [
    {
      "planned_step_id": "abc-123",
      "planned_index": 0,
      "kind": "warmup",
      "role": "warmup",
      "sample_idx_start": 0,
      "sample_idx_end": 300,
      "planned": {
        "duration_s": 900,
        "distance_m": null,
        "target_pace_s_per_mi": 540
      },
      "executed": {
        "duration_s": 905,
        "distance_m": 2700,
        "avg_pace_s_per_mi": 538,
        "avg_hr": 145,
        "avg_power_w": null,
        "adherence_percentage": 99
      },
      "granular_metrics": {
        "pace_variation_pct": 3.2,
        "hr_drift_bpm": 2.1,
        "time_in_target_pct": 98
      }
    }
    // ... more intervals
  ],
  "overall": {
    "distance_m": 10000,
    "duration_s_moving": 3245,
    "duration_s": 3600,
    "avg_pace_s_per_mi": 521,
    "gap_pace_s_per_mi": 518,
    "avg_hr": 155,
    "avg_power_w": 185,
    "normalized_power_w": 195,
    "elevation_gain_m": 150
  },
  "series": {
    "time_s": [0, 1, 2, 3, ...],
    "distance_m": [0, 3.5, 7.0, ...],
    "pace_s_per_mi": [600, 550, 520, ...],
    "heart_rate": [120, 125, 130, ...],
    "power_w": [150, 160, 170, ...],
    "elevation_m": [350, 351, 352, ...]
  },
  "analysis": {
    "splits": [
      {"distance_m": 1609.34, "duration_s": 480, "avg_pace_s_per_mi": 480}
    ],
    "zones": {
      "heart_rate": [
        {"zone": 1, "time_s": 600, "percentage": 16.7},
        {"zone": 2, "time_s": 1800, "percentage": 50.0}
      ]
    }
  }
}
```

**Key Sections:**
- **intervals** - Created by `compute-workout-summary`, enhanced by `analyze-running-workout`
- **overall** - Summary metrics for entire workout
- **series** - Time-series arrays for charts (created by `compute-workout-analysis`)
- **analysis** - Splits and zone distributions

### `workouts.workout_analysis` - AI Insights

Deep analysis with execution scores and insights.

**Structure:**
```json
{
  "version": "2.0",
  "source": "analyze-running-workout",
  "generated_at": "2025-01-15T10:30:00Z",
  "analysis_status": "complete",
  "performance": {
    "execution_adherence": 71,
    "pace_adherence": 71,
    "duration_adherence": 89
  },
  "granular_analysis": {
    "overall_adherence": 0.71,
    "performance_assessment": "Fair execution",
    "primary_issues": [
      "Recovery jogs too slow (66% adherence)",
      "Fading in final intervals"
    ],
    "strengths": [
      "Work intervals consistent",
      "Strong HR control"
    ]
  },
  "detailed_analysis": {
    "pacing": "Consistent pacing on work intervals but recovery jogs significantly too slow",
    "heart_rate": "Good HR control with minimal drift",
    "intervals": "4/6 intervals within target range"
  }
}
```

**Usage:**
- `performance` scores displayed in Summary screen
- `detailed_analysis` displayed in Context screen
- `analysis_status` tracks completion state

### `planned_workouts.computed.steps` - Materialized Plan Structure

Expanded workout steps with resolved paces/power.

**Structure:**
```json
{
  "normalization_version": "v3",
  "steps": [
    {
      "id": "step-uuid-123",
      "planned_index": 0,
      "kind": "warmup",
      "duration_s": 900,
      "seconds": 900,
      "distance_m": null,
      "pace_range": {
        "lower": 513,
        "upper": 567,
        "unit": "mi"
      },
      "paceTarget": "9:00/mi",
      "description": "15 min easy warmup"
    },
    {
      "id": "step-uuid-124",
      "planned_index": 1,
      "kind": "work",
      "duration_s": null,
      "distance_m": 1609.34,
      "seconds": 400,
      "pace_range": {
        "lower": 356,
        "upper": 394,
        "unit": "mi"
      },
      "paceTarget": "6:15/mi",
      "description": "1 mi @ 5K pace"
    },
    {
      "id": "step-uuid-125",
      "planned_index": 2,
      "kind": "recovery",
      "duration_s": 120,
      "seconds": 120,
      "distance_m": null,
      "description": "2 min recovery"
    }
  ],
  "total_duration_seconds": 3420
}
```

**Key Points:**
- `id` - Stable identifier for matching executed intervals
- `pace_range` - Resolved from `user_baselines.performance_numbers.fiveK_pace`
- `power_range` - Resolved from `user_baselines.performance_numbers.ftp`
- `seconds` - Duration calculated for distance-based steps (using pace)

### `strength_exercises` - Strength Workout Sets

**Structure:**
```json
[
  {
    "exercise": "Squat",
    "percentage": 80,
    "sets": 5,
    "reps": 5,
    "weight_lbs": 252,
    "rest_seconds": 180,
    "completed_sets": [
      {"reps": 5, "weight_lbs": 252, "rpe": 7},
      {"reps": 5, "weight_lbs": 252, "rpe": 7},
      {"reps": 5, "weight_lbs": 252, "rpe": 8},
      {"reps": 4, "weight_lbs": 252, "rpe": 9},
      {"reps": 5, "weight_lbs": 245, "rpe": 8}
    ]
  },
  {
    "exercise": "Bench Press",
    "percentage": 75,
    "sets": 3,
    "reps": 8,
    "weight_lbs": 169
  }
]
```

### `mobility_exercises` - Mobility/Stretching

**Structure:**
```json
[
  {
    "name": "Hip Flexor Stretch",
    "duration_seconds": 60,
    "sets": 2,
    "notes": "Hold stretch, don't bounce"
  },
  {
    "name": "Foam Roll IT Band",
    "duration_seconds": 90,
    "sets": 1
  }
]
```

### `swim_data` - Swimming Metrics

**Structure:**
```json
{
  "pool_length_m": 25,
  "pool_unit": "m",
  "total_strokes": 1240,
  "avg_stroke_rate": 32,
  "lengths": [
    {
      "length_number": 1,
      "duration_s": 28,
      "strokes": 16,
      "stroke_type": "freestyle",
      "swolf": 44
    }
  ]
}
```

---

## Edge Functions Catalog

Complete list of all Supabase Edge Functions with purposes and usage.

### Data Ingestion Functions

#### `ingest-activity`
**Purpose:** Convert provider activity data (Garmin/Strava) into `workouts` table format
**Input:** `{ userId, provider, activity }`
**Process:**
1. Normalize provider-specific formats to common schema
2. Extract sensor_data and gps_track
3. Upsert to workouts table (idempotent by provider_activity_id)
4. Return created/updated workout

**Called by:** Webhook handlers, history import functions

#### `garmin-webhook-activities`
**Purpose:** Handle Garmin webhook notifications for new activities
**Input:** Garmin webhook payload
**Process:**
1. Validate webhook signature
2. Fetch activity details from Garmin API
3. Call `ingest-activity` to store
4. Trigger `auto-attach-planned` if applicable

**Triggered by:** Garmin webhook (automatic)

#### `strava-webhook`
**Purpose:** Handle Strava webhook notifications
**Input:** Strava webhook payload
**Process:**
1. Validate webhook subscription
2. Fetch activity from Strava API
3. Call `ingest-activity` to store

**Triggered by:** Strava webhook (automatic)

#### `import-garmin-history`
**Purpose:** Bulk import historical Garmin activities
**Input:** `{ user_id, start_date, end_date }`
**Process:**
1. Fetch activities from Garmin API
2. Process each activity via `ingest-activity`
3. Return count of imported activities

**Called by:** User action (one-time setup)

#### `import-strava-history`
**Purpose:** Bulk import historical Strava activities
**Input:** `{ user_id, start_date, end_date }`
**Process:**
1. Fetch activities from Strava API
2. Process each activity via `ingest-activity`

**Called by:** User action (one-time setup)

### Workout Processing Functions

#### `compute-workout-summary`
**Purpose:** Create basic intervals from raw sensor data
**Input:** `{ workout_id }`
**Process:**
1. Read `workouts.sensor_data`
2. Read `planned_workouts.computed.steps`
3. Normalize samples (pace, HR, power, cadence)
4. Slice sensor data into intervals matching planned structure
5. Calculate basic executed metrics per interval
6. Assign `planned_step_id` for matching
7. Write to `workouts.computed.intervals` and `computed.overall`

**Output:** Basic intervals with averages, no granular analysis yet
**Called by:** `auto-attach-planned`, `ingest-activity`

#### `compute-workout-analysis`
**Purpose:** Generate time-series arrays for charts
**Input:** `{ workout_id }`
**Process:**
1. Read `workouts.sensor_data`
2. Process into time-series arrays
3. Smooth data (EMA for elevation/pace)
4. Calculate splits (mile/km markers)
5. Calculate HR/power zone distributions
6. Write to `workouts.computed.series` and `computed.analysis`

**Output:** Chart-ready time-series data
**Called by:** `useWorkoutDetail.ts` (on-demand), `useWorkouts.ts` (fire-and-forget)
**Note:** Also writes generic `workout_analysis` (lower priority than detailed analysis)

#### `analyze-running-workout`
**Purpose:** Deep running-specific analysis with execution scoring
**Input:** `{ workout_id }`
**Process:**
1. Read `workouts.computed.intervals` (basic intervals)
2. Read `workouts.sensor_data` (for sample-level analysis)
3. Read `planned_workouts.computed.steps` (target ranges)
4. For each interval:
   - Calculate time-in-target-zone percentage
   - Analyze pace variability
   - Track HR drift
   - Identify pacing patterns
5. Calculate Garmin-style execution scores
6. Identify issues and strengths
7. Generate AI insights
8. Write enhanced intervals and analysis

**Output:** 
- Enhanced `workouts.computed.intervals[].granular_metrics`
- Complete `workouts.workout_analysis` with insights
**Called by:** `analyzeWorkoutWithRetry()` from Context screen
**Analysis Status:** Sets `analysis_status` = 'analyzing' → 'complete'

#### `analyze-strength-workout`
**Purpose:** Strength training analysis
**Input:** `{ workout_id }`
**Process:**
1. Read `workouts.strength_exercises` (completed)
2. Read `planned_workouts.strength_exercises` (planned)
3. Analyze volume completion
4. Compare intensity (weight percentages)

**Called by:** `analyzeWorkoutWithRetry()` for strength workouts

#### `calculate-workout-metrics`
**Purpose:** Calculate additional derived metrics
**Input:** `{ workout_id }`
**Process:**
1. Calculate training stress score (TSS)
2. Calculate intensity factor (IF)
3. Compute grade-adjusted pace (GAP)

**Called by:** `useWorkouts.ts` (fire-and-forget)

#### `calculate-workload`
**Purpose:** Calculate workload score for training load tracking
**Input:** `{ workout_id }` or `{ workout_data }`
**Formula:** `workload = duration_hours × intensity² × 100`
**Process:**
1. Determine workout type
2. Infer intensity from tags/structure
3. Calculate workload score
4. Write to `workload_planned` or `workload_actual`

**Called by:** Database triggers, manual calls

### Plan Management Functions

#### `get-week`
**Purpose:** **THE UNIFIED VIEW** - Merge planned and executed workouts for calendar display
**Input:** `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`
**Process:**
1. Check user's active plans
2. On-demand materialization: Create missing `planned_workouts` rows from plan config
3. Fetch `workouts` in date range
4. Fetch `planned_workouts` in date range
5. Merge by date+type into unified items
6. Process pace/power ranges from user baselines
7. Calculate weekly stats
8. Return unified view

**Output:**
```typescript
{
  items: Array<{
    id: string;
    date: string;
    type: string;
    status: 'planned' | 'completed' | 'skipped';
    planned: { steps, total_duration_seconds, ... } | null;
    executed: { intervals, overall, ... } | null;
  }>,
  weekly_stats: { planned: number, completed: number },
  training_plan_context: { planName, currentWeek, focus, ... }
}
```

**Called by:** `useWeekUnified()` hook
**Critical:** This is the ONLY way UI gets calendar data

#### `materialize-plan`
**Purpose:** Expand step tokens into computed.steps with resolved paces/power
**Input:** `{ planned_workout_id }` or `{ plan_id }`
**Process:**
1. Load planned workout(s)
2. Read `steps_preset` token array
3. Parse tokens (e.g., "warmup_run_easy_15min", "5kpace_4x1mi_R2min")
4. Load user baselines (fiveK_pace, easy_pace, ftp)
5. Expand tokens into structured steps
6. Resolve pace_range from baselines
7. Calculate duration for distance-based steps
8. Assign stable `id` to each step
9. Write to `planned_workouts.computed.steps`

**Token Examples:**
- `warmup_run_easy_15min` → 15min warmup at easy_pace ±5%
- `5kpace_4x1mi_R2min` → 4 × 1mi at fiveK_pace with 2min recovery
- `bike_ss_3x12min_R4min` → 3 × 12min at 88-92% FTP with 4min recovery

**Called by:** `get-week` (on-demand), manual materialization

#### `activate-plan`
**Purpose:** Activate a training plan for a user
**Input:** `{ plan_id, start_date }`
**Process:**
1. Set plan status to 'active'
2. Store start_date in config
3. Trigger materialization for upcoming weeks

**Called by:** User action in plan selection

#### `generate-plan`
**Purpose:** Generate a new training plan based on user goals
**Input:** `{ goal, distance, current_fitness, weeks }`
**Process:**
1. Select appropriate plan template
2. Customize based on user input
3. Generate sessions_by_week structure
4. Create plan record

**Called by:** Plan builder UI

### Workout Operations Functions

#### `auto-attach-planned`
**Purpose:** Automatically link a completed workout to a planned workout
**Input:** `{ workout_id }`
**Process:**
1. Load workout (date, type)
2. Find matching planned_workout (same date + type)
3. Link via `workout.planned_id`
4. Call `compute-workout-summary` to slice intervals
5. Optionally call `analyze-running-workout` for analysis

**Called by:** `useWorkouts.addWorkout()`, `ingest-activity`

#### `workout-detail`
**Purpose:** Fetch full workout data including GPS and sensors
**Input:** `{ id, include_gps, include_sensors, resolution }`
**Process:**
1. Fetch workout from database
2. Include gps_track if requested
3. Include sensor_data if requested
4. Optionally downsample for performance
5. Return full workout object

**Called by:** `useWorkoutDetail()` hook

#### `send-workout-to-garmin`
**Purpose:** Export planned workout to Garmin device
**Input:** `{ planned_workout_id }`
**Process:**
1. Load planned workout
2. Convert to Garmin FIT format
3. Send to Garmin API
4. Return success/failure

**Called by:** User action (export button)

### Analysis and Context Functions

#### `analyze-weekly-ai`
**Purpose:** Generate AI summary for a week of training
**Input:** `{ from_date, to_date, user_id }`
**Process:**
1. Fetch all workouts in range
2. Analyze training patterns
3. Generate weekly summary with AI

**Status:** Experimental

#### `generate-overall-context`
**Purpose:** Generate training context across multiple weeks
**Input:** `{ user_id, weeks }`
**Process:**
1. Fetch recent workout history
2. Analyze trends
3. Generate context summary

**Status:** Under development

### Utility Functions

#### `backfill-week-summaries`
**Purpose:** Backfill weekly summary data for existing plans
**Called by:** Admin/maintenance

#### `sweep-user-history`
**Purpose:** Recalculate workload for all historical workouts
**Called by:** Admin/maintenance

#### `get-weather`
**Purpose:** Fetch weather data for workout location/time
**Called by:** Workout detail view (optional enhancement)

---

## Frontend Architecture

### Hooks (Data Fetching)

#### `useWorkouts()`
**Purpose:** Direct table queries for workout CRUD operations
**Returns:** `{ workouts, loading, addWorkout, updateWorkout, deleteWorkout }`
**Query Pattern:**
```typescript
const { data } = await supabase
  .from("workouts")
  .select('id, type, date, distance, ...')
  .eq("user_id", user.id)
  .gte("date", lookbackDate)
  .order("date", { ascending: false });
```
**Note:** Queries table directly (not via edge function) for CRUD operations

#### `useWeekUnified(fromISO, toISO)`
**Purpose:** Fetch unified planned + executed view for calendar
**Returns:** `{ items, weeklyStats, trainingPlanContext, loading }`
**Pattern:**
```typescript
const { data } = await supabase.functions.invoke('get-week', {
  body: { from: fromISO, to: toISO }
});
```
**Critical:** This is how calendar gets ALL its data

#### `useWorkoutDetail(workoutId, options)`
**Purpose:** Fetch full workout with GPS/sensors for detail view
**Returns:** `{ data, loading, error }`
**Pattern:**
```typescript
const { data } = await supabase.functions.invoke('workout-detail', {
  body: { 
    id: workoutId,
    include_gps: true,
    include_sensors: true,
    resolution: 'high'
  }
});
```
**Auto-triggers:** `compute-workout-analysis` if `computed.series` missing

#### `usePlannedWorkouts()`
**Purpose:** Fetch planned workouts for management
**Returns:** `{ plannedWorkouts, loading, addPlannedWorkout, ... }`
**Query Pattern:** Direct table query with date bounds

#### `useWorkoutsRange(fromISO, toISO)`
**Purpose:** Lightweight workout queries for specific date ranges
**Returns:** Minimal workout data for performance
**Caching:** Aggressive caching with TTL

### Services

#### `workoutAnalysisService.ts`
**Purpose:** Route analysis requests to discipline-specific functions
**Key Functions:**
```typescript
function analyzeWorkout(workoutId: string, workoutType: string) {
  const functionName = getAnalysisFunction(workoutType);
  return await supabase.functions.invoke(functionName, {
    body: { workout_id: workoutId }
  });
}

function getAnalysisFunction(type: string): string {
  switch (type.toLowerCase()) {
    case 'run': return 'analyze-running-workout';
    case 'strength': return 'analyze-strength-workout';
    case 'ride': return 'analyze-cycling-workout';
    case 'swim': return 'analyze-swimming-workout';
  }
}

function analyzeWorkoutWithRetry(workoutId, workoutType, maxRetries=2) {
  // Exponential backoff retry logic
}
```

#### `workloadService.ts`
**Purpose:** Interface for workload calculations
**Functions:**
```typescript
calculateWorkloadForWorkout(workout_id)
sweepUserHistory(user_id, batch_size, dry_run)
```

#### `GarminDataService.ts`
**Purpose:** Garmin OAuth and sync operations
**Functions:**
- OAuth flow handling
- Token refresh
- Activity sync triggering

#### `StravaDataService.ts`
**Purpose:** Strava OAuth and sync operations
**Functions:**
- OAuth flow handling
- Token management
- Webhook subscription

### Components (Key Screens)

#### Calendar View (`AppLayout.tsx`, `useWeekUnified`)
```typescript
const { items } = useWeekUnified(mondayISO, sundayISO);
// items already has { planned, executed, status }
// Just render!
```

#### Workout Detail (`UnifiedWorkoutView.tsx`, `useWorkoutDetail`)
```typescript
const { data: workout } = useWorkoutDetail(workoutId, {
  include_gps: true,
  include_sensors: true
});
// workout.computed.series → charts
// workout.gps_track → map
```

#### Context/Analysis (`TodaysWorkoutsTab.tsx`)
```typescript
const analyzeWorkout = async (workoutId, workoutType) => {
  await analyzeWorkoutWithRetry(workoutId, workoutType);
  // Polls for analysis_status === 'complete'
  // Displays workout_analysis.detailed_analysis
};
```

---

## Key Data Flows

### Flow 1: New Workout from Garmin

```
1. Garmin sends webhook → garmin-webhook-activities
2. Fetch activity details from Garmin API
3. ingest-activity:
   - Normalize to common format
   - Store sensor_data, gps_track
   - Write to workouts table
4. auto-attach-planned:
   - Find matching planned_workout (same date+type)
   - Link via planned_id
5. compute-workout-summary:
   - Slice sensor_data into intervals
   - Match to planned.computed.steps
   - Write basic intervals to computed.intervals
6. User views calendar:
   - useWeekUnified calls get-week
   - get-week returns unified items
   - UI shows completed workout with planned overlay
7. User taps workout → Context tab:
   - analyze-running-workout triggered
   - Deep analysis with granular_metrics
   - workout_analysis written with insights
   - UI displays detailed analysis
```

### Flow 2: Plan Activation and Materialization

```
1. User selects plan → activate-plan
   - Plan status = 'active'
   - start_date stored in config
2. User views calendar → useWeekUnified calls get-week
3. get-week detects missing planned_workouts rows:
   - Reads plans.config.sessions_by_week
   - Creates planned_workouts rows for visible week
   - Stores steps_preset tokens
4. get-week checks if computed.steps missing:
   - Calls materialize-plan for those rows
5. materialize-plan:
   - Loads user_baselines (fiveK_pace, ftp)
   - Expands tokens → structured steps
   - Resolves pace_range/power_range
   - Writes to computed.steps
6. get-week returns unified items:
   - planned.steps has fully resolved structure
   - Frontend displays workout details
```

### Flow 3: Manual Workout Entry

```
1. User enters workout manually
2. useWorkouts.addWorkout():
   - Insert to workouts table
   - If strength: store strength_exercises
3. auto-attach-planned attempts to link
4. User can manually attach later
5. Analysis triggered on-demand when user views Context
```

### Flow 4: Analysis Request from UI

```
1. User opens Context tab for workout
2. TodaysWorkoutsTab checks workout_analysis.analysis_status
3. If status !== 'complete':
   - Call analyzeWorkoutWithRetry(workoutId, workoutType)
   - Frontend knows workoutType, routes to correct analyzer
4. analyze-running-workout edge function:
   - Sets analysis_status = 'analyzing'
   - Processes intervals + sensor data
   - Calculates execution scores
   - Generates insights
   - Writes workout_analysis
   - Sets analysis_status = 'complete'
5. Frontend polls for status:
   - Exponential backoff (500ms, 1s, 2s, ...)
   - Max 8 attempts
   - When complete, refetch workout
6. UI displays detailed_analysis
```

---

## Design Patterns

### Pattern 1: Smart Server, Dumb Client

**Philosophy:** All computation on server, client just renders.

**Example - BAD (Client computation):**
```typescript
// ❌ Client merging data
const planned = await fetchPlanned();
const executed = await fetchExecuted();
const merged = planned.map(p => ({
  ...p,
  executed: executed.find(e => e.date === p.date && e.type === p.type)
}));
```

**Example - GOOD (Server does it):**
```typescript
// ✅ Server returns merged data
const { items } = await supabase.functions.invoke('get-week', {
  body: { from, to }
});
// items already has { planned, executed }
```

### Pattern 2: JSONB Storage

**Benefits:**
- Flexible schemas
- No migrations for structure changes
- Queryable with JSONB operators
- Handles variable-length arrays

**Example:**
```sql
-- Query workouts with specific tag
SELECT * FROM planned_workouts
WHERE tags @> '["brick"]'::jsonb;

-- Query by nested field
SELECT * FROM workouts
WHERE computed->'overall'->>'distance_m' > '10000';
```

### Pattern 3: Unified View

**Principle:** Single endpoint for all calendar data.

**Implementation:**
- `get-week` is the ONLY source of truth
- Client NEVER queries `planned_workouts` or `workouts` directly
- Always returns consistent structure

**Benefits:**
- No client-side merge logic
- Consistent data shape
- Single point of optimization
- Easy to add features (server-side only)

### Pattern 4: Direct Discipline Routing

**Principle:** Frontend knows workout type, routes directly to specialized analyzer.

**Implementation:**
```typescript
// workoutAnalysisService.ts
function getAnalysisFunction(type: string): string {
  switch (type.toLowerCase()) {
    case 'run': return 'analyze-running-workout';
    case 'strength': return 'analyze-strength-workout';
    // ...
  }
}

// Usage
await supabase.functions.invoke(
  getAnalysisFunction(workout.type),
  { body: { workout_id } }
);
```

**Benefits:**
- No orchestrator overhead
- Discipline-specific logic
- Easier to maintain
- Faster execution

### Pattern 5: Analysis Status Tracking

**Principle:** Async operations tracked with explicit status.

**Implementation:**
```sql
-- Database columns
analysis_status TEXT DEFAULT 'pending', -- pending, analyzing, complete, failed
analysis_error TEXT,
analyzed_at TIMESTAMP
```

```typescript
// Frontend polling
const pollAnalysisStatus = async (workoutId, attempt = 1) => {
  if (attempt > maxAttempts) throw new Error('Timeout');
  
  const { data: workout } = await supabase
    .from('workouts')
    .select('workout_analysis')
    .eq('id', workoutId)
    .single();
  
  if (workout.workout_analysis?.analysis_status === 'complete') {
    return workout; // Done!
  }
  
  const delay = Math.pow(2, attempt) * 500; // Exponential backoff
  await sleep(delay);
  return pollAnalysisStatus(workoutId, attempt + 1);
};
```

**Benefits:**
- No race conditions
- User sees progress
- Handles failures gracefully
- Enables retry logic

### Pattern 6: On-Demand Materialization

**Principle:** Create data lazily when needed, not eagerly.

**Implementation:**
```typescript
// get-week edge function
if (activePlan && !plannedWorkoutsExist) {
  // Create planned_workouts rows from plan config
  const sessions = plan.config.sessions_by_week[weekNumber];
  for (const session of sessions) {
    await supabase.from('planned_workouts').insert({
      date: session.date,
      type: session.type,
      steps_preset: session.steps_preset
    });
  }
}

if (needsComputed) {
  // Materialize steps on-demand
  await supabase.functions.invoke('materialize-plan', {
    body: { planned_workout_id }
  });
}
```

**Benefits:**
- No wasted computation
- Plans don't create 1000s of rows upfront
- Fast plan activation
- Database stays lean

---

## Analysis System

### Two-Stage Processing

The analysis system operates in two sequential stages:

#### Stage 1: compute-workout-summary (Fast, Always Runs)

**Purpose:** Create basic intervals from raw sensor data

**Input:**
- `workouts.sensor_data` (raw samples)
- `planned_workouts.computed.steps` (planned structure)

**Process:**
1. Normalize samples (handle different provider formats)
2. Slice sensor data into intervals matching planned structure
3. Calculate basic averages per interval (pace, HR, power)
4. Assign `planned_step_id` for matching
5. Calculate basic adherence percentage

**Output:**
- `workouts.computed.intervals` - Basic intervals with averages
- `workouts.computed.overall` - Summary metrics

**Performance:** Fast (~1-2 seconds), always runs on ingestion

#### Stage 2: analyze-running-workout (Deep, On-Demand)

**Purpose:** Deep analysis with execution scoring and insights

**Input:**
- `workouts.computed.intervals` (from stage 1)
- `workouts.sensor_data` (for sample-level analysis)
- `planned_workouts.computed.steps` (target ranges)

**Process:**
1. For each interval, analyze sample-by-sample:
   - Time in prescribed pace/power range (not just average)
   - Pace variability (standard deviation)
   - HR drift over interval duration
   - Pacing patterns (fading, surging, consistent)
2. Calculate Garmin-style execution scores:
   - Overall execution adherence (0-100)
   - Pace adherence (0-100)
   - Duration adherence (0-100)
3. Identify specific issues:
   - "Recovery jogs 34% too slow"
   - "Fading in final 2 intervals"
   - "Started too fast"
4. Identify strengths:
   - "Excellent consistency across work intervals"
   - "Strong HR control with minimal drift"
5. Generate detailed narrative insights

**Output:**
- Enhanced `workouts.computed.intervals[].granular_metrics`
  - `pace_variation_pct`
  - `hr_drift_bpm`
  - `time_in_target_pct`
- Complete `workouts.workout_analysis`
  - `performance` scores (Summary screen)
  - `detailed_analysis` narratives (Context screen)
  - `strengths`, `primary_issues`

**Performance:** Slower (~5-10 seconds), on-demand only

### Analysis Status Lifecycle

```
pending (default)
  ↓
analyzing (when function starts)
  ↓
complete (when function finishes) OR failed (on error)
```

**Frontend Handling:**
```typescript
// Check status before displaying
if (workout.workout_analysis?.analysis_status !== 'complete') {
  // Trigger analysis
  await analyzeWorkoutWithRetry(workoutId, workoutType);
  // Poll for completion
}
// Display detailed_analysis
```

### Execution Scoring Algorithm

Based on Garmin's execution score methodology:

**Formula:** `100 - total_penalties`

**Penalties Applied:**
1. **Base Deviation Penalty:**
   - For each interval: `|adherence% - 100%|`
   - Tolerance: 5% for work intervals, 15% for recovery
   - Only penalize excess deviation

2. **Directional Penalty:**
   - Work intervals too slow: extra penalty
   - Recovery intervals too fast: extra penalty

3. **Weighting:**
   - Work intervals: weight = 1.0
   - Recovery intervals: weight = 0.7
   - Warmup/cooldown: weight = 0.5

**Example:**
```
Work interval at 107% adherence:
- Deviation: 7% (exceeds 5% tolerance by 2%)
- Base penalty: 2% × 1.0 = 2.0
- Direction penalty: 0 (close enough)
- Total: 2.0

Recovery jog at 66% adherence:
- Deviation: 34% (exceeds 15% tolerance by 19%)
- Base penalty: 19% × 0.7 = 13.3
- Direction penalty: 3 (way too slow)
- Total: 16.3

Overall score: 100 - (2.0 + 16.3 + ...) = 71%
```

---

## Plan System

### Plan Storage Architecture

**Plans table:**
```json
{
  "id": "uuid",
  "name": "70.3 Training - 12 weeks",
  "status": "active",
  "duration_weeks": 12,
  "current_week": 3,
  "config": {
    "start_date": "2025-01-06",
    "user_selected_start_date": "2025-01-06",
    "sessions_by_week": {
      "1": [
        {
          "day": "Monday",
          "type": "run",
          "steps_preset": ["warmup_run_easy_15min", "5kpace_4x1mi_R2min", "cooldown_run_easy_10min"],
          "tags": []
        },
        {
          "day": "Wednesday",
          "type": "ride",
          "steps_preset": ["warmup_bike_quality_15min_fastpedal", "bike_ss_3x12min_R4min", "cooldown_bike_10min"]
        }
      ],
      "2": [ ... ]
    },
    "weekly_summaries": {
      "1": {
        "focus": "Build aerobic base",
        "notes": "Easy week to establish routine",
        "key_workouts": ["Monday run", "Saturday long run"]
      }
    }
  }
}
```

### Token System (Workout DSL)

Compact domain-specific language for defining workouts.

**Token Format:** `{discipline}_{type}_{structure}_{modifiers}`

**Running Tokens:**
- `warmup_run_easy_15min` - 15 min warmup at easy pace
- `5kpace_4x1mi_R2min` - 4 × 1 mile at 5K pace with 2 min recovery
- `easypace_30min` - 30 min at easy pace
- `long_run_90min` - 90 min long run
- `cooldown_run_easy_10min` - 10 min cooldown

**Cycling Tokens:**
- `warmup_bike_quality_15min_fastpedal` - 15 min warmup with fast pedaling
- `bike_ss_3x12min_R4min` - 3 × 12 min sweet spot (88-92% FTP) with 4 min recovery
- `bike_thr_4x8min_R5min` - 4 × 8 min threshold (95-100% FTP) with 5 min recovery
- `cooldown_bike_10min` - 10 min cooldown

**Swimming Tokens:**
- `swim_warmup_400yd_easy` - 400 yd easy warmup
- `swim_main_8x100yd_r20_moderate` - 8 × 100 yd with 20s rest, moderate pace
- `swim_pull_4x100yd_r20_buoy` - 4 × 100 yd pull with buoy
- `swim_kick_4x50yd_r15_board` - 4 × 50 yd kick with board
- `swim_cooldown_200yd_easy` - 200 yd easy cooldown

**Strength Tokens:**
- `strength_squat_@pct80_5x5` - Squat 5×5 @ 80% 1RM
- `strength_bench_@pct75_3x8` - Bench press 3×8 @ 75% 1RM

### Materialization Process

**materialize-plan edge function** expands tokens into structured steps:

**Input:** `steps_preset: ["warmup_run_easy_15min", "5kpace_4x1mi_R2min"]`

**Process:**
1. Load `user_baselines.performance_numbers`:
   ```json
   {
     "fiveK_pace": 375,  // 6:15/mi in seconds
     "easy_pace": 540,   // 9:00/mi in seconds
     "ftp": 250          // watts
   }
   ```

2. Parse token `warmup_run_easy_15min`:
   - Duration: 15 minutes = 900 seconds
   - Pace: easy_pace = 540 s/mi
   - Tolerance: ±5% = 513-567 s/mi

3. Parse token `5kpace_4x1mi_R2min`:
   - Reps: 4
   - Distance: 1 mile = 1609.34 m
   - Pace: fiveK_pace = 375 s/mi
   - Tolerance: ±5% = 356-394 s/mi
   - Recovery: 2 minutes = 120 seconds

4. Generate structured steps:
   ```json
   {
     "steps": [
       {
         "id": "step-uuid-1",
         "planned_index": 0,
         "kind": "warmup",
         "duration_s": 900,
         "seconds": 900,
         "pace_range": {"lower": 513, "upper": 567, "unit": "mi"},
         "paceTarget": "9:00/mi",
         "description": "15 min easy warmup"
       },
       {
         "id": "step-uuid-2",
         "planned_index": 1,
         "kind": "work",
         "distance_m": 1609.34,
         "seconds": 400,
         "pace_range": {"lower": 356, "upper": 394, "unit": "mi"},
         "paceTarget": "6:15/mi"
       },
       {
         "id": "step-uuid-3",
         "planned_index": 2,
         "kind": "recovery",
         "duration_s": 120,
         "seconds": 120
       },
       // Repeat work+recovery 3 more times (4 total)
     ],
     "total_duration_seconds": 3420
   }
   ```

5. Write to `planned_workouts.computed`:
   ```sql
   UPDATE planned_workouts
   SET 
     computed = '{"normalization_version": "v3", "steps": [...]}',
     total_duration_seconds = 3420,
     duration = 57  -- minutes
   WHERE id = 'planned-uuid';
   ```

**Benefits:**
- Compact storage (tokens vs full structure)
- Easy to author plans
- Resolves paces dynamically from user baselines
- Maintains stable IDs for interval matching

### On-Demand Materialization in get-week

```typescript
// Pseudo-code from get-week
if (activePlansExist) {
  const dates = getDatesInRange(from, to);
  
  for (const plan of activePlans) {
    for (const date of dates) {
      const weekNumber = getWeekNumber(date, plan.start_date);
      const dayName = getDayName(date); // "Monday", "Tuesday", etc.
      
      const sessions = plan.config.sessions_by_week[weekNumber];
      const daySessions = sessions.filter(s => s.day === dayName);
      
      for (const session of daySessions) {
        // Check if planned_workout row exists
        const exists = await checkExists(plan.id, date, session.type);
        
        if (!exists) {
          // Create row with tokens
          await supabase.from('planned_workouts').insert({
            training_plan_id: plan.id,
            date: date,
            type: session.type,
            steps_preset: session.steps_preset,
            week_number: weekNumber,
            day_number: dayIndex[dayName]
          });
        }
      }
    }
  }
  
  // Materialize any rows missing computed.steps
  const needsCompute = await findRowsWithoutComputed(from, to);
  for (const row of needsCompute) {
    await invoke('materialize-plan', { planned_workout_id: row.id });
  }
}
```

**Result:** Calendar view triggers materialization for visible week only. No waste.

---

## Dashboard/Main Screen Architecture

### Overview

The main authenticated screen consists of two primary components stacked vertically:

1. **TodaysEffort** (top) - Today's workouts + weather
2. **WorkoutCalendar** (below) - 7-day week view

Both components fetch data from the **same source**: `useWeekUnified()` hook → `get-week` edge function.

### Component 1: TodaysEffort

**File:** `src/components/TodaysEffort.tsx`

**Purpose:** Display today's (or selected date's) workouts and local weather

**Data Sources:**
```typescript
// Single-day unified data
const { items, loading } = useWeekUnified(activeDate, activeDate);

// Weather from browser geolocation
const { weather } = useWeather({
  lat: dayLoc?.lat,
  lng: dayLoc?.lng,
  timestamp: `${activeDate}T12:00:00`,
  enabled: !!dayLoc
});
```

**Weather Integration:**
1. Browser requests geolocation permission (once, ephemeral)
2. Coordinates sent to `get-weather` edge function
3. Returns: temperature, condition, daily high/low, sunrise, sunset
4. Display format: "54° Partly Cloudy • High 62° • ☀️ 6:42 AM"

**Workout Display:**
- **Planned workouts:** Shows description, steps, duration
- **Completed workouts:** Shows metrics (distance, pace, HR, power)
- **Strength workouts:** Shows exercise summaries with abbreviations
  - Example: "OHP 3×5 @135 lbs, Squat 5×5 @252 lbs"

**Key Features:**
- Expandable detail views (click to expand full steps)
- Real-time data from unified view
- Weather cached per location+timestamp
- Displays both planned and completed for same day

### Component 2: WorkoutCalendar

**File:** `src/components/WorkoutCalendar.tsx`

**Purpose:** Display 7-day week view (Mon-Sun) with planned and completed workouts

**Data Source:**
```typescript
// Full week data
const { items, weeklyStats, trainingPlanContext, loading } = 
  useWeekUnified(mondayISO, sundayISO);
```

**Cell Label Generation:**

Uses `derivePlannedCellLabel(workout)` to create abbreviated labels:

**Running Labels:**
- Long run: `RN-LR 60m` (60 minute long run)
- Tempo: `RN-TMP 45m`
- VO2 intervals: `RN-INT-VO2 30m`
- Speed work: `RN-INT-SP 20m`
- Hills: `RN-INT-HL 35m`
- Easy run: `RN 40m`

**Cycling Labels:**
- VO2 max: `BK-INT-VO2 45m`
- Threshold: `BK-THR 60m`
- Sweet spot: `BK-SS 90m`
- Long ride: `BK-LR 120m`
- Easy: `BK 60m`

**Swimming Labels:**
- Intervals: `SM-INT 45m`
- Drills/technique: `SM-DRL 30m`
- Easy: `SM 40m`

**Strength Labels:**
- Compound: `STG-CMP 45m` (squat/deadlift/bench/OHP)
- Accessory: `STG-ACC 30m` (chin/row/lunge)
- Core: `STG-CORE 20m`
- General: `STG 40m`

**Mobility Labels:**
- Mobility/PT: `MBL`

**Label Logic:**
```typescript
function derivePlannedCellLabel(w: any): string | null {
  // 1. Resolve duration from multiple sources
  const secs = resolveDuration(w);
  const mins = Math.round(secs / 60);
  const durStr = mins > 0 ? `${mins}m` : '';
  
  // 2. Match patterns in steps_preset or description
  const has = (pat: RegExp) => 
    steps.some(s => pat.test(s)) || pat.test(description);
  
  // 3. Return discipline + type + duration
  if (type === 'run' && has(/longrun_/)) return `RN-LR ${durStr}`;
  // ... more patterns
}
```

**Duration Resolution Priority:**
1. `total_duration_seconds` (row-level)
2. `computed.total_duration_seconds`
3. Sum of `computed.steps[].seconds`
4. Sum of legacy intervals structure

**Completion Indicators:**
- `✓` - Workout completed
- `✓✓` - Workout completed AND linked to planned workout (via `planned_id`)
- No checkmark - Planned only

**Footer Display:**
```
Total Workload: 145 planned / 130 completed
```
- Values from `weeklyStats.planned` and `weeklyStats.completed`
- Hybrid calculation: actual if completed, planned if not

**Week Navigation:**
- Swipe left/right to change weeks
- Week always anchored to Monday-Sunday
- Auto-fetches surrounding weeks (prefetch)

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     DASHBOARD DATA FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User opens app                                             │
│       ↓                                                      │
│  AuthWrapper → AppLayout                                    │
│       ↓                                                      │
│  AppLayout renders:                                         │
│    - TodaysEffort (top)                                     │
│    - WorkoutCalendar (below)                                │
│       ↓                                                      │
│  TodaysEffort calls:                                        │
│    1. useWeekUnified(today, today)                          │
│       → get-week edge function                              │
│       → returns today's unified items                       │
│    2. useWeather(lat, lng, timestamp)                       │
│       → get-weather edge function                           │
│       → returns weather data                                │
│       ↓                                                      │
│  WorkoutCalendar calls:                                     │
│    useWeekUnified(monday, sunday)                           │
│       → get-week edge function                              │
│       → returns week's unified items                        │
│       ↓                                                      │
│  get-week processing:                                       │
│    1. Check active plans                                    │
│    2. Materialize missing planned_workouts (on-demand)      │
│    3. Fetch workouts in range                               │
│    4. Merge planned + executed                              │
│    5. Calculate weeklyStats                                 │
│    6. Return unified items                                  │
│       ↓                                                      │
│  React renders:                                             │
│    - Weather at top                                         │
│    - Today's workouts (TodaysEffort)                        │
│    - Calendar grid (WorkoutCalendar)                        │
│    - Footer with total workload                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Implementation Details

**Single Data Source:**
Both components use `useWeekUnified()` - just different date ranges:
- TodaysEffort: `useWeekUnified(today, today)` - 1 day
- WorkoutCalendar: `useWeekUnified(mon, sun)` - 7 days

**No Separate Fetches:**
- Calendar does NOT query `planned_workouts` table directly
- Calendar does NOT query `workouts` table directly
- Everything flows through `get-week` edge function

**Smart Label Generation:**
- Parses `steps_preset` tokens (e.g., `"warmup_run_easy_15min"`)
- Matches keywords in `description` field
- Resolves duration from multiple sources (robust fallbacks)
- Returns compact, meaningful labels for calendar cells

**Weather Persistence:**
- Geolocation requested once per session
- No persistent storage of coordinates
- Weather data cached by `useWeather` hook
- Optional feature (gracefully handles permission denial)

**Workload Display:**
- Calculated server-side by `calculate-workload` edge function
- Formula: `workload = duration_hours × intensity² × 100`
- Displayed in calendar footer
- Hybrid sum: actual if completed, planned if not

---

## UI Data Access Patterns

### Pattern 1: Calendar View (Unified Items)

**Component:** `AppLayout.tsx` with calendar grid

**Data Flow:**
```typescript
// Hook call
const { items, weeklyStats, loading } = useWeekUnified(mondayISO, sundayISO);

// items structure
items = [
  {
    id: "uuid",
    date: "2025-01-06",
    type: "run",
    status: "completed",
    planned: {
      id: "planned-uuid",
      steps: [...],
      total_duration_seconds: 3420,
      description: "4 × 1 mile @ 5K pace"
    },
    executed: {
      intervals: [...],
      overall: { distance_m: 10000, duration_s_moving: 3245, ... }
    }
  }
]

// Render
{items.map(item => (
  <CalendarCell
    key={item.id}
    date={item.date}
    planned={item.planned}
    executed={item.executed}
    status={item.status}
  />
))}
```

**Cache Strategy:**
- React Query with 60 min stale time
- Keep previous data during refetch (no flicker)
- Invalidate on `week:invalidate` event

### Pattern 2: Workout Detail View (Full Data)

**Component:** `UnifiedWorkoutView.tsx`

**Data Flow:**
```typescript
// Hook call with options
const { data: workout, loading } = useWorkoutDetail(workoutId, {
  include_gps: true,
  include_sensors: true,
  resolution: 'high'
});

// workout structure
workout = {
  id: "uuid",
  type: "run",
  date: "2025-01-06",
  computed: {
    intervals: [...],
    overall: {...},
    series: {
      time_s: [...],
      pace_s_per_mi: [...],
      heart_rate: [...],
      elevation_m: [...]
    },
    analysis: {
      splits: [...],
      zones: {...}
    }
  },
  gps_track: [
    {lat: 34.20, lng: -118.16, elevation: 350},
    ...
  ],
  workout_analysis: {
    performance: {...},
    detailed_analysis: {...}
  }
}

// Render tabs
<Tabs>
  <Tab name="Details">
    <Map gpsTrack={workout.gps_track} />
    <Charts series={workout.computed.series} />
    <SplitsTable splits={workout.computed.analysis.splits} />
  </Tab>
  <Tab name="Summary">
    <PlannedVsCompleted 
      planned={linkedPlanned?.computed.steps}
      intervals={workout.computed.intervals}
    />
  </Tab>
  <Tab name="Context">
    <AnalysisInsights analysis={workout.workout_analysis} />
  </Tab>
</Tabs>
```

**Auto-triggers:**
- If `computed.series` missing → call `compute-workout-analysis`
- Polls with timeout until series available
- Merges with context data

### Pattern 3: Analysis Trigger (On-Demand)

**Component:** `TodaysWorkoutsTab.tsx` (Context screen)

**Data Flow:**
```typescript
const analyzeWorkout = async (workoutId: string, workoutType: string) => {
  try {
    setAnalyzingWorkout(workoutId);
    
    // Fire analysis request (don't wait)
    analyzeWorkoutWithRetry(workoutId, workoutType)
      .catch(err => setAnalysisError(err.message));
    
    // Start polling for completion
    pollAnalysisStatus(workoutId);
  } catch (error) {
    setAnalysisError(error.message);
  }
};

const pollAnalysisStatus = async (workoutId: string, attempt = 1) => {
  const maxAttempts = 8;
  const baseDelay = 500;
  
  if (attempt > maxAttempts) {
    throw new Error('Analysis timeout');
  }
  
  const { data: workout } = await supabase
    .from('workouts')
    .select('workout_analysis')
    .eq('id', workoutId)
    .single();
  
  const status = workout.workout_analysis?.analysis_status;
  
  if (status === 'complete') {
    // Done! Refetch and display
    await queryClient.invalidateQueries(['workout', workoutId]);
    setAnalyzingWorkout(null);
    return;
  }
  
  if (status === 'failed') {
    throw new Error(workout.workout_analysis?.analysis_error);
  }
  
  // Continue polling with exponential backoff
  const delay = baseDelay * Math.pow(2, attempt - 1);
  setTimeout(() => pollAnalysisStatus(workoutId, attempt + 1), delay);
};

// UI state
{analyzingWorkout === workout.id ? (
  <Spinner>Analyzing workout...</Spinner>
) : workout.workout_analysis?.analysis_status === 'complete' ? (
  <DetailedAnalysis data={workout.workout_analysis} />
) : (
  <Button onClick={() => analyzeWorkout(workout.id, workout.type)}>
    Tap to analyze
  </Button>
)}
```

**Polling Schedule:**
- Attempt 1: 500ms
- Attempt 2: 1000ms (2^1 × 500)
- Attempt 3: 2000ms (2^2 × 500)
- Attempt 4: 4000ms (2^3 × 500)
- ... up to 8 attempts (max ~2 minutes)

### Pattern 4: Plan Selection and Activation

**Component:** `PlanSelect.tsx`

**Data Flow:**
```typescript
const activatePlan = async (planId: string, startDate: string) => {
  // Call edge function
  const { error } = await supabase.functions.invoke('activate-plan', {
    body: { plan_id: planId, start_date: startDate }
  });
  
  if (error) throw error;
  
  // Plan is now active
  // get-week will materialize workouts on next calendar view
  navigate('/');
};

// Next calendar view
useWeekUnified(from, to);
// → get-week detects active plan
// → creates planned_workouts rows
// → materializes steps
// → returns unified items with planned workouts
```

### Pattern 5: Strength Workout Logging

**Component:** `StrengthLogger.tsx`

**Data Flow:**
```typescript
const logStrengthWorkout = async (exercises: Exercise[]) => {
  // Create workout with strength_exercises
  const { data } = await supabase.from('workouts').insert({
    user_id: userId,
    type: 'strength',
    date: today,
    workout_status: 'completed',
    strength_exercises: exercises,
    duration: calculateDuration(exercises)
  }).select().single();
  
  // If linked to plan, analyze
  if (plannedWorkout) {
    await supabase.functions.invoke('analyze-strength-workout', {
      body: { workout_id: data.id }
    });
  }
  
  return data;
};

// exercises structure
exercises = [
  {
    exercise: "Squat",
    percentage: 80,
    planned_sets: 5,
    planned_reps: 5,
    planned_weight_lbs: 252,
    completed_sets: [
      {reps: 5, weight_lbs: 252, rpe: 7},
      {reps: 5, weight_lbs: 252, rpe: 8},
      {reps: 4, weight_lbs: 252, rpe: 9}, // Failed 5th rep
      {reps: 5, weight_lbs: 245, rpe: 8}  // Reduced weight
    ]
  }
]
```

---

## Summary for AI Assistants

**Key Takeaways:**

1. **Smart Server Pattern:** ALL logic on server, client just renders
2. **Unified View:** `get-week` is the ONLY source for calendar data
3. **JSONB Everywhere:** Flexible structures, no migrations
4. **Direct Discipline Routing:** Frontend routes to specialized analyzers
5. **Two-Stage Analysis:** Fast basic processing + on-demand deep analysis
6. **Token System:** Compact DSL for plan authoring
7. **On-Demand Materialization:** Create data lazily when needed

**Critical Files to Understand:**
- `supabase/functions/get-week/index.ts` - THE unified view
- `supabase/functions/materialize-plan/index.ts` - Token expansion
- `supabase/functions/compute-workout-summary/index.ts` - Interval slicing
- `supabase/functions/analyze-running-workout/index.ts` - Deep analysis
- `src/services/workoutAnalysisService.ts` - Analysis routing
- `src/hooks/useWeekUnified.ts` - Calendar data fetching

**Common Patterns:**
- Edge function for processing, hook for fetching
- JSONB for complex structures, top-level columns for queries
- Status tracking for async operations
- Polling with exponential backoff
- React Query for caching/invalidation

**When Modifying:**
- Add business logic to edge functions, not React
- Update JSONB structures without migrations
- Use status tracking for long operations
- Cache aggressively with React Query
- Test with real Garmin/Strava data

---

**Document Version:** 1.1
**Last Updated:** November 7, 2025
**Maintained By:** Development Team
**For Questions:** See individual function documentation or COMPLETE_SYSTEM_UNDERSTANDING.md

