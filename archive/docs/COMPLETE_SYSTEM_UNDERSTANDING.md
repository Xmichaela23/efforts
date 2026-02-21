# Complete System Understanding: 3 Screens + Analysis Functions

## 🎯 The Three Screens

### 1. **Details Screen** (`WorkoutDetail.tsx`, `UnifiedWorkoutView.tsx`)
**Purpose:** Deep dive into raw workout data and metrics

**What it shows:**
- Basic metrics (distance, duration, pace, HR, power, cadence)
- Interactive map with route visualization
- Time-series charts (HR, pace, power, cadence over time)
- Mile/km splits table
- Heart rate zones (time distribution, pie chart)
- Comments section

**Data sources:**
- `workouts.computed.series` - Time-series data for charts (pace, HR, power, elevation, etc.)
- `workouts.computed.overall` - Summary totals (distance, duration, etc.)
- `workouts.computed.analysis.splits` - Mile/km splits
- `workouts.computed.analysis.zones` - HR/power zone distributions

**Analysis:** NO AI analysis - just raw data visualization

**Triggered by:** User clicks on workout from dashboard/calendar

---

### 2. **Summary Screen** (`MobileSummary.tsx`)
**Purpose:** Planned vs Completed comparison with execution scoring

**What it shows:**
- Planned workout structure (intervals, paces, durations)
- Completed workout data (actual paces, durations)
- Adherence percentages per interval
- Overall execution scores:
  - **Execution Score** (overall adherence)
  - **Duration Adherence** (time compliance)
  - **Pace Adherence** (interval adherence)
- Performance assessment ("Excellent", "Good", "Fair", "Poor")
- "View in Context" button → navigates to Context screen

**Data sources:**
- `planned_workouts.computed.steps` - Planned structure
- `workouts.computed.intervals` - Completed intervals with executed data
- `workouts.computed.intervals[].granular_metrics` - Enhanced metrics (from `analyze-running-workout`)
- `workouts.workout_analysis.performance` - Execution scores
  - `execution_adherence` (71%)
  - `pace_adherence` (71%)
  - `duration_adherence` (89%)

**Analysis:** Uses execution scores from `analyze-running-workout`

**Triggered by:** User views today's workout or clicks on completed workout

---

### 3. **Context Screen** (`TodaysWorkoutsTab.tsx`, `ContextTabs.tsx`)
**Purpose:** AI-powered insights and training analysis

**What it shows:**
- Recent workouts list (last 14 days)
- Selected workout analysis:
  - **Insights** (AI-generated observations)
  - **Strengths** (what went well)
  - **Red Flags** (areas for improvement)
  - **Detailed Analysis** (pacing, HR, intervals)
- "Tap to analyze" button for workouts without analysis
- Spinner during analysis
- Error messages if analysis fails

**Data sources:**
- `workouts.workout_analysis.granular_analysis` - Detailed analysis
- `workouts.workout_analysis.detailed_analysis` - Pacing/HR/interval insights
- `workouts.workout_analysis.strengths` - Positive patterns
- `workouts.workout_analysis.primary_issues` - Problems identified

**Analysis:** Uses detailed AI analysis from `analyze-running-workout`

**Triggered by:** 
- User clicks "View in Context" from Summary screen
- User navigates to Context tab
- User clicks workout in recent list

---

## 🔧 The Analysis Functions

### 1. **`compute-workout-summary`** (Core Data Processing)
**File:** `supabase/functions/compute-workout-summary/index.ts`

**Purpose:** Process raw sensor data into structured intervals and overall metrics

**What it does:**
1. Reads `workouts.sensor_data` (raw samples from Garmin/Strava)
2. Reads `planned_workouts.computed.steps` (planned structure)
3. Normalizes samples (time, distance, elevation, HR, cadence, power, pace)
4. **Slices sensor data into intervals** matching planned structure
5. Calculates executed metrics per interval:
   - Average pace, HR, power, cadence
   - Duration, distance
   - Basic adherence percentage (executed vs planned)
6. Assigns `planned_step_id` to each interval for matching
7. Calculates overall metrics (total distance, duration, avg pace, etc.)

**Writes to:**
- `workouts.computed.intervals[]` - Array of intervals with:
  - `planned_step_id` - Links to planned step
  - `executed.avg_pace_s_per_mi` - Average pace
  - `executed.avg_hr` - Average heart rate
  - `executed.avg_power_w` - Average power
  - `executed.adherence_percentage` - Basic adherence (avg vs target)
  - `sample_idx_start`, `sample_idx_end` - Sensor data slice
