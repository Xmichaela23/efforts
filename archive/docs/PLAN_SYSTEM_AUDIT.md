# Plan System Full Audit

## Overview
This document provides a comprehensive audit of how training plans work in the Efforts application, covering JSON upload, plan selection, user modifications, plan acceptance, and materialization into workouts.

---

## 1. Plan JSON Upload & Storage

### 1.1 Upload Methods
Plans can be uploaded via three methods in `PlanJSONImport.tsx`:
- **Paste JSON**: Direct paste into textarea
- **Upload File**: File input for `.json` files
- **From URL**: Fetch from remote URL

### 1.2 Validation Process
1. **Preprocessing** (`preprocessForSchema`):
   - Expands macros (e.g., `@RUN_INT_6x400_5k_R2` → token array)
   - Normalizes discipline aliases (`bike`/`cycling` → `ride`)
   - Expands swim DSL (`main`/`extra` fields → `steps_preset`)
   - Normalizes token aliases (e.g., `bike_warmup_15` → `warmup_bike_quality_15min_fastpedal`)
   - Strips authoring-only fields not in schema

2. **Schema Validation**:
   - Uses `validateUniversalPlan` from `UniversalPlanValidator`
   - Validates against universal plan schema
   - Special handling for triathlon blueprints (no `sessions_by_week`, has `phase_blueprint`)

3. **Discipline Inference**:
   - Analyzes sessions to infer discipline (run/ride/swim/strength/hybrid)
   - User can override via dropdown

### 1.3 Publishing to Catalog
- Calls `publishLibraryPlan()` from `LibraryPlans.ts`
- Inserts into `library_plans` table with:
  - `name`, `description`, `discipline`, `duration_weeks`
  - `template`: Full JSON plan (preserves all authoring metadata)
  - `status`: 'published' or 'draft'
  - `tags`: Array of tags
- Falls back to 'hybrid' if 'triathlon' not allowed by DB constraint

### 1.4 Plan Structure
Plans stored in `library_plans.template` contain:
- `sessions_by_week`: Object mapping week numbers to session arrays
- `notes_by_week`: Optional weekly notes
- `weekly_summaries`: Optional weekly focus/notes
- `baselines_required`: Metadata about required user baselines
- `units`: 'imperial' or 'metric'
- `export_hints`: Tolerance settings for pace/power
- `adaptive_scaling`, `progression_rules`, etc.: Advanced metadata
- `phase_blueprint`: For triathlon plans (alternative to `sessions_by_week`)

---

## 2. Plan Selection

### 2.1 Catalog Browsing
- `PlanCatalog.tsx` displays plans by discipline tabs
- Fetches via `listLibraryPlans(discipline)` from `LibraryPlans.ts`
- Filters by `status='published'`
- Shows plan name, duration, discipline, description
- "Select" link navigates to `/plans/select?id={planId}`

### 2.2 Plan Selection Page (`PlanSelect.tsx`)
**Loads Plan**:
- Fetches plan via `getLibraryPlan(id)`
- Initializes default preferences from authored plan:
  - `longRunDay`: First occurrence of `long_run` tag in Week 1
  - `longRideDay`: First occurrence of `long_ride` tag in Week 1
  - Defaults to Sunday if not found

**User Modifications Available**:
1. **Start Date**: Date picker (defaults to next Monday)
2. **Race Date** (optional): For triathlon plans with `min_weeks`/`max_weeks`
3. **Long Run Day**: Dropdown (Monday-Sunday)
4. **Long Ride Day**: Dropdown (Monday-Sunday)
5. **Strength Track** (optional): For triathlon plans with `strength_tracks` array

**Triathlon-Specific Logic**:
- If plan has `phase_blueprint` (no `sessions_by_week`):
  - Composes sessions from blueprint using `bakeBlueprintToSessions()` or `composeSessionsFromBlueprint()`
  - Calculates `weeks_to_race` from race date
  - Validates against `min_weeks`/`max_weeks` window
  - Auto-derives start date if race date provided (unless user edited start)

**Preview**:
- Shows week-by-week breakdown
- Displays sessions per week with day, discipline, description
- For triathlon blueprints, shows composed preview

---

## 3. Plan Acceptance & Processing

