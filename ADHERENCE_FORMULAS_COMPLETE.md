# Adherence Formulas: Complete Understanding

## 🎯 Purpose
This document ensures complete understanding of all adherence formulas used in the system, so they remain unchanged during refactoring.

---

## 📊 Formula 1: Pace Adherence (Time-in-Range)

### Purpose
Calculate what percentage of time was spent within the prescribed pace range (sample-by-sample analysis).

### Location
`analyze-running-workout/index.ts` lines 1979-2276 (`calculateIntervalPaceAdherence`)

### Formula
```typescript
// For each interval with pace target:
// 1. Slice sensor data by interval (using sample_idx_start and sample_idx_end)
const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);

// 2. For each sample, check if pace is within target range
let timeInRange = 0;
let timeOutsideRange = 0;

for (const sample of intervalSamples) {
  const pace = sample.pace_s_per_mi;
  const targetLower = interval.pace_range?.lower || interval.planned?.pace_range?.lower;
  const targetUpper = interval.pace_range?.upper || interval.planned?.pace_range?.upper;
  
  if (pace >= targetLower && pace <= targetUpper) {
    timeInRange += 1; // Each sample = 1 second
  } else {
    timeOutsideRange += 1;
  }
}

// 3. Calculate percentage
const totalTime = timeInRange + timeOutsideRange;
const timeInRangeScore = totalTime > 0 ? timeInRange / totalTime : 0;
const paceAdherence = timeInRangeScore * 100; // Convert to percentage
```

### Key Points
- ✅ **Sample-by-sample analysis** (not averages)
- ✅ Each sample = 1 second of time
- ✅ Uses `pace_range.lower` and `pace_range.upper` from planned step
- ✅ Result: 0-100% (percentage of time in range)

### Used By
- Summary screen: `workout_analysis.performance.pace_adherence`
- Context screen: `workout_analysis.detailed_analysis` (for insights)

---

## 📊 Formula 2: Duration Adherence

### Purpose
Calculate how well the actual duration matches the planned duration (with penalties for both over and under).

### Location
`analyze-running-workout/index.ts` lines 2110-2130 (`calculateIntervalPaceAdherence`)

### Formula
```typescript
const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || 
  intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);

let durationAdherencePct = 0;
if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
  const ratio = actualDurationSeconds / plannedDurationSeconds;
  
  if (ratio >= 0.9 && ratio <= 1.1) {
    // Within 10% tolerance - high score (90-100%)
    durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
  } else if (ratio < 0.9) {
    // Too short - penalize proportionally
    durationAdherencePct = ratio * 100;
  } else {
    // Too long - penalize (inverse ratio)
    durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
  }
  
  // Clamp to 0-100%
  durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
}
```

### Key Points
- ✅ **Penalizes both over and under** duration
- ✅ **10% tolerance** (90-110% of planned = high score)
- ✅ **Too short**: Score = ratio × 100 (e.g., 80% of planned = 80% score)
- ✅ **Too long**: Score = (planned / actual) × 100 (e.g., 120% of planned = 83% score)
- ✅ Uses `duration_s_moving` (moving time, not elapsed)

### Used By
- Summary screen: `workout_analysis.performance.duration_adherence`
- Context screen: `workout_analysis.detailed_analysis` (for insights)

---

## 📊 Formula 3: Execution Adherence (Overall Score)

### Purpose
Calculate overall execution score combining pace and duration adherence.

### Location
`analyze-running-workout/index.ts` lines 1140-1258

### Formula A: Single-Target Workouts (Simple)
```typescript
// For workouts with single pace target (not a range)
performance.execution_adherence = Math.round(
  (performance.pace_adherence * 0.5) + 
  (performance.duration_adherence * 0.5)
);
```

**Weighting**: 50% pace + 50% duration

---

### Formula B: Range Workouts (Weighted)
```typescript
// For workouts with pace range (e.g., "7:00-8:00/mi")
// Step 1: Calculate average pace adherence
const workoutAvgPaceSeconds = workoutMovingTimeSeconds / workoutDistanceMi;
let avgPaceAdherenceScore = performance.pace_adherence; // Default to time-in-range

if (workoutAvgPaceSeconds >= targetLower && workoutAvgPaceSeconds <= targetUpper) {
  avgPaceAdherenceScore = 100; // Perfect - within range
} else {
  // Calculate distance from range
  let distanceFromRange = 0;
  if (workoutAvgPaceSeconds < targetLower) {
    distanceFromRange = targetLower - workoutAvgPaceSeconds;
  } else {
    distanceFromRange = workoutAvgPaceSeconds - targetUpper;
  }
  
  // Score decreases by 1% per second away from range, but caps at 70% minimum
  avgPaceAdherenceScore = Math.max(70, 100 - distanceFromRange);
}

// Step 2: Weighted combination
performance.execution_adherence = Math.round(
  (avgPaceAdherenceScore * 0.4) +        // 40% - Average pace adherence
  (performance.pace_adherence * 0.3) +    // 30% - Time-in-range (consistency)
  (performance.duration_adherence * 0.3)  // 30% - Duration adherence
);
```

