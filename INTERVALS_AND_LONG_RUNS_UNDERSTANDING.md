# Intervals and Long Runs: Complete Understanding

## 🎯 Purpose
This document ensures complete understanding of how intervals and long runs are structured, and how Summary and Context screens interpret them.

---

## 📊 Data Structure: Planned Workouts

### Planned Workout Structure
**Location**: `planned_workouts.computed.steps` (array of steps)

```typescript
planned_workouts.computed.steps = [
  {
    id: "uuid-1",                    // UUID for matching
    kind: "warmup",                  // warmup | work | recovery | cooldown
    role: "warmup",                  // Same as kind
    seconds: 600,                     // Duration in seconds
    distanceMeters: 1609,            // Distance in meters (optional)
    pace_range: {                     // Target pace range
      lower: 420,                     // seconds per mile (lower bound)
      upper: 480                      // seconds per mile (upper bound)
    },
    planned_index: 0                 // Step order
  },
  {
    id: "uuid-2",
    kind: "work",
    role: "work",
    seconds: 300,
    distanceMeters: 804,
    pace_range: { lower: 300, upper: 330 },
    planned_index: 1
  },
  {
    id: "uuid-3",
    kind: "recovery",
    role: "recovery",
    seconds: 180,
    distanceMeters: 402,
    pace_range: { lower: 600, upper: 720 },
    planned_index: 2
  }
  // ... more steps
]
```

---

## 🔍 Detection: Interval Workout vs Long Run

### Interval Workout Detection
**Location**: `analyze-running-workout/index.ts` lines 3163-3166

```typescript
// Multiple work segments = interval workout
const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
const recoveryIntervals = intervals.filter(i => i.role === 'recovery' && i.executed);

const isIntervalWorkout = 
  workIntervals.length > 1 ||                                    // Multiple work segments
  (workIntervals.length >= 1 &&                                   // At least 1 work segment
   recoveryIntervals.length >= 1 &&                              // At least 1 recovery segment
   intervals.length > 2);                                        // More than 2 total segments
```

**Examples of Interval Workouts**:
- `4 × 1 mile @ 5K pace` → 4 work segments + 3 recovery segments = **interval workout**
- `6 × 400m @ mile pace` → 6 work segments + 5 recovery segments = **interval workout**
- `Warmup + 3 × 1K + Cooldown` → 3 work segments = **interval workout**

---

### Long Run (Continuous) Detection
**Location**: `compute-workout-summary/index.ts` lines 1733-1739

```typescript
// Single long interval > 60 minutes = continuous workout
const isContinuousWorkout = 
  plannedSteps.length === 1 &&                                    // Single step only
  plannedData.duration_s > 3600 &&                                // > 60 minutes
  plannedData.power_range &&                                      // Has pace/power range
  Number.isFinite(plannedData.power_range.lower) && 
  Number.isFinite(plannedData.power_range.upper);
```

**Examples of Long Runs**:
- `10 miles @ easy pace` → Single step, 90+ minutes = **long run**
- `90 minutes @ marathon pace` → Single step, 90 minutes = **long run**
- `2 hours @ zone 2` → Single step, 120 minutes = **long run**

---

## 📋 Data Structure: Completed Workouts

### Completed Intervals Structure
**Location**: `workouts.computed.intervals` (array of intervals)

```typescript
workouts.computed.intervals = [
  {
    planned_step_id: "uuid-1",      // Matches planned step UUID
    kind: "warmup",
    role: "warmup",
    planned: {
      duration_s: 600,
      distance_m: 1609,
      target_pace_s_per_mi: 450
    },
    executed: {
      duration_s: 606,                // Actual duration
      distance_m: 1615,               // Actual distance
      avg_pace_s_per_mi: 448,         // Actual average pace
      avg_hr: 135,                    // Actual average HR
      adherence_percentage: 98         // Basic adherence (from compute-workout-summary)
    },
    sample_idx_start: 0,              // Sensor data slice start
    sample_idx_end: 606,              // Sensor data slice end
    granular_metrics: {               // Added by analyze-running-workout
      time_in_target_pct: 95,         // % of time in target pace range
      pace_variation_pct: 3.2,       // Pace variability
      hr_drift_bpm: 2.1               // HR drift during interval
    }
  },
  {
    planned_step_id: "uuid-2",
    kind: "work",
    role: "work",
    planned: { ... },
    executed: { ... },
    granular_metrics: { ... }
  }
  // ... more intervals
]
```

