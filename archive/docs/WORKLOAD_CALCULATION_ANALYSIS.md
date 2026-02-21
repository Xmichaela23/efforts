# Workload Calculation Analysis: Prescribed vs Actual

## Overview

This document analyzes how workload is calculated for **prescribed (planned)** vs **actual (completed)** workouts across all workout types: Running, Cycling, Swimming, and Strength.

## Current Formula

```
workload = duration (hours) × intensity² × 100
```

## 🔴 CRITICAL: Strength Workload Issue (Phase 1a)

### Problem: Strength workouts calculating workload = 16 when should be ~48-60

**Diagnostic Steps:**
1. Run diagnostic script: `deno run --allow-net --allow-env diagnose-strength-workload.ts 2025-11-24 strength`
2. Check:
   - `strength_exercises` array (is it empty/null?)
   - `duration` value (is it correct?)
   - Calculated intensity (should be ~0.80-0.90 for typical strength workout)
   - Current `workload_actual` vs calculated workload

**Potential Root Causes:**

1. **Empty strength_exercises array:**
   - If `strength_exercises` is `[]` or `null`, `getStrengthIntensity()` returns 0.75 (default)
   - With duration = 30 min: `(30/60) × 0.75² × 100 = 0.5 × 0.5625 × 100 = 28.125 ≈ 28`
   - If duration is wrong (e.g., 10 min): `(10/60) × 0.75² × 100 = 0.167 × 0.5625 × 100 = 9.4 ≈ 9`
   - **This could explain workload = 16!**

2. **strength_exercises not being passed correctly:**
   - Check `StrengthLogger.tsx:1788` - is `completedWorkout.strength_exercises` populated?
   - Check if it's being serialized correctly (JSON string vs array)

3. **Duration issue:**
   - If duration is very low (e.g., 5-10 minutes), workload will be low
   - Check if duration is being calculated correctly for strength workouts

4. **Type mismatch:**
   - Check if `workout.type === 'strength'` exactly (case-sensitive?)
   - If type is something else, it won't use strength intensity calculation

**Expected Calculation for Typical Strength Workout:**
- Duration: 45-60 minutes
- Intensity: 0.80-0.90 (based on exercises)
- Workload: `(45/60) × 0.85² × 100 = 0.75 × 0.7225 × 100 = 54.2 ≈ 54`
- Or: `(60/60) × 0.85² × 100 = 1.0 × 0.7225 × 100 = 72.25 ≈ 72`

**Fix Priority:** 🔴 **CRITICAL - Fix First**

## Issues Identified

### 1. **Duration Calculation Problems**

#### For Running/Cycling/Swimming:

**Planned Workouts:**
- ✅ Uses `duration` field (minutes) from `planned_workouts` table
- ✅ This is the intended/planned duration

**Completed Workouts:**
- ❌ Uses `duration` field (minutes) from `workouts` table
- ❌ `duration` = **elapsed time** (includes stops, breaks, pauses)
- ❌ Should use `moving_time` instead (actual moving time)
- ❌ `moving_time` exists in database but **not passed** to `calculate-workload` function

**Impact:**
- Workload for completed runs/rides/swims is **overestimated** because it includes stopped time
- Example: 60-minute run with 10 minutes of stops → calculates as 60 min, should be 50 min
- This makes actual workload appear higher than prescribed workload incorrectly

#### For Strength:

**Planned & Completed:**
- ✅ Uses `duration` field correctly (total session time)
- ✅ Strength workouts don't have moving_time concept

---

### 2. **Intensity Calculation Problems**

#### A. Freeform Workouts (No steps_preset)

**Planned Workouts:**
- ❌ Defaults to **0.75 intensity** for all freeform workouts
- ❌ Doesn't account for workout description or type-specific defaults
- ❌ Example: Easy run vs tempo run both get 0.75