### 3.1 Save Process (`PlanSelect.tsx` → `save()`)
1. **Remap for Preferences** (`remapForPreferences`):
   - Moves long run to user-selected `longRunDay`
   - Moves long ride to user-selected `longRideDay`
   - Filters out strength sessions if `includeStrength=false` (unless tagged `mandatory_strength`)
   - Flags conflicts (e.g., hard sessions too close to long runs) in `notes_by_week`

2. **Baseline Resolution**:
   - Loads user baselines from `user_baselines` table
   - Resolves pace placeholders in descriptions:
     - `{5k_pace}` → user's 5K pace
     - `{easy_pace}` → user's easy pace
     - `@ tempo` → calculated tempo pace
     - Pace ranges appended (e.g., `7:43/mi (7:10–8:16/mi)`)
   - Resolves strength weights:
     - `@ 70%` → calculated from 1RM × percentage
     - Accessory exercises use ratio formulas (e.g., Barbell Row = Bench × 0.90)
   - Resolves bike power:
     - `VO2` → 106-120% FTP
     - `Threshold` → 95-100% FTP
     - `Sweet Spot` → 88-94% FTP

3. **Swim DSL Expansion**:
   - Expands `main`/`extra` fields to `steps_preset` tokens
   - Uses plan defaults for pool length, equipment

4. **Week Selection** (triathlon):
   - If `targetDurationWeeks` specified, slices last N weeks from source
   - Reindexes weeks to start at 1

5. **Plan Augmentation** (currently disabled):
   - `augmentPlan()` call is commented out (was causing Supabase crashes)
   - Would normalize paces, calculate durations, etc.

6. **Database Insert**:
   - Inserts into `plans` table:
     ```typescript
     {
       name, description, duration_weeks, current_week,
       status: 'active', plan_type: 'catalog',
       config: {
         source: 'catalog',
         preferences: { longRunDay, longRideDay },
         catalog_id: libPlan.id,
         user_selected_start_date: anchorMonday,
         weekly_summaries: ...,
         baselines_required: ...,
         units: ...,
         adaptive_scaling: ...,
         // ... all authoring metadata preserved
       },
       sessions_by_week: mapped.sessions_by_week,
       notes_by_week: mapped.notes_by_week,
       weeks: []
     }
     ```
   - Calculates `current_week` based on start date vs today

7. **Activation**:
   - Calls `activate-plan` edge function with `plan_id` and `start_date`
   - Navigates to home with state: `{ openPlans: true, focusPlanId, focusWeek: 1 }`

---

## 4. Plan Activation (`activate-plan` Edge Function)

### 4.1 Process Flow
1. **Load Plan**:
   - Fetches plan from `plans` table
   - Extracts `sessions_by_week`, `config`

2. **Determine Start Date**:
   - Priority: `start_date` override → `config.user_selected_start_date` → `plan.start_date` → today
   - Normalizes to Monday of week (`mondayOf()`)

3. **Load Baselines**:
   - Fetches `user_baselines.performance_numbers` for strength exercise calculations

4. **Create Planned Workouts**:
   - Iterates through `sessions_by_week`
   - For each session:
     - Calculates date: `anchorMonday + (weekNum-1)*7 + (dow-1)`
     - Skips Week 1 days before user-selected start date
     - Maps discipline to type (`run`/`ride`/`swim`/`strength`/`mobility`)
     - Skips `rest`/`off`/`recovery` sessions
     - Handles brick sessions (splits into ride + run rows)
     - Creates row with:
       - `steps_preset`: Token array (e.g., `['warmup_run_quality_12min', 'interval_6x800m_5kpace_R2min']`)
       - `strength_exercises`: Array (if discipline='strength')
       - `mobility_exercises`: Array (if discipline='mobility')
       - `description`, `tags`, `duration`, `name`
       - `workout_status: 'planned'`
       - `computed: null` (materialized later)

5. **Calculate Workload**:
   - For each inserted planned workout, calls `calculate-workload` edge function
   - Calculates planned workload based on type, duration, steps, exercises

6. **Materialize Steps**:
   - Calls `materialize-plan` edge function with `plan_id`
   - Expands `steps_preset` tokens into `computed.steps` with resolved paces/power

7. **Auto-Attach Completed Workouts**:
   - Looks for completed workouts in date range (30 days back, 1 year forward)
   - Calls `auto-attach-planned` for each unattached workout
   - Links completed workouts to planned workouts by date/type matching

---

## 5. Materialization (`materialize-plan` Edge Function)

