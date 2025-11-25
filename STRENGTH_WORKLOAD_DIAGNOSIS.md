# Strength Workload Diagnosis Guide

## Current Implementation

Strength workouts now use **volume-based workload calculation** (not duration-based):
- Formula: `workload = volume_factor × intensity² × 100`
- Volume factor = `total_volume / 10000` (normalized)
- Intensity from: Session RPE (primary) → Average RIR → Weight/Reps estimation
- Duration is NOT used (it's just logging time, not workout time)

## Quick Diagnosis

### Step 1: Run Diagnostic Script

```bash
# Set environment variables first
export SUPABASE_URL="your-url"
export SUPABASE_SERVICE_ROLE_KEY="your-key"

# Run diagnostic for Monday 11/24 strength workout
deno run --allow-net --allow-env diagnose-strength-workload.ts 2025-11-24 strength

# Or for a specific workout ID
deno run --allow-net --allow-env diagnose-strength-workload.ts <workout_id>
```

### Step 2: Check Output

The script will show:
1. **Workout Details:**
   - ID, name, type, date, status
   - Duration (minutes)
   - Current `workload_actual` and `intensity_factor`

2. **Strength Exercises Array:**
   - Number of exercises
   - Each exercise: name, sets, reps, weight, duration_seconds
   - Calculated intensity per exercise

3. **Calculated Values:**
   - Session intensity (average of exercise intensities)
   - Calculated workload using formula
   - Comparison with current workload_actual

### Step 3: Identify the Issue

**If `strength_exercises` is empty/null:**
- ❌ **Problem:** Exercises not being passed to `calculate-workload`
- **Check:** `src/components/StrengthLogger.tsx:1788`
- **Fix:** Ensure `completedWorkout.strength_exercises` is populated before calling

**If duration is very low (e.g., < 20 minutes):**
- ❌ **Problem:** Duration calculation is wrong
- **Check:** How duration is calculated in `StrengthLogger.tsx`
- **Fix:** Ensure duration includes all exercise time + rest periods

**If intensity is 0.75 (default):**
- ❌ **Problem:** `getStrengthIntensity()` is returning default
- **Possible causes:**
  - `workout.type !== 'strength'` (type mismatch)
  - `strength_exercises` is empty/null
  - Exercises don't match expected format (weight format, etc.)

**If calculated workload matches current (16):**
- ✅ **Problem identified:** The calculation is working, but inputs are wrong
- **Check:** Duration and intensity values from diagnostic output

## Expected Values

### Typical Strength Workout:
- **Duration:** 45-60 minutes
- **Exercises:** 4-6 exercises, 3-5 sets each
- **Intensity:** 0.80-0.90 (based on weight % 1RM)
- **Workload:** 48-72 points

### Calculation Example (Current Formula):
```
Total Volume: 6,900 lbs (weight × reps × sets)
Volume Factor: 6,900 / 10,000 = 0.69
Intensity: 0.85 (from Session RPE 7 or avg RIR 3)
Workload = 0.69 × 0.85² × 100
         = 0.69 × 0.7225 × 100
         = 49.8 ≈ 50
```

### If Workload is Too Low:
Check:
1. **Total Volume:** Is `strength_exercises` populated? Are sets marked `completed: true`?
2. **Intensity:** Is Session RPE or RIR data present? Check `workout_metadata.session_rpe` and `sets[].rir`
3. **Volume Factor:** Very low volume (< 1,000 lbs) will result in low workload

## Common Issues

### Issue 1: strength_exercises Not Passed
**Symptom:** Diagnostic shows 0 exercises
**Fix:** Check `StrengthLogger.tsx` - ensure exercises are in `completedWorkout` object

### Issue 2: Type Mismatch
**Symptom:** Intensity always 0.75, type check fails
**Fix:** Ensure `workout.type === 'strength'` exactly (case-sensitive)

### Issue 3: Duration Too Low
**Symptom:** Duration < 30 minutes for full workout
**Fix:** Check duration calculation - should include rest periods

### Issue 4: Exercises Format Wrong
**Symptom:** Exercises exist but intensity calculation fails
**Fix:** Check weight format - should be "% 1RM" or "bodyweight"

## Next Steps After Diagnosis

1. **If strength_exercises is empty:**
   - Fix data passing in `StrengthLogger.tsx`
   - Ensure exercises are saved to database before calling `calculate-workload`

2. **If duration is wrong:**
   - Fix duration calculation
   - Consider using actual session time vs planned time

3. **If intensity is wrong:**
   - Check exercise weight format
   - Verify intensity factors match exercise types
   - Add logging to see which exercises are being processed

4. **After fix:**
   - Recalculate workload for affected workouts
   - Use `sweep-user-history` function to recalculate all strength workouts