**Completed Workouts:**
- ❌ Defaults to **0.75 intensity** for all freeform workouts
- ❌ **Doesn't use actual performance data** (pace, HR, power) to infer intensity
- ❌ Example: Easy run at 8:00/mi pace vs tempo run at 6:00/mi pace both get 0.75

**Impact:**
- Freeform workouts are all scored the same regardless of actual effort
- Can't compare prescribed vs actual intensity for unstructured workouts

#### B. Workouts with steps_preset

**Planned Workouts:**
- ⚠️ Uses `Math.max(...intensities)` - picks **highest intensity token**
- ⚠️ Example: `['warmup_run_easy', '5kpace_4x1mi_R2min', 'cooldown_easy']` → uses 0.95 (5k pace)
- ⚠️ Doesn't account for **time-weighted average** (warmup/cooldown are longer but lower intensity)

**Completed Workouts:**
- ⚠️ Same issue - uses max intensity from steps_preset
- ⚠️ Doesn't account for **actual execution** (did they run faster/slower than prescribed?)

**Impact:**
- Mixed workouts (warmup + intervals + cooldown) are **overestimated**
- Doesn't reflect actual execution quality

---

### 3. **Missing Data in Workload Calculation**

**Current `workout_data` interface:**
```typescript
interface WorkoutData {
  type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  duration: number; // minutes
  steps_preset?: string[];
  strength_exercises?: Array<...>;
  mobility_exercises?: Array<...>;
}
```

**Missing for Running/Cycling/Swimming:**
- ❌ `moving_time` (minutes) - actual moving duration
- ❌ `avg_pace` (seconds/mile or seconds/km) - actual pace
- ❌ `avg_heart_rate` (bpm) - actual HR
- ❌ `avg_power` (watts) - actual power (cycling)
- ❌ `computed.overall.duration_s_moving` - computed moving time

**Impact:**
- Can't use moving time for accurate duration
- Can't infer intensity from actual performance metrics

---

### 4. **Workout Type-Specific Issues**

#### Running

**Planned:**
- ✅ Can use `steps_preset` tokens to infer intensity
- ⚠️ Freeform runs default to 0.75 (should infer from description or use 0.65-0.70 for easy)

**Completed:**
- ❌ Uses elapsed `duration` instead of `moving_time`
- ❌ Freeform runs default to 0.75 (should infer from actual pace)
- ❌ Doesn't use actual pace to adjust intensity
  - Easy pace (8:00/mi) → should be ~0.65
  - Tempo pace (6:30/mi) → should be ~0.88
  - Interval pace (5:30/mi) → should be ~0.95

#### Cycling

**Planned:**
- ✅ Can use `steps_preset` tokens (Z1, Z2, tempo, etc.)
- ⚠️ Freeform rides default to 0.75 (should use 0.70 for endurance)

**Completed:**
- ❌ Uses elapsed `duration` instead of `moving_time`
- ❌ Freeform rides default to 0.75 (should infer from power/HR zones)
- ❌ Doesn't use actual power to infer intensity
  - Z1 (recovery) → should be ~0.55
  - Z2 (endurance) → should be ~0.70
  - Threshold → should be ~1.00
  - VO2 → should be ~1.15

#### Swimming

**Planned:**
- ✅ Can use `steps_preset` tokens
- ⚠️ Freeform swims default to 0.75 (should use 0.65-0.80 range)

**Completed:**
- ❌ Uses elapsed `duration` instead of `moving_time`
- ❌ Freeform swims default to 0.75
- ❌ Doesn't use actual pace/HR to infer intensity

#### Strength

**Planned:**
- ✅ Uses `strength_exercises` array to calculate intensity
- ✅ Accounts for weight percentage (% 1RM)
- ✅ Accounts for reps (adjusts intensity)

**Completed:**
- ✅ Uses `strength_exercises` array (same as planned)
- ⚠️ Doesn't account for **actual weight lifted** vs planned weight
- ⚠️ Doesn't account for **actual reps** vs planned reps
- ⚠️ Doesn't account for **rest periods** (longer rest = lower intensity)

---

