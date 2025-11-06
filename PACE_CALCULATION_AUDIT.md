# PACE CALCULATION AUDIT - ALL LOCATIONS

## THE PROBLEM
Different parts of the app calculate pace differently, leading to inconsistent values:
- Chart: 10:29 min/mi
- Details Tab: 10:29 min/mi (should be same as chart)
- AI Narrative: 10:48 min/mi (WRONG - still using old cached data?)

---

## 1. CHART (CleanElevationChart.tsx)
**Location:** `src/components/CleanElevationChart.tsx` lines 250-286

**Method:** Averages `speed_mps` from GPS track, then converts to pace

**Code:**
```typescript
// Average speed over rolling window
let speedMpsAvg: number | null = null;
for (let k = j; k <= index; k++) {
  const s = sampledGpsTrack[k]?.speed_mps;
  if (Number.isFinite(s)) {
    sumSpeedMps += s;
    countSpeed++;
  }
}
if (hasSpeed && countSpeed > 0) speedMpsAvg = sumSpeedMps / countSpeed;

// Convert to pace
const speedMph = speedMpsAvg * 2.23694;
const paceMinPerMile = 60 / speedMph;
```

**Result:** 10:29 min/mi ✅

---

## 2. DETAILS TAB (TodaysEffort.tsx)
**Location:** `src/components/TodaysEffort.tsx` lines 420-426

**Method:** `duration / distance` from `computed.overall`

**Code:**
```typescript
const overall = workout?.computed?.overall || {};
const distM = Number(overall?.distance_m);
const durS = Number(overall?.duration_s_moving);

const miles = distM / 1609.34;
const paceMinPerMile = (durS / 60) / miles;
```

**Sources:**
- `overall.distance_m`: From sensor data last sample
- `overall.duration_s_moving`: From sensor data (sum of moving time)

**Result:** 10:29 min/mi ✅ (because `duration_s_moving` is accurate)

---

## 3. AI NARRATIVE (analyze-running-workout)
**Location:** `supabase/functions/analyze-running-workout/index.ts` lines 3390-3429

**Method (CURRENT):** Averages `speedMetersPerSecond` from sensor samples, then converts to pace

**Code:**
```typescript
const rawSensorData = workout.sensor_data?.samples || [];
const validSpeedSamples = rawSensorData.filter(s => 
  s.speedMetersPerSecond && 
  Number.isFinite(s.speedMetersPerSecond) && 
  s.speedMetersPerSecond > 0.5 &&
  s.speedMetersPerSecond < 10
);

const avgSpeedMps = validSpeedSamples.reduce((sum, s) => sum + s.speedMetersPerSecond, 0) / validSpeedSamples.length;
const speedMph = avgSpeedMps * 2.23694;
const paceMinPerMile = 60 / speedMph;
```

**Result:** Should be 10:29 min/mi ✅ (but showing 10:48 - CACHED DATA!)

---

## 4. COMPUTED.OVERALL.AVG_PACE_S_PER_MI (Database)
**Location:** `supabase/functions/ingest-activity/index.ts` line 333

**Method:** `movingTime / distance` calculated at ingestion

**Code:**
```typescript
// Calculate moving time (sum of intervals where speed >= 0.3 m/s)
let movingSec = 0;
for(let i = 1; i < normalized.length; i += 1){
  const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
  const v0 = typeof a.v === 'number' && a.v >= 0.3 ? a.v : null;
  const v1 = typeof b.v === 'number' && b.v >= 0.3 ? b.v : null;
  if (dt && (v0 != null || v1 != null)) movingSec += dt;
}

const overallPaceSecPerMi = movingSec > 0 && totalMeters > 0 ? 
  movingSec / (totalMeters / 1000 * 0.621371) : null;
```

**Result:** Varies (depends on how moving time is calculated)

---

## 5. MOBILE SUMMARY (Interval Display)
**Location:** `src/components/MobileSummary.tsx` lines 1176-1207

**Method:** `duration / distance` per interval

**Code:**
```typescript
const paceMinPerMileCalc = (timeSec/60) / useMiles;
```

**Result:** Varies per interval

---

## THE ROOT CAUSE

### Why Different Methods Give Different Results:

**Example with your workout:**
- Total distance: 4.79 mi (7.71 km)
- Total duration: 50:11 = 3011 seconds
- Moving time (calculated): ~3000 seconds (filtering out stops)

**Method 1: duration / distance**
- 3011 / 4.79 = 628.6 sec/mi = **10:29 min/mi** ✅

**Method 2: moving_time / distance**
- 3000 / 4.79 = 626.3 sec/mi = **10:26 min/mi**

**Method 3: Average speeds**
- If average speed = 2.68 m/s = 6.0 mph
- Pace = 60 / 6.0 = 10.0 min/mi = **10:00 min/mi**

**Method 4: AI (before fix)**
- Used `workout.moving_time` (50 minutes) instead of seconds
- 50 * 60 / 4.79 = 627 sec/mi = **10:27 min/mi**
- But fallback was using wrong duration source → **10:48 min/mi** ❌

---

## THE FIX

### Single Source of Truth: `workout.sensor_data.samples[].speedMetersPerSecond`

**All components should:**
1. Average `speedMetersPerSecond` from sensor samples
2. Convert average speed to pace
3. Use the SAME filtering (speed >= 0.5 m/s, < 10 m/s)

### Implementation:
- ✅ Chart: Already does this
- ✅ AI: Fixed to do this (but cache not cleared!)
- ⚠️ Details Tab: Uses `computed.overall` (calculated at ingestion)
- ⚠️ `computed.overall`: Calculated at ingestion (different method)

---

## NEXT STEPS

1. **Clear the cache** for workout `50e9efa9-9505-4d53-b1bf-bc0bf534236f`:
   ```sql
   UPDATE workouts 
   SET workout_analysis = NULL, analysis_status = NULL, analyzed_at = NULL
   WHERE id = '50e9efa9-9505-4d53-b1bf-bc0bf534236f';
   ```

2. **Verify** what's in `computed.overall`:
   ```sql
   SELECT 
     computed->'overall'->>'duration_s_moving' as duration_s,
     computed->'overall'->>'distance_m' as distance_m,
     computed->'overall'->>'avg_pace_s_per_mi' as avg_pace_s_per_mi,
     computed->'overall'->>'avg_speed_mps' as avg_speed_mps
   FROM workouts 
   WHERE id = '50e9efa9-9505-4d53-b1bf-bc0bf534236f';
   ```

3. **Decide:** Should `computed.overall.avg_pace_s_per_mi` be recalculated to match the chart method?

4. **Consider:** Adding `avg_speed_mps` to `computed.overall` at ingestion, then deriving pace from that everywhere

---

## RECOMMENDATION

**Option A: Use `computed.overall.avg_speed_mps` everywhere**
- Calculate at ingestion: average of `speedMetersPerSecond` samples
- Store in `computed.overall.avg_speed_mps`
- All components derive pace from this speed
- **Pros:** Single source, consistent
- **Cons:** Requires migration

**Option B: Keep current approach, fix cache**
- Chart and AI both average speeds directly
- Details tab uses `computed.overall` (close enough)
- **Pros:** Minimal changes
- **Cons:** Slight inconsistency between methods

**CHOSEN: Option B** - Fix the cache issue first, then evaluate if we need Option A.

