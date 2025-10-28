# 🔍 COMPLETE SYSTEM AUDIT: Interval Data Flow

## Executive Summary

**Problem**: After re-attaching a workout to a different planned workout, intervals show "—" (no pace data) instead of actual executed pace values.

**Root Cause**: System has duplicate interval data in two places (`computed.intervals` and `workout_analysis.intervals`), and the process for regenerating them after re-attach wasn't working correctly.

---

## 📊 Data Storage: Where Intervals Live

### 1. `workouts.computed.intervals` 
**Owner**: `compute-workout-summary` edge function
**Created by**: Matching sensor data samples against planned steps
**Structure**:
```json
{
  "kind": "work",
  "role": "work", 
  "planned_step_id": "abc-123",
  "planned_index": 0,
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
  }
}
```

### 2. `workouts.workout_analysis.intervals`
**Owner**: `analyze-running-workout` edge function  
**Created by**: **COPYING** `computed.intervals` and adding granular metrics
**Structure**: Same as `computed.intervals` but with additional `granular_metrics`:
```json
{
  ...computed_interval_data,
  "granular_metrics": {
    "time_in_target_pct": 85,
    "pace_variation_pct": 5,
    "hr_drift_bpm": 3,
    "cadence_consistency": 0.95
  }
}
```

---

## ⚙️ Function Responsibilities

### `compute-workout-summary`
**File**: `supabase/functions/compute-workout-summary/index.ts`

**What it does**:
1. Reads `sensor_data` (second-by-second GPS/HR/power samples)
2. Reads `planned_workouts.intervals` to get planned step structure
3. Matches sensor data to planned steps by time or laps
4. Calculates executed metrics (pace, HR, power, duration, distance)
5. **Stores in** → `workouts.computed.intervals` (line 1434)

**Key responsibilities**:
- ✅ Interval detection and matching
- ✅ Executed metric calculation (avg pace, HR, power)
- ✅ Adherence percentage (basic comparison)
- ✅ Assigning `planned_step_id` to each interval

**CRITICAL**: This function is the **source of truth** for which samples belong to which planned step.

---

### `analyze-running-workout` 
**File**: `supabase/functions/analyze-running-workout/index.ts`

**What it does**:
1. **Reads** `workouts.computed.intervals` (line 517) ← Already has executed data!
2. Slices sensor data by `sample_idx_start` / `sample_idx_end` for each interval
3. Calculates granular metrics:
   - Pace variation within interval
   - HR drift
   - Time in target zone (not just average)
   - Cadence consistency
4. **Stores in** → `workout_analysis.intervals` (line 609)

**Key responsibilities**:
- ✅ Granular time-in-zone analysis
- ✅ Pace/power consistency metrics
- ✅ HR drift detection
- ✅ Performance assessment

**IMPORTANT**: This function **does NOT create intervals from scratch**. It only enhances what `compute-workout-summary` already created.

---

## 🎨 Frontend Display (MobileSummary.tsx)

**File**: `src/components/MobileSummary.tsx`

**Data source hierarchy** (lines 471-475):
```typescript
const computedIntervals = 
  workout_analysis?.intervals  // ← FIRST PREFERENCE
  || computed?.intervals       // ← FALLBACK
  || [];
```

**How it displays pace** (lines 673-677):
```typescript
// Priority 1: Individual interval pace
if (interval?.executed?.avg_pace_s_per_mi) {
  return interval.executed.avg_pace_s_per_mi;
}

// Priority 2: Overall workout pace (fallback)
return workout.computed.overall.avg_pace_s_per_mi;
```

**Matching logic** (lines 1224-1231, 2014):
```typescript
// Match by planned_step_id
const row = intervalByPlannedId.get(plannedStep.id);

// Fallback: Match by planned_index
if (!row) {
  row = intervalByIndex.get(plannedStep.planned_index);
}
```

---

## 🔄 Normal Flow (Working Case)

### Scenario: Workout syncs from Garmin

1. **ingest-activity** receives workout data
2. Calls **compute-workout-summary**:
   - Matches sensor data to planned steps
   - Creates `computed.intervals` with `planned_step_id` = "abc-123"
   - Stores: `workouts.computed.intervals`
3. Calls **analyze-running-workout**:
   - Reads `computed.intervals`
   - Adds granular metrics
   - Stores: `workout_analysis.intervals`
4. **Frontend displays**:
   - Reads `workout_analysis.intervals`
   - Matches planned steps by `planned_step_id`
   - Shows `executed.avg_pace_s_per_mi` ✅

---

## ❌ Re-Attach Flow (Broken Before Fix)

### Scenario: User re-attaches workout to different planned workout

**Before our fix**:
1. **User clicks "Attach"** → new `planned_id` = "xyz-789"
2. **auto-attach-planned** updates:
   - `workout.planned_id` = "xyz-789"
   - `computed.planned_steps_light` = null (cleared)
   - **BUT** `computed.intervals` still has OLD `planned_step_id` = "abc-123" ❌