### 5. **Comparison Issues**

**Current State:**
- `workload_planned` = calculated from planned workout data
- `workload_actual` = calculated from completed workout data
- **But they use different data sources and assumptions!**

**Problems:**
1. **Duration mismatch:**
   - Planned: Uses planned duration
   - Actual: Uses elapsed duration (includes stops)
   - **Should both use moving time for fair comparison**

2. **Intensity mismatch:**
   - Planned: Uses max intensity from steps_preset
   - Actual: Uses max intensity from steps_preset (same)
   - **But actual execution might be different!**
   - Example: Planned 5k pace intervals, but ran at tempo pace → should reflect lower intensity

3. **No execution quality adjustment:**
   - If workout was executed poorly (too fast/slow), workload should reflect that
   - Currently, workload_actual = workload_planned if steps_preset matches

---

## Recommended Fixes

### 1. **Fix Duration for Running/Cycling/Swimming**

**For Completed Workouts:**
- Prefer `moving_time` over `duration` when available
- Fallback to `duration` if `moving_time` is null
- Pass `moving_time` to `calculate-workload` function

**Code Changes:**
```typescript
// In calculate-workload/index.ts
interface WorkoutData {
  type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  duration: number; // minutes (elapsed)
  moving_time?: number; // minutes (moving time - prefer for run/bike/swim)
  // ... rest of fields
}

function calculateWorkload(workout: WorkoutData): number {
  // For run/bike/swim, prefer moving_time over duration
  let effectiveDuration = workout.duration;
  if ((workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim') 
      && workout.moving_time && workout.moving_time > 0) {
    effectiveDuration = workout.moving_time;
  }
  
  const durationHours = effectiveDuration / 60;
  const intensity = getSessionIntensity(workout);
  
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}
```

### 2. **Infer Intensity from Actual Performance**

**For Completed Workouts without steps_preset:**

**Running:**
- Use actual pace to infer intensity
- Easy pace (slower than 5k+1:00) → 0.65-0.70
- Tempo pace (between easy and 5k) → 0.85-0.90
- 5k pace or faster → 0.95-1.10

**Cycling:**
- Use actual power (if available) vs FTP to infer zone
- Use HR zones (if power unavailable)
- Z1 → 0.55, Z2 → 0.70, Threshold → 1.00, VO2 → 1.15

**Swimming:**
- Use actual pace vs threshold pace
- Easy → 0.65, Threshold → 0.95, Interval → 1.00

**Code Changes:**
```typescript
function getSessionIntensity(workout: WorkoutData, isCompleted: boolean = false): number {
  // ... existing strength/mobility/steps_preset logic ...
  
  // For completed workouts without steps_preset, infer from performance
  if (isCompleted && !workout.steps_preset) {
    if (workout.type === 'run' && workout.avg_pace) {
      return inferRunningIntensityFromPace(workout.avg_pace);
    }
    if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_power) {
      return inferCyclingIntensityFromPower(workout.avg_power, workout.functional_threshold_power);
    }
    // ... etc
  }
  
  // Default fallback
  return getDefaultIntensityForType(workout.type);
}
```

### 3. **Use Time-Weighted Average for Mixed Workouts**

**For Workouts with steps_preset:**
- Calculate intensity as time-weighted average, not max
- Requires duration for each step (from `computed.steps`)

**Code Changes:**
```typescript
function getStepsIntensity(steps: string[], type: string, stepDurations?: number[]): number {
  const factors = INTENSITY_FACTORS[type as keyof typeof INTENSITY_FACTORS];
  if (!factors) return 0.75;
  
  const intensities: number[] = [];
  const durations: number[] = stepDurations || [];
  
  steps.forEach((token, idx) => {
    for (const [key, value] of Object.entries(factors)) {
      if (token.toLowerCase().includes(key.toLowerCase())) {
        intensities.push(value);
        break;
      }
    }
  });
  
  // If we have durations, use time-weighted average
  if (durations.length === intensities.length && durations.length > 0) {
    let totalWeightedIntensity = 0;
    let totalDuration = 0;
    intensities.forEach((intensity, idx) => {
      const duration = durations[idx] || 0;
      totalWeightedIntensity += intensity * duration;
      totalDuration += duration;
    });
    return totalDuration > 0 ? totalWeightedIntensity / totalDuration : 0.75;
  }
  
  // Fallback to max if no durations
  return intensities.length > 0 ? Math.max(...intensities) : 0.75;
}
```

