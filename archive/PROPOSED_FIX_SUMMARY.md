# 🎯 Complete Solution: Display Planned + Completed + Adherence

## What You Want to See

For each interval in the workout, display:
- ✅ **Planned**: Target pace/duration/distance from `planned_workouts`
- ✅ **Completed**: Actual pace/duration/distance from executed workout
- ✅ **Adherence**: How well completed matched planned (%)

Example:
```
Interval 1: Warmup
Planned:  10:00/mi × 1.0mi × 10:00
Completed: 9:52/mi × 1.02mi × 10:06  ✅ 98% adherence

Interval 2: Work 
Planned:  7:30/mi × 1.0mi × 7:30
Completed: 7:38/mi × 1.01mi × 7:43  ⚠️ 92% adherence
```

---

## 🔄 Current Data Flow (After Our Fix)

### Step 1: User Re-Attaches Workout
**File**: `supabase/functions/auto-attach-planned/index.ts` (lines 165, 329)

```typescript
// Clear intervals to force regeneration with NEW planned_step_id values
computed: w.computed 
  ? { ...w.computed, intervals: [], planned_steps_light: null }
  : null
```

**What happens**:
- `workout.planned_id` = new planned workout ID
- `computed.intervals` = [] (cleared)
- `computed.planned_steps_light` = null (cleared)

---

### Step 2: Regenerate Intervals with New IDs
**File**: `supabase/functions/compute-workout-summary/index.ts` (line 1434)

**Input**:
- `sensor_data`: GPS/HR samples (unchanged)
- `planned_id`: NEW planned workout
- `planned_workouts.intervals`: NEW target ranges

**Process**:
1. Load new planned workout intervals
2. Match sensor data to planned steps (by time/laps)
3. Calculate executed metrics for each interval
4. Assign NEW `planned_step_id` to each interval

**Output stored in `workouts.computed.intervals`**:
```json
[
  {
    "kind": "warmup",
    "planned_step_id": "xyz-456",  // ← NEW ID from new planned workout
    "planned_index": 0,
    "sample_idx_start": 0,
    "sample_idx_end": 600,
    "planned": {
      "duration_s": 600,
      "distance_m": 1609,
      "target_pace_s_per_mi": 600
    },
    "executed": {
      "duration_s": 606,
      "distance_m": 1642,
      "avg_pace_s_per_mi": 592,
      "avg_hr": 135,
      "adherence_percentage": 98
    }
  },
  {
    "kind": "work",
    "planned_step_id": "xyz-789",  // ← NEW ID
    "planned_index": 1,
    "sample_idx_start": 600,
    "sample_idx_end": 1050,
    "planned": {
      "duration_s": 450,
      "distance_m": 1609,
      "target_pace_s_per_mi": 450
    },
    "executed": {
      "duration_s": 463,
      "distance_m": 1626,
      "avg_pace_s_per_mi": 458,
      "avg_hr": 165,
      "adherence_percentage": 92
    }
  }
]
```

---

### Step 3: Add Granular Analysis
**File**: `supabase/functions/analyze-running-workout/index.ts` (lines 517, 609)

**Input**:
- `computed.intervals` (from Step 2) ← Already has planned + executed + adherence
- `sensor_data`: For detailed analysis

**Process**:
1. Read `computed.intervals` (already has everything)
2. For each interval, slice sensor data by `sample_idx_start/end`
3. Calculate granular metrics:
   - `pace_variation_pct`: How consistent pace was
   - `hr_drift_bpm`: HR change during interval
   - `cadence_consistency_pct`: Cadence steadiness
   - `time_in_target_pct`: % of time in target zone

**Output stored in `workout_analysis.intervals`**:
```json
[
  {
    "kind": "warmup",
    "planned_step_id": "xyz-456",  // ← Same NEW ID
    "planned_index": 0,
    "planned": {
      "duration_s": 600,
      "distance_m": 1609,
      "target_pace_s_per_mi": 600
    },
    "executed": {
      "duration_s": 606,
      "distance_m": 1642,
      "avg_pace_s_per_mi": 592,
      "avg_hr": 135,
      "adherence_percentage": 98
    },
    "granular_metrics": {
      "pace_variation_pct": 3.2,
      "hr_drift_bpm": 2.1,
      "cadence_consistency_pct": 96.5,
      "time_in_target_pct": 98
    }
  },
  {
    "kind": "work",
    "planned_step_id": "xyz-789",  // ← Same NEW ID
    "planned_index": 1,
    "planned": {
      "duration_s": 450,
      "distance_m": 1609,
      "target_pace_s_per_mi": 450
    },
    "executed": {
      "duration_s": 463,
      "distance_m": 1626,
      "avg_pace_s_per_mi": 458,
      "avg_hr": 165,
      "adherence_percentage": 92
    },
    "granular_metrics": {
      "pace_variation_pct": 8.7,
      "hr_drift_bpm": 5.3,
      "cadence_consistency_pct": 91.2,
      "time_in_target_pct": 88
    }
  }
]
```