### 5.1 Purpose
Expands `steps_preset` tokens into structured `computed.steps` with:
- Stable `id` per step
- Resolved paces (from user baselines)
- Resolved power ranges (from FTP)
- Calculated durations
- Equipment substitutions (for strength)

### 5.2 Token Expansion

**Run Tokens**:
- `warmup_run_quality_12min` → warmup step, easy pace
- `cooldown_easy_10min` → cooldown step, easy pace
- `longrun_90min` → work step, easy pace, 90min duration
- `interval_6x800m_5kpace_R2min` → 6 work steps (800m @ 5K pace) + 5 recovery steps (2min easy)
- `tempo_4mi_5kpace_plus0:45` → work step, 4mi distance, tempo pace

**Bike Tokens**:
- `warmup_bike_quality_15min_fastpedal` → warmup, 55-70% FTP
- `bike_ss_3x12min_R4min` → 3 work steps (12min @ 88-94% FTP) + 2 recovery steps
- `bike_thr_4x8min_R5min` → 4 work steps (8min @ 95-100% FTP) + 3 recovery steps
- `bike_vo2_6x5min_R3min` → 6 work steps (5min @ 106-120% FTP) + 5 recovery steps
- `bike_endurance_120min` → work step, 120min @ 65-75% FTP

**Swim Tokens**:
- `swim_warmup_200yd_easy` → warmup step, 200yd distance
- `swim_drills_4x50yd_catchup_r15` → 4 drill steps (50yd) + 3 recovery steps (15s)
- `swim_pull_2x100yd_r20_buoy` → 2 work steps (100yd pull with buoy) + 1 recovery step
- `swim_aerobic_6x200yd_easy_r30` → 6 work steps (200yd) + 5 recovery steps

**Strength Tokens**:
- `st_main_squat_3x5_@pct75` → strength step with exercise: { name: 'Squat', sets: 3, reps: 5, weight: calculated from 1RM × 0.75 }
- `st_acc_barbell_row_3x8` → strength step with exercise: { name: 'Barbell Row', sets: 3, reps: 8, weight: calculated from Bench × 0.90 × defaultPct }

### 5.3 Baseline Resolution
- **Run Paces**: From `fiveK_pace`, `easy_pace` in `user_baselines.performance_numbers`
- **Bike Power**: From `ftp` in `user_baselines.performance_numbers`
- **Swim Pace**: From `swimPace100` or `swim_pace_per_100_sec`
- **Strength 1RM**: From `squat`, `bench`, `deadlift`, `overheadPress1RM`

### 5.4 Equipment Substitution
- Checks `user_baselines.equipment.strength` array
- Substitutes exercises based on available equipment:
  - Face Pulls (cable) → Band Face Pulls (if no cable)
  - Dumbbell exercises → Per-hand weight calculation
  - Machine exercises → Bodyweight alternatives if no gym access
- Adds resistance band guidance based on percentage of 1RM

### 5.5 Output Format
```typescript
computed: {
  normalization_version: 'v3',
  steps: [
    {
      id: 'uuid',
      kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'strength' | 'drill',
      seconds?: number,
      distanceMeters?: number,
      paceTarget?: '7:43/mi',
      pace_range?: { lower: 460, upper: 480 },
      powerTarget?: '250 W',
      powerRange?: { lower: 240, upper: 260 },
      label?: string,
      equipment?: string,
      strength?: { name, sets, reps, weight, percent_1rm, notes }
    }
  ],
  total_duration_seconds: 3600
}
```

### 5.6 Duration Calculation
- **Time-based steps**: Uses `duration_s` directly
- **Distance-based steps**: Calculates from distance + pace
- **Swim steps**: Estimates duration from baseline pace per 100yd/m
- **Total**: Sum of all step durations

---

## 6. Plan Materialization in UI

### 6.1 Display Locations
1. **Calendar View** (`WorkoutCalendar.tsx`):
   - Uses `useWeekUnified()` hook to fetch planned + completed workouts
   - Shows planned workouts with abbreviated labels (e.g., `RN-VO2 45m`, `BK-SS 60m`)
   - Planned workouts appear as separate events from completed workouts
   - Clicking opens workout detail view

