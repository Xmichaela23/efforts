# Audit: Duration vs Moving Time in Steady-State Run Adherence

## Issue
The summary for long steady-state runs is using **duration** (elapsed time) instead of **moving time** to calculate adherence scores.

## Root Cause Analysis

### PRIMARY ROOT CAUSE: `compute-workout-analysis` Sets `duration_s_moving` to Elapsed Time

**Location**: `supabase/functions/compute-workout-analysis/index.ts`  
**Lines**: 1429-1445

#### Problem Code:

```typescript
// 4) Fallback: timeSeries or summary duration
if (!dur) {
  dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries) : null;  // ❌ timeSeries might be elapsed!
}
if (!dur && ga) {
  try {
    const raw = parseJson(ga.raw_data) || {};
    const garminDur = Number(raw?.summary?.durationInSeconds ?? raw?.durationInSeconds);  // ❌ Could be elapsed!
    if (Number.isFinite(garminDur) && garminDur > 0) dur = Math.round(garminDur);
  } catch {}
}

// ... later ...

duration_s_moving: dur || prevOverall?.duration_s_moving || null,  // ❌ dur might be elapsed time!
```

**Problem**: When moving time isn't available from sensor samples, `compute-workout-analysis` falls back to:
1. `timeSeries` - which might be elapsed time (not moving time)
2. `raw?.summary?.durationInSeconds` - which is typically elapsed time, not moving time

This means `computed.overall.duration_s_moving` can contain **elapsed time** instead of moving time, which then gets used by `analyze-running-workout` for adherence calculations.

### Secondary Issue: Freeform Run Case Uses Elapsed Time Fallback

**Location**: `supabase/functions/analyze-running-workout/index.ts`  
**Function**: `calculateSteadyStatePaceAdherence()`  
**Lines**: 2043-2087

#### Problem Code (Lines 2048-2087):

```typescript
// Calculate total time from sensor data or workout fields
const totalTimeSeconds = sensorData.length > 0 
  ? (sensorData[sensorData.length - 1].elapsed_time_s || sensorData.length)  // ❌ USING ELAPSED TIME
  : (workout.moving_time * 60 || workout.duration * 60 || 0);

// ... later ...

// Calculate duration adherence even for freeform runs (we have the data)
const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
const actualDurationSeconds = 
  workout?.computed?.overall?.duration_s_moving ||  // ⚠️ MIGHT BE ELAPSED TIME (from above issue)
  totalTimeSeconds ||                                // ❌ FALLBACK TO ELAPSED TIME
  intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
```

**Problem**: Even if `workout?.computed?.overall?.duration_s_moving` exists, it might contain elapsed time (from the primary issue above). And when it doesn't exist, the code falls back to `totalTimeSeconds`, which uses `elapsed_time_s` from sensor data.

### Secondary Issue: Main Steady-State Path

**Location**: `supabase/functions/analyze-running-workout/index.ts`  
**Function**: `calculateSteadyStatePaceAdherence()`  
**Lines**: 2240-2245

#### Code (Lines 2243-2245):

```typescript
const actualDurationSeconds = 
  workout?.computed?.overall?.duration_s_moving ||  // ✅ CORRECT (moving time)
  intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);  // ⚠️ UNCLEAR
```

**Status**: This path correctly prioritizes `duration_s_moving`, but the fallback to summing interval durations is unclear whether those intervals use moving or elapsed time.

### How `duration_s_moving` is Computed

**Location**: `supabase/functions/compute-workout-analysis/index.ts`  
**Lines**: 1460-1495

The `duration_s_moving` field is correctly computed using moving time:

```typescript
// Extract duration - PRIORITIZE moving time over elapsed time
// First: try to get moving time from raw sensor data (most accurate)
const movingS = Number(lastSample?.movingDurationInSeconds);
if (Number.isFinite(movingS) && movingS > 0) dur = Math.round(movingS);

// Second: use stored moving_time field (reliable fallback)
if (!dur) {
  const moveMin = Number((w as any)?.moving_time);
  if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
}

// Third: use timeSeries ONLY if we don't have moving time (might be elapsed time)
if (!dur && Number.isFinite(timeSeries) && timeSeries > 0) {
  dur = Math.round(timeSeries);
}
```