---

### Step 4: Frontend Displays Data
**File**: `src/components/MobileSummary.tsx` (lines 473-475, 2014)

**Input**:
- `planned_workouts.computed.steps`: Array of planned steps
- `workout_analysis.intervals`: Array of executed intervals (with granular metrics)

**Process**:
```typescript
// 1. Get planned steps
const plannedSteps = planned.computed.steps; 
// [{ id: "xyz-456", type: "warmup", pace: 600, ... }, ...]

// 2. Get executed intervals
const computedIntervals = workout.workout_analysis.intervals;
// [{ planned_step_id: "xyz-456", executed: {...}, ... }, ...]

// 3. Match by planned_step_id
for (const plannedStep of plannedSteps) {
  const executedInterval = computedIntervals.find(
    interval => interval.planned_step_id === plannedStep.id
  );
  
  // 4. Display both
  renderRow({
    planned: plannedStep.target_pace,           // ← From planned workout
    completed: executedInterval?.executed?.avg_pace, // ← From executed
    adherence: executedInterval?.executed?.adherence_percentage // ← Calculated
  });
}
```

**Output UI**:
```
┌─────────────┬─────────┬──────────┬──────────┬─────┐
│ Planned     │ Pace    │ Dist     │ Time     │ BPM │
├─────────────┼─────────┼──────────┼──────────┼─────┤
│ Warmup      │ 10:00   │ 1.0 mi   │ 10:00    │ 135 │
│ (Target)    │ 10:00   │ 1.0 mi   │ 10:00    │     │
│             │ ✅ 98%  │          │          │     │
├─────────────┼─────────┼──────────┼──────────┼─────┤
│ Work        │ 7:38    │ 1.01 mi  │ 7:43     │ 165 │
│ (Target)    │ 7:30    │ 1.0 mi   │ 7:30     │     │
│             │ ⚠️ 92%  │          │          │     │
└─────────────┴─────────┴──────────┴──────────┴─────┘
```

---

## ✅ What Our Fix Does

### Before Fix
1. Re-attach → `planned_id` changes
2. `computed.intervals` still has OLD `planned_step_id` = "abc-123"
3. Frontend tries to match "abc-123" with new planned steps
4. **Match fails** → Shows "—" for pace/adherence ❌

### After Fix
1. Re-attach → `planned_id` changes
2. `computed.intervals = []` ← **CLEARED** ✅
3. `compute-workout-summary` regenerates with NEW `planned_step_id` = "xyz-456" ✅
4. `analyze-running-workout` copies intervals with NEW IDs ✅
5. Frontend matches "xyz-456" successfully ✅
6. **Displays planned + completed + adherence** ✅

---

## 📊 Complete Data Sources

| What          | Where It Comes From                           | Which Field                        |
|---------------|-----------------------------------------------|------------------------------------|
| Planned pace  | `planned_workouts.computed.steps`             | `target_pace_s_per_mi`             |
| Completed pace| `workout_analysis.intervals[].executed`       | `avg_pace_s_per_mi`                |
| Adherence %   | `workout_analysis.intervals[].executed`       | `adherence_percentage`             |
| Granular      | `workout_analysis.intervals[].granular_metrics` | `time_in_target_pct`, etc.         |

**Key**: All three pieces (planned, completed, adherence) are **already in the data**. The issue was just **matching them together** using `planned_step_id`.

---

## 🎯 Summary

**The fix is simple**:
1. Clear `computed.intervals = []` on re-attach
2. Let `compute-workout-summary` regenerate with correct IDs
3. Let `analyze-running-workout` copy and enhance
4. Frontend matching works → displays all data

**No additional code needed** - the system already calculates:
- ✅ Planned data (from `planned_workouts`)
- ✅ Completed data (from `sensor_data`)
- ✅ Adherence percentage (comparison of planned vs completed)
- ✅ Granular metrics (time-in-zone, pace variation, etc.)

The **only issue** was stale IDs after re-attach, which our fix resolves.