- `workouts.computed.overall` - Summary totals:
  - `distance_m` - Total distance
  - `duration_s_moving` - Moving time
  - `avg_pace_s_per_mi` - Average pace
  - `gap_pace_s_per_mi` - Grade-adjusted pace

**Does NOT write:**
- `workout_analysis` - No AI analysis
- `granular_metrics` - No detailed metrics (added later by `analyze-running-workout`)

**Called by:**
- `auto-attach-planned` - When user attaches workout to plan
- `ingest-activity` - When syncing from Garmin/Strava
- Re-attach workflows

**Used by:**
- ✅ Summary screen (NEEDS `computed.intervals` for planned vs completed table)
- ✅ `analyze-running-workout` (reads `computed.intervals` as input)

---

### 2. **`compute-workout-analysis`** (Chart Data Processing)
**File:** `supabase/functions/compute-workout-analysis/index.ts`

**Primary Purpose:** Process raw sensor data into time-series for charts

**What it does:**
1. Reads `workouts.sensor_data` (raw samples from Garmin/Strava)
2. Normalizes samples (time, distance, elevation, HR, cadence, power, pace)
3. Smooths data (EMA smoothing for elevation, pace, grade)
4. Calculates splits (mile/km)
5. Calculates zones (HR, power)
6. Calculates Normalized Power (NP) for cycling
7. Extracts swim pace metrics

**Writes to:**
- `workouts.computed.series` - Time-series arrays (NEEDED for Details screen charts)
- `workouts.computed.overall` - Summary totals (distance, duration)
- `workouts.computed.analysis.splits` - Mile/km splits
- `workouts.computed.analysis.zones` - HR/power zones

**Secondary Purpose (PROBLEMATIC):** Also generates generic workout analysis

**Also writes to:**
- `workouts.workout_analysis` - Generic analysis with messages like:
  - "Excellent consistency across all work intervals"
  - "Good recovery discipline - properly slowed down between intervals"
  - "Strong finish - maintained pace through final interval"

**Called by:**
- `useWorkoutDetail.ts:112` - When viewing Details screen
- `ingest-activity/index.ts:896` - When syncing workouts from Garmin/Strava
- `useWorkouts.ts` (REMOVED in recent changes)

**Used by:**
- ✅ Details screen (NEEDS `computed.series` for charts)
- ❌ Context screen (generic analysis CONFLICTS with detailed analysis)

---

### 2. **`analyze-running-workout`** (Discipline-Specific Analysis)
**File:** `supabase/functions/analyze-running-workout/index.ts`

**Purpose:** Deep analysis of execution vs plan with AI insights

**What it does:**
1. Reads `workouts.computed` (already processed by `compute-workout-summary`)
2. Reads `workouts.sensor_data` (raw samples)
3. Reads `planned_workouts.computed.steps` (prescribed pace/power ranges)
4. Analyzes each interval:
   - Time-in-prescribed-range (not just averages)
   - Pace variability
   - HR drift
   - Pacing patterns (fading, surging, consistent)
5. Calculates Garmin-style execution scores:
   - Overall execution adherence
   - Pace adherence
   - Duration adherence
6. Identifies specific issues:
   - "Recovery jogs too slow"
   - "Fading in final intervals"
   - "Started too fast"
7. Identifies strengths:
   - "Excellent consistency across work intervals"
   - "Strong finish"
8. Generates detailed insights for Context screen

**Writes to:**
- `workouts.computed.intervals[].granular_metrics` - Enhanced interval data
  - `pace_variation_pct`
  - `hr_drift_bpm`
  - `time_in_target_pct`
- `workouts.workout_analysis` - Complete analysis object:
  - `performance` - Execution scores (for Summary screen)
  - `granular_analysis` - Overall assessment
  - `detailed_analysis` - Pacing/HR/interval insights (for Context screen)
  - `strengths` - Positive patterns
  - `primary_issues` - Problems
  - `analysis_status` - 'complete', 'failed', 'analyzing'
  - `analyzed_at` - Timestamp

**Called by:**
- Context screen via `analyzeWorkoutWithRetry(workoutId, workoutType)` in `workoutAnalysisService.ts`
- Frontend calls directly based on workout type (no orchestrator)
- `useWorkouts.ts` when adding new completed workouts