2. **Weekly View** (`AllPlansInterface.tsx`):
   - Shows week-by-week breakdown of plan
   - Displays sessions grouped by day
   - Uses `PlannedWorkoutSummary` component to render workout details
   - Shows `WeeklyLines` component with grouped step summary:
     - `1 × Warm‑up 12:00 (8:00–9:00/mi)`
     - `6 × 800 m (7:10–7:30/mi) 2:00 (8:30–9:30/mi)`
     - `1 × Cool‑down 10:00 (8:00–9:00/mi)`

3. **Today's Efforts**:
   - Shows planned workouts for today
   - Can activate/deactivate optional workouts
   - Links to workout detail view

### 6.2 Workout Detail View
- `UnifiedWorkoutView` or `PlannedWorkoutSummary`:
  - Shows workout name, type, date
  - Displays `computed.steps` with:
    - Step-by-step breakdown
    - Pace/power targets and ranges
    - Duration or distance per step
    - Equipment notes (for strength/swim)
  - Shows description with resolved paces/power
  - Can edit workout (modify steps, add notes)

---

## 7. Plan Modifications After Acceptance

### 7.1 Available Modifications
1. **Pause Plan**: Sets status to 'paused' (planned workouts remain)
2. **End Plan**: Sets status to 'completed', deletes future planned workouts
3. **Edit Workout**: Modify individual planned workout steps
4. **Adjust Plan** (AI): Request plan adjustments via chat interface
5. **Activate/Deactivate Optional Workouts**: Toggle `opt_active` tag

### 7.2 Weekly Materialization
- When viewing a week, `get-week` edge function is called
- Materializes steps on-demand if `computed.steps` missing
- Caches materialized steps in `planned_workouts.computed`

---

## 8. Data Flow Summary

```
1. Author creates JSON plan
   ↓
2. Upload via PlanJSONImport → Validate → Publish to library_plans
   ↓
3. User browses PlanCatalog → Selects plan → PlanSelect page
   ↓
4. User sets preferences (start date, long run/ride days, race date)
   ↓
5. Save → Insert into plans table → Call activate-plan
   ↓
6. activate-plan → Create planned_workouts rows → Call materialize-plan
   ↓
7. materialize-plan → Expand tokens → Resolve paces/power → Write computed.steps
   ↓
8. UI displays planned workouts in Calendar/Weekly/Today views
   ↓
9. User completes workout → Auto-attach to planned workout
   ↓
10. Planned workout shows as completed in UI
```

---

## 9. Key Files Reference

- **Upload**: `src/components/PlanJSONImport.tsx`
- **Catalog**: `src/components/PlanCatalog.tsx`, `src/services/LibraryPlans.ts`
- **Selection**: `src/pages/PlanSelect.tsx`
- **Activation**: `supabase/functions/activate-plan/index.ts`
- **Materialization**: `supabase/functions/materialize-plan/index.ts`
- **Display**: `src/components/AllPlansInterface.tsx`, `src/components/WorkoutCalendar.tsx`
- **Database**: `supabase/migrations/20250701120006_create_plans_table.sql`, `supabase/migrations/20250701120007_create_library_plans.sql`

---

## 10. Edge Cases & Special Handling

1. **Triathlon Blueprints**: No `sessions_by_week`, uses `phase_blueprint` to compose sessions
2. **Brick Sessions**: Split into separate ride + run planned workouts
3. **Optional Workouts**: Tagged with `optional`, can be activated/deactivated
4. **Equipment Substitution**: Strength exercises substituted based on user equipment
5. **Pace Resolution**: Multiple fallbacks (baseline → calculation → default)
6. **Week Selection**: Triathlon plans can select subset of weeks based on race date
7. **Start Date Normalization**: Always anchors to Monday of week
8. **Auto-Attachment**: Completed workouts auto-link to planned workouts by date/type

---

## 11. Current Limitations & TODOs

1. **Plan Augmentation Disabled**: `augmentPlan()` call commented out (was crashing Supabase)
2. **Triathlon Blueprints**: "Coming soon" in catalog (compose logic exists but not fully tested)
3. **Workload Calculation**: Called during activation but may need refinement
4. **Materialization Caching**: Steps materialized on-demand, could be optimized
5. **Plan Modifications**: Limited editing capabilities (mostly individual workouts)

---

## End of Audit

This audit covers the complete flow from JSON upload through plan materialization and display. The system is designed to be flexible, supporting multiple plan types (standard, triathlon blueprints) and allowing user customization while preserving authoring metadata.