**Conclusion**: `duration_s_moving` is correctly computed as moving time, but the adherence calculation has a problematic fallback.

## Impact

1. **Freeform runs** (no main segments): When `duration_s_moving` is missing, adherence uses elapsed time, which includes stops. This inflates the duration and can result in:
   - Lower adherence scores if the run had stops (actual > planned)
   - Incorrect adherence assessment for steady-state runs where stops shouldn't count

2. **Steady-state runs with segments**: Should work correctly if `duration_s_moving` is available, but may have issues if it's missing.

## Evidence from Images

From the user's images:
- **Summary tab**: Shows "91% Duration Time adherence" 
- **Details tab**: Shows "Duration: 1:52:06" and "Moving Time: 1:40:00"
- The 12-minute difference (1:52:06 - 1:40:00) represents stops/rest time
- The adherence calculation appears to be using the 1:52:06 duration (elapsed) instead of 1:40:00 (moving)

## Recommended Fix

### Fix 1: Fix `compute-workout-analysis` to Never Use Elapsed Time for `duration_s_moving`

**File**: `supabase/functions/compute-workout-analysis/index.ts`  
**Lines**: 1429-1445

**Change**: Remove fallbacks that use elapsed time. Only use moving time sources:

```typescript
// BEFORE (lines 1429-1445):
// 4) Fallback: timeSeries or summary duration
if (!dur) {
  dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries) : null;  // ❌ REMOVE
}
if (!dur && ga) {
  try {
    const raw = parseJson(ga.raw_data) || {};
    const garminDur = Number(raw?.summary?.durationInSeconds ?? raw?.durationInSeconds);  // ❌ REMOVE
    if (Number.isFinite(garminDur) && garminDur > 0) dur = Math.round(garminDur);
  } catch {}
}

// AFTER:
// 4) DO NOT fallback to timeSeries or summary durationInSeconds - these are elapsed time!
// Only use moving_time field if we don't have moving time from sensor data
if (!dur) {
  const moveMin = Number((w as any)?.moving_time);
  if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
}
// If still no dur, leave it null - don't use elapsed time!
```

**Rationale**: `duration_s_moving` should ONLY contain moving time. If moving time isn't available, it should be `null`, not elapsed time.

### Fix 2: Remove Elapsed Time Fallback in Freeform Case

**File**: `supabase/functions/analyze-running-workout/index.ts`  
**Lines**: 2048-2087

**Change**: Use `workout.moving_time` directly instead of elapsed time fallback:

```typescript
// BEFORE:
const totalTimeSeconds = sensorData.length > 0 
  ? (sensorData[sensorData.length - 1].elapsed_time_s || sensorData.length)  // ❌ ELAPSED TIME
  : (workout.moving_time * 60 || workout.duration * 60 || 0);

const actualDurationSeconds = 
  workout?.computed?.overall?.duration_s_moving ||
  totalTimeSeconds ||  // ❌ PROBLEM: This is elapsed time
  intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);

// AFTER:
// Use moving_time field directly - it's the source of truth for moving time
const actualDurationSeconds = 
  workout?.computed?.overall?.duration_s_moving ||
  (workout.moving_time ? Math.round(workout.moving_time * 60) : null) ||  // ✅ Use moving_time field
  intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
```

**Rationale**: `workout.moving_time` is the authoritative source for moving time. Don't calculate from sensor data's elapsed_time_s.

### Fix 2: Ensure Interval Durations Use Moving Time

Verify that `intervals[].executed.duration_s` is calculated from moving time, not elapsed time. If intervals are calculated from sensor data samples, ensure they exclude stopped periods.

## Testing

After fix, verify:
1. Freeform steady-state runs use moving time for adherence
2. Runs with stops show correct adherence (should exclude stop time)
3. Adherence scores match the "Moving Time" shown in Details tab, not "Duration"

## Related Code Locations

- `calculateSteadyStatePaceAdherence()`: Lines 2027-2347
- `calculateIntervalPaceAdherence()`: Lines 1788-1808 (uses `duration_s_moving` correctly)
- `compute-workout-analysis/index.ts`: Lines 1460-1495 (correctly computes `duration_s_moving`)