**Key Points**:
- Each completed interval matches a planned step via `planned_step_id` (UUID)
- `executed` contains actual metrics (pace, HR, duration, distance)
- `granular_metrics` added by `analyze-running-workout` (not by `compute-workout-summary`)

---

## 🎯 How Summary Screen Uses Intervals/Long Runs

### Summary Screen Display Logic
**Location**: `src/components/MobileSummary.tsx`

#### For Interval Workouts:
```typescript
// Displays planned vs completed table
planned.computed.steps.map(step => {
  // Find matching executed interval
  const executedInterval = computed.intervals.find(
    i => i.planned_step_id === step.id
  );
  
  // Display:
  // Planned: "5:00 @ 5:00-5:30/mi"
  // Executed: "5:05 @ 5:12/mi" (95% adherence)
})
```

**What Summary Shows**:
- ✅ Each planned step with target pace/duration
- ✅ Each executed interval with actual pace/duration
- ✅ Adherence percentage per interval
- ✅ Overall execution scores (Execution/Pace/Duration %)

#### For Long Runs:
```typescript
// Same structure, but only 1 step
// Planned: "90:00 @ 7:00-8:00/mi"
// Executed: "91:30 @ 7:15/mi" (98% adherence)
```

**What Summary Shows**:
- ✅ Single planned step with target pace range
- ✅ Single executed interval with actual pace
- ✅ Overall execution scores (Execution/Pace/Duration %)

**Key**: Summary screen treats both the same way - it's just a table of planned vs executed steps.

---

## 🎯 How Context Screen Uses Intervals/Long Runs

### Context Screen Display Logic
**Location**: `src/components/context/TodaysWorkoutsTab.tsx` lines 805-843

#### For Interval Workouts:
**Shows**: "Interval-by-Interval Breakdown"
**Hides**: Mile-by-mile terrain breakdown

```typescript
// Detection (from analyze-running-workout)
const isIntervalWorkout = workIntervals.length > 1 || 
  (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);

if (isIntervalWorkout) {
  // Generate interval breakdown
  detailed_analysis.interval_breakdown = {
    available: true,
    section: "Interval 1: 1 mile @ 5K pace\nPace: 6:45/mi (target: 6:30-7:00/mi) ✅\n..."
  };
  
  // DO NOT generate mile-by-mile breakdown
  detailed_analysis.mile_by_mile_terrain = null;
}
```

**What Context Shows**:
- ✅ AI-generated insights (narrative)
- ✅ Interval-by-interval breakdown (per-interval analysis)
- ✅ Red flags and strengths
- ❌ NO mile-by-mile terrain breakdown

---

#### For Long Runs (Continuous):
**Shows**: "Mile-by-Mile Terrain Breakdown"
**Hides**: Interval-by-interval breakdown

```typescript
// Detection (from analyze-running-workout)
const isIntervalWorkout = workIntervals.length > 1 || 
  (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);

if (!isIntervalWorkout) {
  // Generate mile-by-mile breakdown
  detailed_analysis.mile_by_mile_terrain = {
    available: true,
    section: "Mile 1: 7:15/mi, +50ft elevation, within target range ✅\n..."
  };
  
  // DO NOT generate interval breakdown
  detailed_analysis.interval_breakdown = null;
}
```

**What Context Shows**:
- ✅ AI-generated insights (narrative)
- ✅ Mile-by-mile terrain breakdown (pace, elevation, comparison to target)
- ✅ Red flags and strengths
- ❌ NO interval-by-interval breakdown

---

## 🔄 Complete Flow

### Step 1: `compute-workout-summary` Creates Intervals
**Input**: `sensor_data` (raw samples) + `planned_workouts.computed.steps`

**Process**:
1. For each planned step:
   - Slice sensor data by time/laps
   - Calculate executed metrics (pace, HR, duration, distance)
   - Match by `planned_step_id` (UUID)
   - Store in `workouts.computed.intervals`

