# 🔄 Complete Workout Analysis Flow

## Overview

This document outlines the complete data flow from workout sync to frontend display, showing how sensor data becomes actionable insights.

---

## 📊 Data Storage Architecture

### Single Source of Truth
```
workouts.computed.intervals ← ALL interval data lives here
workouts.workout_analysis   ← Summary analysis only (no intervals)
```

### Data Structure
```json
// workouts.computed.intervals
[
  {
    "planned_step_id": "abc-123",
    "kind": "work",
    "role": "work", 
    "sample_idx_start": 0,
    "sample_idx_end": 300,
    
    "planned": {
      "duration_s": 300,
      "distance_m": 1609,
      "target_pace_s_per_mi": 420
    },
    
    "executed": {
      "duration_s": 305,
      "distance_m": 1615,
      "avg_pace_s_per_mi": 422,
      "avg_hr": 155,
      "adherence_percentage": 95
    },
    
    "granular_metrics": {
      "pace_variation_pct": 3.2,
      "hr_drift_bpm": 2.1,
      "time_in_target_pct": 98
    }
  }
]

// workouts.workout_analysis
{
  "performance": {
    "execution_adherence": 71,
    "pace_adherence": 71,
    "duration_adherence": 89
  },
  "granular_analysis": {
    "overall_adherence": 0.71,
    "performance_assessment": "Fair execution",
    "primary_issues": ["Recovery jogs too slow"],
    "strengths": ["Work intervals consistent"]
  }
}
```

---

## 🔄 Complete Flow Diagram

```
Garmin Sync/Import
    ↓
Raw sensor_data (3000 samples/second)
    ↓
compute-workout-summary
    ↓
Basic intervals (planned_step_id, executed averages)
    ↓
analyze-running-workout  
    ↓
Enhanced intervals (+ granular_metrics) + Summary analysis
    ↓
Frontend reads computed.intervals + workout_analysis
    ↓
Display planned vs completed table
```

---

## ⚙️ Step-by-Step Flow

### Step 1: Data Ingestion
**Trigger**: Garmin sync, manual import, or workout completion

**Input**:
```json
{
  "sensor_data": [
    {"timestamp": "2024-01-01T06:00:00Z", "pace_s_per_mi": 600, "hr": 135},
    {"timestamp": "2024-01-01T06:00:01Z", "pace_s_per_mi": 598, "hr": 136},
    // ... 3000+ samples
  ],
  "planned_id": "workout-abc-123"
}
```

**Process**:
1. Store raw sensor data in `workouts.sensor_data`
2. Call `compute-workout-summary` with `workout_id`

---

### Step 2: Basic Interval Generation
**Function**: `compute-workout-summary`

**Input**:
- `workouts.sensor_data` (raw samples)
- `planned_workouts.computed.steps` (planned structure)

**Process**:
```typescript
1. Load planned workout steps
2. For each planned step:
   a. Slice sensor data by time/laps
   b. Calculate executed averages (pace, HR, power)
   c. Calculate basic adherence percentage
   d. Assign planned_step_id
3. Store in workouts.computed.intervals
```

**Output**:
```json
computed.intervals = [
  {
    "planned_step_id": "step-abc-123",
    "executed": {
      "avg_pace_s_per_mi": 422,
      "avg_hr": 155,
      "adherence_percentage": 95
    }
    // No granular_metrics yet
  }
]
```

---

### Step 3: Granular Analysis
**Function**: `analyze-running-workout`

**Input**:
- `workouts.computed.intervals` (basic intervals)
- `workouts.sensor_data` (raw samples)

**Process**:
```typescript
1. Read computed.intervals (already sliced)
2. For each interval:
   a. Get sample range (sample_idx_start to sample_idx_end)
   b. Slice sensor_data: samples[0:300]
   c. Calculate granular metrics:
      - Loop through each sample
      - Check if pace is in target zone
      - Count: 290 in zone, 10 out of zone
      - time_in_target_pct = 96.7%
   d. Attach granular_metrics to interval
3. Calculate Garmin-style execution scores
4. Update computed.intervals (enhanced)
5. Store summary in workout_analysis
```

**Output**:
```json
// Enhanced computed.intervals
computed.intervals = [
  {
    "planned_step_id": "step-abc-123",
    "executed": {
      "avg_pace_s_per_mi": 422,
      "avg_hr": 155,
      "adherence_percentage": 95
    },
    "granular_metrics": {          // ← ADDED
      "pace_variation_pct": 3.2,
      "hr_drift_bpm": 2.1,
      "time_in_target_pct": 96.7
    }
  }
]

// Summary analysis
workout_analysis = {
  "performance": {
    "execution_adherence": 71,
    "pace_adherence": 71,
    "duration_adherence": 89
  }
}
```

---

### Step 4: Frontend Display
**Component**: `MobileSummary.tsx`

**Input**:
- `workout.computed.intervals` (enhanced intervals)
- `planned.computed.steps` (planned structure)

**Process**:
```typescript
1. Load planned steps and computed intervals
2. For each planned step:
   a. Find matching interval by planned_step_id
   b. Display:
      - Planned: step.target_pace_s_per_mi
      - Completed: interval.executed.avg_pace_s_per_mi  
      - Adherence: interval.executed.adherence_percentage
      - Time in zone: interval.granular_metrics.time_in_target_pct
3. Display overall scores from workout_analysis.performance
```