3. Calls **compute-workout-summary**:
   - Returns 404 (because we set `computed: null` completely)
   - No intervals regenerated ❌
4. Calls **analyze-running-workout**:
   - Reads `computed.intervals` (still has old IDs)
   - Copies to `workout_analysis.intervals`
5. **Frontend displays**:
   - Reads `workout_analysis.intervals`
   - Tries to match by `planned_step_id` = "abc-123"
   - NEW planned steps have IDs like "xyz-456"
   - **Match fails** → shows "—" (no pace) ❌

---

## ✅ Re-Attach Flow (After Fix)

**After our fix**:
1. **User clicks "Attach"** → new `planned_id` = "xyz-789"
2. **auto-attach-planned** updates:
   - `workout.planned_id` = "xyz-789"
   - `computed.intervals` = [] ← CLEARED ✅
   - `computed.planned_steps_light` = null
3. Calls **compute-workout-summary**:
   - Rematches sensor data to NEW planned steps
   - Creates `computed.intervals` with NEW `planned_step_id` = "xyz-456" ✅
4. Calls **analyze-running-workout**:
   - Reads `computed.intervals` (now has correct IDs)
   - Copies to `workout_analysis.intervals` ✅
5. **Frontend displays**:
   - Reads `workout_analysis.intervals`
   - Matches by `planned_step_id` = "xyz-456"
   - **Match succeeds** → shows actual pace ✅

---

## 🎯 The Actual Fix Applied

**File**: `supabase/functions/auto-attach-planned/index.ts`

**Lines 165 & 329**:
```typescript
// Before (caused 404):
computed: null

// After (forces regeneration):
computed: w.computed 
  ? { ...w.computed, planned_steps_light: null, intervals: [] }
  : null
```

**Why this works**:
- ✅ Preserves `computed` structure (no 404 error)
- ✅ Clears `intervals` array (forces regeneration)
- ✅ Clears `planned_steps_light` (removes stale snapshot)
- ✅ `compute-workout-summary` can now process the workout
- ✅ New intervals get correct `planned_step_id` values
- ✅ Frontend matching works

---

## 🚨 Current System Issues (Design Problems)

### 1. **Duplicate Data** (MAJOR)
- Same interval data stored in TWO places:
  - `workouts.computed.intervals`
  - `workouts.workout_analysis.intervals`
- Changes to one don't automatically update the other
- Source of truth is unclear

### 2. **Tight Coupling**
- `analyze-running-workout` depends on `compute-workout-summary` running first
- No validation that `computed.intervals` exists before using it
- Silent failures if data is missing

### 3. **Complex Matching Logic**
- Frontend tries multiple strategies: by ID, by index, by role+kind
- Multiple fallbacks make debugging hard
- No clear error when matching fails

### 4. **Inconsistent Edge Function Calls**
- `auto-attach-planned` calls:
  - `compute-workout-summary` (via HTTP)
  - `analyze-running-workout` (via HTTP)
- `ingest-activity` calls:
  - `compute-workout-summary` (via HTTP)
  - `analyze-running-workout` (via HTTP)
- Each caller responsible for knowing the correct sequence
- No atomic transaction or guarantee of consistency

---

## 💡 Recommendations

### Short-term (Fix Current Issue)
✅ **DONE**: Clear `computed.intervals` on re-attach to force regeneration

### Medium-term (Reduce Complexity)
1. **Single source of truth**: Remove `workout_analysis.intervals`, only use `computed.intervals`
2. **Embed granular metrics**: Add `granular_metrics` directly to `computed.intervals`
3. **Simplify matching**: Always use `planned_step_id`, remove fallbacks

### Long-term (Architectural)
1. **Database triggers**: Auto-call analysis functions when workout data changes
2. **Computed columns**: Use PostgreSQL generated columns for derived metrics
3. **Event-driven**: Use Supabase Realtime or webhooks instead of manual function calls

---

## 📋 Current Status

**What works**:
- ✅ Normal workout sync from Garmin
- ✅ Initial planned workout attachment
- ✅ Frontend display when data is correct

**What's fixed**:
- ✅ Re-attaching workout to different planned workout

**What's still complex**:
- ⚠️ Duplicate data storage
- ⚠️ Manual edge function orchestration
- ⚠️ Multiple matching strategies
- ⚠️ No atomic transactions

---

## 🔧 How to Test the Fix

1. **Create a workout** (Garmin sync or manual)
2. **Attach to planned workout A**
   - Verify intervals show with pace values
3. **Re-attach to planned workout B**
   - Verify intervals update with correct pace values
   - Check `computed.intervals[0].planned_step_id` matches new planned workout
4. **Check frontend**
   - MobileSummary should show per-interval pace
   - No "—" symbols for executed pace

