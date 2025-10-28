# Deploy Running Analysis Function

## Files Created

1. **`supabase/functions/analyze-workout/index.ts`** - Master orchestrator (ONLY function client calls)
2. **`supabase/functions/analyze-workout/config.toml`** - Function config
3. **`supabase/functions/analyze-running-workout/index.ts`** - Running-specific analyzer
4. **`supabase/functions/analyze-running-workout/config.toml`** - Function config
5. **`supabase/functions/calculate-workout-metrics/index.ts`** - Server-side metrics calculation
6. **`supabase/functions/calculate-workout-metrics/config.toml`** - Function config
7. **`src/services/workoutAnalysisService.ts`** - DUMB CLIENT (just calls master orchestrator)
8. **`src/components/MobileSummary.tsx`** - Updated to use server metrics
9. **`src/hooks/useWorkoutData.ts`** - Updated to use server metrics
10. **`src/components/UnifiedWorkoutView.tsx`** - Updated to use dumb client
11. **`test-running-analysis.mjs`** - Test script

## Deployment Steps

### 1. Deploy the Edge Functions

```bash
# Deploy all functions (master orchestrator + analyzers + metrics)
supabase functions deploy analyze-workout
supabase functions deploy analyze-running-workout
supabase functions deploy calculate-workout-metrics

# Verify deployment
supabase functions list
```

### 2. Test the Function

```bash
# Set environment variables
export SUPABASE_URL="your-project-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run test
node test-running-analysis.mjs
```

### 3. Update Frontend Integration

The service layer is already updated to:
- Run `compute-workout-summary` first (foundation)
- Route running workouts to `analyze-running-workout`
- Format responses with granular adherence data

### 4. Verify Integration

1. **Create a running workout** with a planned workout
2. **Open the workout** in the frontend
3. **Check the Summary tab** - should show granular adherence analysis
4. **Look for new metrics**:
   - Time in prescribed ranges
   - Interval-by-interval adherence
   - Primary issues and strengths
   - Honest execution grades

## Data Flow

```
Raw Sensor Data → compute-workout-summary → workouts.computed
workouts.computed → calculate-workout-metrics → workouts.calculated_metrics
workouts.computed → analyze-running-workout → workouts.workout_analysis

Client → analyze-workout (master orchestrator) → routes to appropriate analyzer
```

## Smart Server, Dumb Client Architecture

### ✅ Server-Side (Smart Server)
- **analyze-workout**: Master orchestrator - routing, orchestration, formatting
- **compute-workout-summary**: Normalizes sensor data, basic metrics
- **calculate-workout-metrics**: All percentage calculations, deltas, comparisons
- **analyze-running-workout**: Granular adherence analysis

### ✅ Client-Side (Dumb Client)
- **workoutAnalysisService**: ONE function call to master orchestrator
- **MobileSummary**: Reads `calculated_metrics.execution_metrics`
- **useWorkoutData**: Reads `calculated_metrics.max_pace_s_per_km`
- **WorkoutAIDisplay**: Shows server-calculated analysis results

### ❌ Removed Client-Side Logic
- No more routing logic in client
- No more orchestration logic in client
- No more `Math.round((plannedPace / executedPace) * 100)`
- No more `(3600 / max_speed_kmh)` calculations
- No more percentage or delta calculations
- No more business logic in client

## Expected Results

### Before (Simple Average)
- Execution Score: 95% (misleading average)
- Grade: A
- Insights: Generic

### After (Granular Analysis)
- Adherence: 76% (honest time-in-range)
- Grade: C
- Issues: "Consistently too fast in work intervals"
- Strengths: "Strong finish - maintained pace through final interval"

## Both Environments Supported

### Context Tab (TodaysWorkoutsTab)
- **Trigger**: Manual "Analyze" button
- **Function**: `analyzeWorkoutWithRetry()` → `analyze-running-workout`
- **Data**: `workout.workout_analysis`
- **Display**: Shows granular adherence analysis

### Summary Tab (UnifiedWorkoutView)
- **Trigger**: Auto-triggers when tab opens
- **Function**: `compute-workout-summary` → `analyze-running-workout`
- **Data**: `workout.workout_analysis` (via WorkoutAIDisplay)
- **Display**: Shows adherence %, execution grade, issues, strengths

Both tabs now use the same granular analysis system!

## Troubleshooting

### Function Not Found
```bash
# Check if function is deployed
supabase functions list | grep analyze-running-workout
```

### No Planned Workout Error
- Ensure the running workout has a `planned_id`
- Check that the planned workout has `intervals` with `pace_range` or `power_range`

### No Sensor Data Error
- Ensure `compute-workout-summary` has run first
- Check that the workout has sensor data in `workouts.computed`

### Test Script Issues
- Verify environment variables are set
- Check that you have running workouts with planned workouts
- Ensure you have the service role key (not anon key)

## Next Steps

1. **Monitor Performance** - Check function logs for any issues
2. **User Feedback** - See how users respond to the new granular analysis
3. **Add Cycling/Swimming** - Use the same pattern for other sports
4. **Refine Grading** - Adjust thresholds based on real usage

## Rollback Plan

If issues arise:
1. **Disable the function** in the service layer
2. **Fall back to general analysis** by updating `getAnalysisFunction()`
3. **Fix issues** and redeploy
4. **Re-enable** when ready

The system is designed to be resilient - basic metrics from `compute-workout-summary` will always be available.