**Output**: Table showing planned vs completed with adherence metrics

---

## 🔄 Re-Attach Flow (Special Case)

### When user re-attaches workout to different plan:

```
User clicks "Attach to Plan-B"
    ↓
auto-attach-planned updates:
  - workout.planned_id = "plan-b-xyz"
  - computed.intervals = [] ← CLEARED
    ↓
compute-workout-summary:
  - Loads Plan-B structure
  - Re-slices SAME sensor data
  - Assigns NEW planned_step_id values
  - Stores in computed.intervals
    ↓
analyze-running-workout:
  - Reads computed.intervals (has new IDs)
  - Adds granular_metrics
  - Updates computed.intervals
    ↓
Frontend matches Plan-B IDs → FOUND → shows pace ✓
```

---

## 🎯 Key Functions & Responsibilities

### `compute-workout-summary`
**Job**: Slice sensor data into intervals
**Input**: Raw sensor data + planned structure  
**Output**: Basic interval averages
**Stores**: `computed.intervals` (without granular metrics)

### `analyze-running-workout`
**Job**: Deep-dive analysis + execution scoring
**Input**: `computed.intervals` + raw sensor data
**Output**: Granular metrics + execution scores
**Stores**: 
- Enhanced `computed.intervals` (with granular_metrics)
- Summary in `workout_analysis` (no intervals)

### `auto-attach-planned`
**Job**: Link workout to planned workout
**Process**:
1. Update `workout.planned_id`
2. Clear `computed.intervals = []`
3. Call `compute-workout-summary`
4. Call `analyze-running-workout`

### Frontend (`MobileSummary`)
**Job**: Display planned vs completed
**Input**: `planned.computed.steps` + `workout.computed.intervals`
**Output**: Table with planned, completed, adherence

---

## 📊 Data Flow Triggers

### Normal Flow (New Workout)
```
Garmin sync → ingest-activity → compute-workout-summary → analyze-running-workout
```

### Re-Attach Flow
```
User action → auto-attach-planned → compute-workout-summary → analyze-running-workout
```

### Manual Analysis
```
Admin action → analyze-running-workout (direct call)
```

---

## 🔍 Data Matching Logic

### Frontend Matching
```typescript
// Primary: Match by planned_step_id
const interval = intervals.find(
  i => i.planned_step_id === plannedStep.id
);

// Fallback: Match by planned_index  
if (!interval) {
  interval = intervals.find(
    i => i.planned_index === plannedStep.planned_index
  );
}
```

### Why This Works
- `planned_step_id` is unique identifier assigned by `compute-workout-summary`
- Re-attach clears intervals and regenerates with new IDs
- Frontend always finds correct match

---

## 🎯 Execution Scoring Flow

### Garmin-Style Penalty System
```typescript
1. Infer segment type (work_interval, recovery_jog, etc.)
2. Calculate deviation from 100% adherence
3. Apply tolerance thresholds (5% work, 15% recovery)
4. Calculate penalties for excess deviation
5. Add directional penalties (too slow on work, too fast on recovery)
6. Execution score = 100 - total_penalties
```

### Example
```
Work interval at 107% adherence:
- Deviation: 7% (exceeds 5% tolerance by 2%)
- Base penalty: 2% × 1.0 weight = 2.0
- Direction penalty: 0 (close enough)
- Total penalty: 2.0

Recovery jog at 66% adherence:
- Deviation: 34% (exceeds 15% tolerance by 19%)
- Base penalty: 19% × 0.7 weight = 13.3
- Direction penalty: 3 (way too slow)
- Total penalty: 16.3
```

---

## ✅ What Makes This Work

### 1. Single Source of Truth
- All interval data in `computed.intervals`
- No duplication or sync issues
- Clear data ownership

### 2. Sequential Processing
- `compute-workout-summary` creates basic intervals
- `analyze-running-workout` enhances them
- Each step builds on the previous

### 3. Event-Driven Refresh
- Frontend listens for `workout:invalidate` events
- Automatically refreshes after analysis
- No manual refresh needed

### 4. Robust Matching
- Primary match by `planned_step_id`
- Fallback match by `planned_index`
- Handles re-attach scenarios

---

## 🧪 Testing the Flow

### Test 1: Normal Sync
1. Complete run with Garmin
2. Attach to planned workout
3. **Verify**: Intervals show planned vs completed pace
4. **Verify**: Execution scores calculated

### Test 2: Re-Attach
1. Take existing workout
2. Unattach from Plan A
3. Attach to Plan B
4. **Verify**: Intervals update with new planned structure
5. **Verify**: Execution scores recalculated

### Test 3: Granular Analysis
1. Open workout with intervals
2. **Verify**: `granular_metrics` populated
3. **Verify**: Execution scores reflect actual performance

---

## 📋 Summary

**The flow is simple and reliable:**

1. **Raw data** → `compute-workout-summary` → **Basic intervals**
2. **Basic intervals** → `analyze-running-workout` → **Enhanced intervals + Summary**
3. **Enhanced intervals** → **Frontend** → **Display table**

**Key principles:**
- Single storage location (`computed.intervals`)
- Sequential enhancement (basic → granular)
- Event-driven refresh
- Robust matching by ID

**Result**: Reliable, fast, accurate workout analysis that provides actionable insights for training improvement.