**Used by:**
- ✅ Summary screen (NEEDS `performance` scores)
- ✅ Context screen (NEEDS `detailed_analysis` insights)

---

### 3. **`analyze-strength-workout`** (Discipline-Specific Analysis)
**File:** `supabase/functions/analyze-strength-workout/index.ts`

**Purpose:** Analysis of strength training execution with volume tracking

**What it does:**
1. Reads `workouts.strength_exercises` (completed sets)
2. Reads `planned_workouts.strength_exercises` (planned sets)
3. Analyzes volume completion and intensity
4. Identifies adherence patterns

**Called by:**
- Context screen via `analyzeWorkoutWithRetry(workoutId, workoutType)`
- Frontend routes to this function for strength workouts

---

### Architecture Note: Direct Discipline Calls

**Current Pattern (Implemented):**
- Frontend knows workout type
- Routes directly to discipline-specific function:
  - Running → `analyze-running-workout`
  - Strength → `analyze-strength-workout`
  - Cycling → `analyze-cycling-workout`
  - Swimming → `analyze-swimming-workout`
- No orchestrator layer needed
- Each discipline has specialized analysis logic

**Service Layer:**
```typescript
// workoutAnalysisService.ts
function getAnalysisFunction(type: string): string {
  switch (type.toLowerCase()) {
    case 'run':
    case 'running': return 'analyze-running-workout';
    case 'strength': return 'analyze-strength-workout';
    // ... etc
  }
}
```

---

## 🔄 Complete Data Flow

### **Normal Flow (New Workout Sync)**

```
1. Garmin/Strava sync
   ↓
2. ingest-activity stores raw data
   - Writes: sensor_data (raw samples)
   ↓
3. compute-workout-summary processes sensor data
   - Reads: sensor_data + planned structure
   - Slices: sensor data into intervals
   - Writes: computed.intervals (basic intervals)
   - Writes: computed.overall (summary totals)
   ↓
4. compute-workout-analysis processes sensor data
   - Reads: sensor_data
   - Creates: time-series arrays for charts
   - Writes: computed.series (pace, HR, power over time)
   - Writes: computed.analysis.splits (mile/km splits)
   - Writes: computed.analysis.zones (HR/power zones)
   - Also writes: workout_analysis (generic - PROBLEM!)
   ↓
5. User views Details screen
   - Reads: computed.series (for charts)
   - Reads: computed.overall (for metrics)
   - Reads: computed.analysis.splits (for splits table)
   - Reads: computed.analysis.zones (for zone charts)
   ↓
6. User views Summary screen
   - Reads: computed.intervals (basic intervals from compute-workout-summary)
   - Shows: planned vs completed table
   - Missing: execution scores (not yet analyzed)
   ↓
7. User clicks "View in Context"
   - Context screen checks: workout_analysis exists?
   - Finds: generic analysis from compute-workout-analysis
   - Shows: "Excellent consistency..." (WRONG!)
   ↓
8. User expects: Detailed insights
   - But gets: Generic fallback messages
```

### **Fixed Flow (With Status Tracking)**

```
1. Garmin/Strava sync
   ↓
2. ingest-activity stores raw data
   - Writes: sensor_data (raw samples)
   ↓
3. compute-workout-summary processes sensor data
   - Reads: sensor_data + planned structure
   - Slices: sensor data into intervals
   - Writes: computed.intervals (basic intervals)
   - Writes: computed.overall (summary totals)
   ↓
4. compute-workout-analysis processes sensor data
   - Reads: sensor_data
   - Creates: time-series arrays for charts
   - Writes: computed.series (pace, HR, power over time)
   - Writes: computed.analysis.splits (mile/km splits)
   - Writes: computed.analysis.zones (HR/power zones)
   - Does NOT write: workout_analysis (FIXED!)
   ↓
5. User views Summary screen
   - Reads: computed.intervals (basic intervals from compute-workout-summary)
   - Shows: planned vs completed table
   - Missing: execution scores (not yet analyzed)
   ↓
6. User clicks "View in Context"
   - Context screen checks: analysis_status
   - Finds: 'pending' (no analysis yet)
   - Triggers: analyze-running-workout
   - Shows: Spinner "Analyzing..."
   ↓
7. analyze-running-workout runs
   - Sets: analysis_status = 'analyzing'
   - Reads: computed.intervals (from compute-workout-summary)
   - Reads: sensor_data (raw samples)
   - Analyzes: intervals, pacing, HR
   - Enhances: computed.intervals with granular_metrics
   - Writes: workout_analysis with detailed insights
   - Sets: analysis_status = 'complete'
   ↓
8. Context screen polls status
   - Detects: analysis_status = 'complete'
   - Reloads: workout_analysis
   - Shows: Detailed insights (CORRECT!)
   ↓
9. User returns to Summary screen
   - Reads: workout_analysis.performance (execution scores)
   - Reads: computed.intervals[].granular_metrics (enhanced data)
   - Shows: Execution scores (71%, 89%, etc.)
```