**Output**: `workouts.computed.intervals` (array with `planned_step_id`, `executed` metrics)

---

### Step 2: `analyze-running-workout` Enhances Intervals
**Input**: `workouts.computed.intervals` + `sensor_data` + `planned_workouts.computed.steps`

**Process**:
1. **Detect workout type**:
   - Count work intervals: `workIntervals.length`
   - Count recovery intervals: `recoveryIntervals.length`
   - Determine: `isIntervalWorkout` vs `isLongRun`

2. **Enhance intervals**:
   - Add `granular_metrics` to each interval
   - Calculate time-in-range, pace variation, HR drift

3. **Generate detailed analysis**:
   - **If interval workout**: Generate `interval_breakdown` (per-interval analysis)
   - **If long run**: Generate `mile_by_mile_terrain` (mile-by-mile breakdown)

**Output**: 
- `workouts.computed.intervals[].granular_metrics` (enhanced metrics)
- `workouts.workout_analysis.detailed_analysis.interval_breakdown` (for intervals)
- `workouts.workout_analysis.detailed_analysis.mile_by_mile_terrain` (for long runs)

---

### Step 3: Summary Screen Displays
**Reads**: `workouts.computed.intervals` + `workouts.workout_analysis.performance`

**Displays**:
- Planned vs completed table (all intervals/steps)
- Execution scores (overall adherence)

**Key**: Summary treats intervals and long runs the same - just a table of steps.

---

### Step 4: Context Screen Displays
**Reads**: `workouts.workout_analysis.detailed_analysis`

**Displays**:
- **Interval workouts**: `interval_breakdown` (per-interval analysis)
- **Long runs**: `mile_by_mile_terrain` (mile-by-mile breakdown)
- AI insights (narrative)
- Red flags and strengths

**Key**: Context shows DIFFERENT breakdowns based on workout type.

---

## ✅ Key Requirements for Refactoring

### Must Maintain:

1. **Interval Detection Logic**:
   ```typescript
   const isIntervalWorkout = workIntervals.length > 1 || 
     (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);
   ```
   - ✅ Must remain identical
   - ✅ Used to determine which breakdown to generate

2. **Data Structure**:
   - ✅ `workouts.computed.intervals[]` structure must remain identical
   - ✅ `planned_step_id` matching must remain identical
   - ✅ `executed` metrics structure must remain identical

3. **Breakdown Generation**:
   - ✅ Interval workouts → Generate `interval_breakdown` only
   - ✅ Long runs → Generate `mile_by_mile_terrain` only
   - ✅ Never generate both for same workout

4. **Summary Screen**:
   - ✅ Must continue to read `computed.intervals` array
   - ✅ Must display all intervals/steps in table
   - ✅ Works the same for intervals and long runs

5. **Context Screen**:
   - ✅ Must check `isIntervalWorkout` to determine which breakdown to show
   - ✅ Must show `interval_breakdown` for interval workouts
   - ✅ Must show `mile_by_mile_terrain` for long runs

---

## 🎯 Summary

### Intervals vs Long Runs:

| Aspect | Interval Workout | Long Run (Continuous) |
|--------|------------------|----------------------|
| **Planned Structure** | Multiple steps (work + recovery) | Single step (> 60 min) |
| **Detection** | `workIntervals.length > 1` | `plannedSteps.length === 1` |
| **Summary Display** | Table of all intervals | Table of single step |
| **Context Display** | Interval-by-interval breakdown | Mile-by-mile terrain breakdown |
| **Data Structure** | Same: `computed.intervals[]` | Same: `computed.intervals[]` |

### Key Insight:
- **Summary screen**: Treats both the same (table of steps)
- **Context screen**: Shows different breakdowns based on workout type
- **Data structure**: Identical for both (just different number of steps)

---

## ✅ Verification Checklist

Before refactoring, verify:
- [x] Interval detection logic is understood
- [x] Long run detection logic is understood
- [x] Data structure (`computed.intervals`) is understood
- [x] Summary screen display logic is understood
- [x] Context screen display logic is understood
- [x] Breakdown generation logic is understood (interval vs mile-by-mile)

**Ready to proceed with refactoring!** ✅





