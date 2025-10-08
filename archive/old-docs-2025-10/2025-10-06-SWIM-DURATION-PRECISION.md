# 2025-10-06 Swim Duration Precision Investigation

## Known Issue

**Swim durations display without seconds (23:00 instead of 23:47)**

### Root Cause
Garmin sends precise seconds (e.g., `timerDurationInSeconds: 1427`), but our `ingest-activity` function converts to minutes for storage:
```typescript
// Lines 494-495 in supabase/functions/ingest-activity/index.ts
moving_time: Math.floor(ms/60)    // 1427 sec → 18 min (loses 7 seconds)
elapsed_time: Math.floor(s/60)    // Converts seconds → minutes
```

**Result:** 
- Database stores: `moving_time: 18` (minutes)
- Display shows: `18:00` (converts back but seconds are gone)
- Garmin actually had: `18:04` (1084 seconds)

## What We Fixed Today (v0.1.6)

### Server: `compute-workout-analysis/index.ts`

**Lines 140-147**: Load samples from `garmin_activities.raw_data.samples` (1430 samples for swims)
```typescript
if (sensor.length < 2) {
  const rawData = parseJson(ga.raw_data) || {};
  const rawSamples = rawData?.samples || [];
  if (Array.isArray(rawSamples) && rawSamples.length > 0) {
    sensor = rawSamples;
  }
}
```

**Lines 547-567**: Extract precise moving time from samples
- Primary: `timeSeries` from last sample's `timerDurationInSeconds`
- Secondary: Sum `swim_data.lengths[].duration_s`
- Fallback: Convert `moving_time` minutes → seconds

**Lines 573-586**: Extract precise elapsed time
- Primary: From `ga.raw_data.summary.durationInSeconds`
- Fallback: Convert `elapsed_time` minutes → seconds

**Lines 320-363**: Normalized Power calculation for cycling (bonus fix)

### Client: Data Flow Updates

**useWorkoutData.ts**: 
- Now reads `computed.overall.duration_s_moving` (seconds)
- Now reads `computed.overall.duration_s_elapsed` (seconds)
- Added `max_pace_s_per_km`, `max_speed_mps` conversions
- Fixed cadence to check `avg_cadence` first

**workoutDataDerivation.ts**:
- `getDurationSeconds`: Prefers computed, falls back to minutes × 60
- `getElapsedSeconds`: Prefers computed elapsed, falls back to max(elapsed, moving)

**CompletedTab.tsx**:
- 4×3 grid for bikes (Distance, Duration, Moving Time, speeds, power, HR, elevation, cadence)
- 4×3 grid for runs (Distance, Duration, Moving Time, paces, HR, elevation, cadence, calories)
- Swim grid working (Distance, Moving Time, Duration, HR, Lengths, Pool, Stroke Rate, Calories)

## Test Plan for Tomorrow's Swim

1. **Swim normally** - Garmin records the workout
2. **Sync to app** - Let it ingest via webhook
3. **Open workout** - App auto-triggers compute v0.1.6
4. **Check display**: 

**Expected Results:**
- Moving Time: Shows **with seconds** (e.g., 18:04, not 18:00)
- Duration: Shows **with seconds** (e.g., 23:47, not 23:00)

**Verify in SQL:**
```sql
SELECT 
  name,
  date,
  moving_time as stored_minutes,
  computed->'overall'->>'duration_s_moving' as computed_seconds,
  computed->'analysis'->>'version' as version
FROM workouts 
WHERE date = '2025-10-07'  -- tomorrow
  AND type = 'swim'
ORDER BY timestamp DESC
LIMIT 1;
```

Should show:
- `stored_minutes`: 18 (database still stores in minutes)
- `computed_seconds`: 1084 or similar (precise seconds)
- `version`: "v0.1.6"

## Why Old Swims Still Show :00

Old swims have `computed.analysis.version: null` (never ran v0.1.6). The compute won't auto-rerun unless:
1. `computed` is manually set to NULL
2. Workout is re-synced from Garmin
3. Manual invoke via Supabase UI

For historical data, the precision was lost at ingest and can only be recovered by extracting from `garmin_activities.raw_data.samples`.

## Files Changed

### Server (needs deployment)
- `/Users/michaelambp/efforts/supabase/functions/compute-workout-analysis/index.ts` (v0.1.6)

### Client (already deployed)
- `/Users/michaelambp/efforts/src/hooks/useWorkoutData.ts`
- `/Users/michaelambp/efforts/src/utils/workoutDataDerivation.ts`
- `/Users/michaelambp/efforts/src/components/CompletedTab.tsx`
- `/Users/michaelambp/efforts/src/components/EffortsViewerMapbox.tsx`
- `/Users/michaelambp/efforts/src/components/HRZoneChart.tsx`

## Other Fixes Completed Today

✅ Elevation/VAM charts working  
✅ Speed formatting (proper m/s → mph conversion)  
✅ Clickable metric pills  
✅ VAM pill added  
✅ Grade pill always shows grade  
✅ Tab buttons restored  
✅ Alt/Gain text darker and bolder  
✅ Metrics spacing tightened  
✅ Run metrics: Avg Pace calculated from speed  
✅ Max Pace calculated from max speed  
✅ Cadence mapping fixed (checks `avg_cadence` first)  
✅ HR Zones: avg/max now display from props  
✅ Normalized Power: calculation ready, stores in `computed.analysis.power`  

## Status

**v0.1.6 is deployed** - waiting for real-world test with tomorrow's swim to confirm the sample extraction works end-to-end.