**Weighting**: 
- 40% average pace adherence (did they hit the overall target?)
- 30% time-in-range (mile-by-mile consistency)
- 30% duration adherence (completing the workout)

### Key Points
- ✅ **Different formulas** for single-target vs range workouts
- ✅ **Range workouts** include average pace adherence (overall target)
- ✅ **Single-target workouts** use simple 50/50 weighting
- ✅ Result: 0-100% (overall execution score)

### Used By
- Summary screen: `workout_analysis.performance.execution_adherence`
- Context screen: `workout_analysis.performance` (for insights)

---

## 📊 Formula 4: Average Pace Adherence (Range Workouts Only)

### Purpose
Calculate how close the overall average pace is to the target range (for range workouts only).

### Location
`analyze-running-workout/index.ts` lines 1224-1241

### Formula
```typescript
// Get workout-level average pace
const workoutMovingTimeSeconds = workout?.computed?.overall?.duration_s_moving;
const workoutDistanceMi = workoutDistanceKm * 0.621371;
const workoutAvgPaceSeconds = workoutMovingTimeSeconds / workoutDistanceMi;

// Check if average pace is within range
if (workoutAvgPaceSeconds >= targetLower && workoutAvgPaceSeconds <= targetUpper) {
  avgPaceAdherenceScore = 100; // Perfect - within range
} else {
  // Calculate distance from range
  let distanceFromRange = 0;
  if (workoutAvgPaceSeconds < targetLower) {
    distanceFromRange = targetLower - workoutAvgPaceSeconds;
  } else {
    distanceFromRange = workoutAvgPaceSeconds - targetUpper;
  }
  
  // Score decreases by 1% per second away from range
  // Caps at 70% minimum (even if 30+ seconds off)
  avgPaceAdherenceScore = Math.max(70, 100 - distanceFromRange);
}
```

### Key Points
- ✅ **Only used for range workouts** (not single-target)
- ✅ **1% penalty per second** away from range
- ✅ **Minimum score: 70%** (even if very far off)
- ✅ Uses overall average pace (moving time / distance)

### Example
- Target range: 420-480 s/mi (7:00-8:00/mi)
- Actual average: 450 s/mi (7:30/mi) → **100%** (within range)
- Actual average: 400 s/mi (6:40/mi) → **80%** (20 seconds too fast)
- Actual average: 500 s/mi (8:20/mi) → **80%** (20 seconds too slow)
- Actual average: 350 s/mi (5:50/mi) → **70%** (70 seconds too fast, capped)

---

## 📊 Formula 5: Per-Interval Adherence (Granular Metrics)

### Purpose
Calculate adherence metrics for each individual interval (used for interval breakdown).

### Location
`analyze-running-workout/index.ts` lines 2019-2030 (`analyzeIntervalPace`)

### Formula
```typescript
// For each interval:
const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);

// Returns:
{
  timeInRange: number,        // Seconds in range
  timeOutsideRange: number,   // Seconds outside range
  totalSamples: number,        // Total seconds
  granular_metrics: {
    time_in_target_pct: (timeInRange / totalSamples) * 100,
    pace_variation_pct: coefficient_of_variation,
    hr_drift_bpm: heart_rate_drift
  }
}
```

### Key Points
- ✅ **Per-interval calculation** (not overall)
- ✅ Stored in `computed.intervals[].granular_metrics`
- ✅ Used for interval-by-interval breakdown in Context screen

---

## 📊 Formula 6: Segment-by-Segment Adherence

### Purpose
Calculate adherence for each segment type (warmup, work, recovery, cooldown).

### Location
`analyze-running-workout/index.ts` lines 2153-2184

### Formula
```typescript
// For each segment type (warmup, work, recovery, cooldown):
const calculateSegmentAdherence = (segmentIntervals: any[]) => {
  let segmentTimeInRange = 0;
  let segmentTimeOutsideRange = 0;
  
  // Sum up all intervals in this segment
  for (const interval of segmentIntervals) {
    const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);
    segmentTimeInRange += intervalResult.timeInRange;
    segmentTimeOutsideRange += intervalResult.timeOutsideRange;
  }
  
  const segmentTotalTime = segmentTimeInRange + segmentTimeOutsideRange;
  const segmentAdherencePct = segmentTotalTime > 0 
    ? (segmentTimeInRange / segmentTotalTime) * 100 
    : 0;
  
  return {
    adherence: Math.round(segmentAdherencePct),
    timeInRange: segmentTimeInRange,
    totalTime: segmentTotalTime
  };
};
```