### 4. **Account for Execution Quality**

**For Completed Workouts with steps_preset:**
- Compare actual execution to planned execution
- Adjust intensity based on adherence
- Example: Ran intervals 10% faster than planned → increase intensity slightly

**This requires:**
- Access to planned workout data
- Access to execution analysis (from `analyze-running-workout`)
- More complex calculation

---

## Summary of Critical Issues

1. 🔴 **CRITICAL - Strength:** Workload calculating as 16 instead of ~48-60 (likely empty strength_exercises or wrong duration)
2. ✅ **Duration:** Completed workouts use elapsed time, should use moving time
3. ✅ **Intensity:** Freeform workouts default to 0.75, should infer from performance
4. ✅ **Intensity:** Mixed workouts use max, should use time-weighted average
5. ⚠️ **Execution:** Doesn't account for actual execution quality vs planned

## Implementation Order (Revised)

### Phase 1a: Fix Strength Workload Calculation 🔴 **DO THIS FIRST**

**Diagnostic Steps:**
1. Run: `deno run --allow-net --allow-env diagnose-strength-workload.ts 2025-11-24 strength`
2. Check output for:
   - `strength_exercises` array (empty? null? malformed?)
   - `duration` value (too low? missing?)
   - Calculated intensity vs expected intensity
   - Current `workload_actual` vs calculated workload

**Potential Fixes:**
- If `strength_exercises` is empty/null: Fix data passing from `StrengthLogger.tsx`
- If duration is wrong: Fix duration calculation for strength workouts
- If type check fails: Ensure `workout.type === 'strength'` exactly
- Add fallback: If no exercises, use default intensity based on duration (longer = higher intensity)

**Files to Check:**
- `src/components/StrengthLogger.tsx:1788` - How `strength_exercises` is passed
- `supabase/functions/calculate-workload/index.ts:148-179` - Strength intensity calculation
- Database: Check actual `strength_exercises` JSON in workouts table

### Phase 1b: Fix Moving Time for Run/Bike/Swim

**Changes Needed:**
1. Update `WorkoutData` interface to include `moving_time?: number`
2. Update `calculateWorkload()` to prefer `moving_time` for run/bike/swim
3. Update all callers to pass `moving_time`:
   - `src/components/AppLayout.tsx:467-477`
   - `src/components/StrengthLogger.tsx:1781-1792`
   - `src/hooks/usePlannedWorkouts.ts:239-251`
   - `supabase/functions/activate-plan/index.ts:383-395`

### Phase 2: Intensity Inference for Freeform Workouts

**Changes Needed:**
1. Add performance-based intensity inference for completed workouts
2. Use pace (running), power (cycling), HR zones to infer intensity
3. Update `getSessionIntensity()` to accept additional performance metrics

### Phase 3+: Advanced Features

- Time-weighted average intensity for mixed workouts
- Execution quality adjustments
- Planned vs actual workload comparison UI

## Priority Fixes

**🔴 Critical (Do First):**
1. **Fix strength workload calculation** - Diagnose why workload = 16 instead of ~48-60

**High Priority:**
2. Use `moving_time` for completed run/bike/swim workouts
3. Pass `moving_time` to `calculate-workload` function
4. Infer intensity from actual pace/power/HR for freeform workouts

**Medium Priority:**
5. Use time-weighted average intensity for mixed workouts
6. Add better default intensities per workout type

**Low Priority:**
7. Account for execution quality adjustments
8. Compare planned vs actual workload in UI