---

## 🎯 Key Insights

### **What Each Screen Needs:**

| Screen | Data Source | Analysis Type |
|--------|-------------|---------------|
| **Details** | `computed.series`, `computed.overall` | None (raw data only) |
| **Summary** | `computed.intervals`, `workout_analysis.performance` | Execution scores |
| **Context** | `workout_analysis.detailed_analysis` | AI insights |

### **What Each Function Provides:**

| Function | Writes To | Used By |
|----------|-----------|---------|
| **compute-workout-summary** | `computed.intervals`, `computed.overall` | Summary screen, analyze-running-workout |
| **compute-workout-analysis** | `computed.series`, `computed.analysis` | Details screen |
| **analyze-running-workout** | `workout_analysis.*`, `computed.intervals[].granular_metrics` | Summary + Context screens |

### **The Problem:**

`compute-workout-analysis` writes BOTH:
1. ✅ `computed.*` (NEEDED for Details screen)
2. ❌ `workout_analysis` (CONFLICTS with Context screen)

### **The Solution:**

**Option 1: Stop `compute-workout-analysis` from writing `workout_analysis`**
- Remove lines 1500-1774 from `compute-workout-analysis/index.ts`
- Only write `computed.*`
- Let `analyze-running-workout` be the sole source of `workout_analysis`

**Option 2: Check `analysis_status` before showing analysis**
- Frontend checks if `analysis_status === 'complete'`
- If not, trigger fresh analysis
- Ignore generic analysis from `compute-workout-analysis`

**Current Implementation:** Option 2 (status tracking with polling)

---

## 📋 Summary

### **Three Screens:**
1. **Details** = Raw metrics + charts (no AI)
2. **Summary** = Planned vs Completed + execution scores
3. **Context** = AI insights + detailed analysis

### **Three Analysis Functions:**
1. **compute-workout-summary** = Slice sensor data into intervals (basic)
2. **compute-workout-analysis** = Process sensor data for charts
3. **analyze-running-workout** = Deep analysis for insights

### **The Conflict:**
- `compute-workout-analysis` generates generic `workout_analysis`
- This blocks `analyze-running-workout`'s detailed analysis
- Context screen shows generic fallback instead of detailed insights

### **The Fix:**
- Add `analysis_status` column to track analysis lifecycle
- Frontend checks status before showing analysis
- Polling with exponential backoff for async analysis
- Only show analysis when `analysis_status === 'complete'`

---

## ✅ Current Status (Updated 2025)

**Implemented:**
- ✅ `analysis_status`, `analysis_error`, `analyzed_at` columns added
- ✅ `analyze-running-workout` tracks status lifecycle
- ✅ Frontend polls with exponential backoff
- ✅ UI shows: pending, analyzing, complete, failed states
- ✅ Frontend calls discipline functions directly via `workoutAnalysisService.ts`
- ✅ `analyzeWorkoutWithRetry(workoutId, workoutType)` routes to appropriate analyzer
- ✅ Direct discipline calls: `analyze-running-workout`, `analyze-strength-workout`

**Still in Use:**
- ⚠️ `compute-workout-analysis` still called from:
  - `useWorkoutDetail.ts:112` - Generates time-series for charts
  - `useWorkouts.ts:1417` - Fire-and-forget on workout creation
- ⚠️ `compute-workout-analysis` writes generic `workout_analysis` (lower priority than detailed analysis)

**Architecture Pattern:**
- Direct discipline calls are the PRIMARY analysis path
- `compute-workout-analysis` provides fallback chart data
- Status tracking (`analysis_status`) prevents conflicts
- Frontend prefers detailed analysis when `status === 'complete'`