### Key Points
- ✅ **Groups intervals by role** (warmup/work/recovery/cooldown)
- ✅ **Sums time-in-range** across all intervals in segment
- ✅ Used for segment breakdown in Context screen

---

## 🔄 Complete Flow

### Step 1: Calculate Granular Pace Adherence
```typescript
// For each interval with pace target:
const granularAnalysis = calculatePrescribedRangeAdherenceGranular(
  sensorData, 
  intervals, 
  workout, 
  plannedWorkout
);

// Returns:
{
  overall_adherence: 0.85,  // 85% (as decimal 0-1)
  time_in_range_s: 2550,    // Seconds in range
  time_outside_range_s: 450, // Seconds outside range
  duration_adherence: {
    adherence_percentage: 95  // Duration adherence %
  }
}
```

### Step 2: Extract Pace and Duration Adherence
```typescript
// Pace adherence: Convert decimal to percentage
const paceAdherence = Math.round(granularAnalysis.overall_adherence * 100); // 85%

// Duration adherence: Use from granular analysis
const durationAdherence = granularAnalysis.duration_adherence.adherence_percentage; // 95%
```

### Step 3: Calculate Execution Adherence
```typescript
// For range workouts:
const executionAdherence = Math.round(
  (avgPaceAdherenceScore * 0.4) +      // 40% - Average pace
  (paceAdherence * 0.3) +               // 30% - Time-in-range
  (durationAdherence * 0.3)             // 30% - Duration
);

// For single-target workouts:
const executionAdherence = Math.round(
  (paceAdherence * 0.5) +               // 50% - Pace
  (durationAdherence * 0.5)             // 50% - Duration
);
```

### Step 4: Store Results
```typescript
workout_analysis.performance = {
  execution_adherence: 88,    // Overall score
  pace_adherence: 85,         // Time-in-range %
  duration_adherence: 95      // Duration adherence %
};
```

---

## ✅ Key Requirements for Refactoring

### Must Maintain:

1. **Pace Adherence Formula**:
   ```typescript
   paceAdherence = (timeInRange / totalTime) * 100
   ```
   - ✅ Sample-by-sample analysis (not averages)
   - ✅ Uses `pace_range.lower` and `pace_range.upper`
   - ✅ Result: 0-100%

2. **Duration Adherence Formula**:
   ```typescript
   if (ratio >= 0.9 && ratio <= 1.1) {
     durationAdherence = 100 - Math.abs(ratio - 1) * 100;
   } else if (ratio < 0.9) {
     durationAdherence = ratio * 100;
   } else {
     durationAdherence = (planned / actual) * 100;
   }
   ```
   - ✅ 10% tolerance (90-110%)
   - ✅ Penalizes both over and under
   - ✅ Uses `duration_s_moving`

3. **Execution Adherence Formula**:
   - ✅ **Single-target**: 50% pace + 50% duration
   - ✅ **Range workouts**: 40% avg pace + 30% time-in-range + 30% duration
   - ✅ Average pace adherence: 1% penalty per second, min 70%

4. **Granular Metrics**:
   - ✅ Per-interval `time_in_target_pct`
   - ✅ Per-segment adherence (warmup/work/recovery/cooldown)
   - ✅ Stored in `computed.intervals[].granular_metrics`

---

## 🎯 Summary

### Three Main Adherence Scores:

| Score | Formula | Purpose |
|-------|---------|---------|
| **Pace Adherence** | `(timeInRange / totalTime) * 100` | % of time in target pace range |
| **Duration Adherence** | `(actual / planned) * 100` (with penalties) | How well duration matched planned |
| **Execution Adherence** | Weighted combination | Overall execution score |

### Weighting:

**Single-Target Workouts**:
- 50% pace + 50% duration

**Range Workouts**:
- 40% average pace adherence (overall target)
- 30% time-in-range (consistency)
- 30% duration adherence

---

## ✅ Verification Checklist

Before refactoring, verify:
- [x] Pace adherence uses sample-by-sample analysis
- [x] Duration adherence has 10% tolerance
- [x] Execution adherence uses correct weighting (single vs range)
- [x] Average pace adherence uses 1% per second penalty
- [x] All formulas remain unchanged during refactoring

**Ready to proceed with refactoring!** ✅






