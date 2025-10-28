# 🎯 How The System Actually Works (Simplified)

## The Simple Truth

**One place stores intervals: `workouts.computed.intervals`**

Everything else is just analysis summaries.

---

## 📊 Data Storage (After Simplification)

### `workouts.computed.intervals` ← **SINGLE SOURCE OF TRUTH**

```json
[
  {
    "planned_step_id": "abc-123",
    "kind": "warmup",
    "sample_idx_start": 0,
    "sample_idx_end": 600,
    
    "planned": {
      "duration_s": 600,
      "target_pace_s_per_mi": 600
    },
    
    "executed": {
      "duration_s": 606,
      "avg_pace_s_per_mi": 592,
      "avg_hr": 135,
      "adherence_percentage": 98
    },
    
    "granular_metrics": {
      "pace_variation_pct": 3.2,
      "hr_drift_bpm": 2.1,
      "time_in_target_pct": 98
    }
  }
]
```

### `workouts.workout_analysis` ← **SUMMARY ONLY (no intervals)**

```json
{
  "granular_analysis": {
    "overall_adherence": 95,
    "performance_assessment": "Strong execution",
    "primary_issues": ["Started too fast"],
    "strengths": ["Consistent pacing"]
  },
  "performance": {
    "pace_adherence": 88,
    "duration_adherence": 98
  }
}
```

**Key**: `workout_analysis` has NO intervals anymore. Just overall summaries.

---

## ⚙️ How Data Gets Created

### Step 1: `compute-workout-summary` - Basic Slicing

**Input:**
- `sensor_data`: 3000 samples (one per second)
- `planned_id`: Link to planned workout

**What it does:**
```typescript
1. Load planned workout
2. For each planned step:
   - Slice sensor data by time/laps
   - Calculate averages (pace, HR, power, cadence)
   - Calculate adherence % (simple comparison)
   - Assign planned_step_id

3. Store in computed.intervals
```

**Output:**
```json
computed.intervals = [
  {
    "planned_step_id": "abc-123",
    "executed": {
      "avg_pace_s_per_mi": 592,  // ← Average of samples 0-600
      "avg_hr": 135,
      "adherence_percentage": 98
    }
    // No granular_metrics yet
  }
]
```

---

### Step 2: `analyze-running-workout` - Granular Enhancement

**Input:**
- `computed.intervals` (already has executed data)
- `sensor_data` (raw samples)

**What it does:**
```typescript
1. Read computed.intervals (already sliced)
2. For each interval:
   a. Get sample range (sample_idx_start to sample_idx_end)
   b. Slice sensor_data: samples[0:600]
   c. Calculate granular metrics:
      - Loop through each sample
      - Check if pace is in target zone
      - Count: 580 in zone, 20 out of zone
      - time_in_target_pct = 96.7%
   d. Attach granular_metrics to interval

3. Update computed.intervals (same array, now enhanced)
4. Store overall summary in workout_analysis
```

**Output:**
```json
computed.intervals = [
  {
    "planned_step_id": "abc-123",
    "executed": {
      "avg_pace_s_per_mi": 592,
      "avg_hr": 135,
      "adherence_percentage": 98
    },
    "granular_metrics": {          // ← ADDED
      "pace_variation_pct": 3.2,
      "hr_drift_bpm": 2.1,
      "time_in_target_pct": 96.7
    }
  }
]
```

---

### Step 3: Frontend Display

**What it reads:**
```typescript
const intervals = workout.computed.intervals;
const plannedSteps = planned.computed.steps;
```

**How it matches:**
```typescript
for (const plannedStep of plannedSteps) {
  // Find executed interval by ID
  const interval = intervals.find(
    i => i.planned_step_id === plannedStep.id
  );
  
  // Display
  Planned pace: plannedStep.target_pace_s_per_mi     // From planned
  Completed pace: interval.executed.avg_pace_s_per_mi  // From computed
  Adherence: interval.executed.adherence_percentage    // From computed
  Time in zone: interval.granular_metrics.time_in_target_pct  // From analyze
}
```

---

## 🔄 Re-Attach Flow (How Fix Works)

### When user re-attaches workout to different plan:

**Before:**
```
1. User clicks "Attach to Plan-B"
2. computed.intervals still has old IDs from Plan-A
3. Frontend looks for Plan-B IDs
4. Not found → shows "—"
```

**After Fix:**
```
1. User clicks "Attach to Plan-B"
2. auto-attach-planned clears: computed.intervals = []
3. Calls compute-workout-summary:
   - Loads Plan-B structure
   - Re-slices SAME sensor data
   - Assigns NEW IDs from Plan-B
   - Stores in computed.intervals
4. Calls analyze-running-workout:
   - Reads computed.intervals (has new IDs)
   - Adds granular_metrics
   - Updates computed.intervals (same location)
5. Frontend matches Plan-B IDs → FOUND → shows pace ✓
```

---

## 🎯 What Each Piece Does (Simple)

### `compute-workout-summary`
**Job**: Slice sensor data into chunks (intervals)
**Input**: Raw sensor data + planned structure
**Output**: Basic interval averages
**Stores**: `computed.intervals` (without granular metrics)

### `analyze-running-workout`
**Job**: Deep-dive analysis on each interval
**Input**: `computed.intervals` + raw sensor data
**Output**: Granular metrics per interval + overall summary
**Stores**: 
- Enhanced `computed.intervals` (with granular_metrics added)
- Summary in `workout_analysis` (no intervals)

### Frontend (MobileSummary)
**Job**: Display planned vs completed
**Input**: `planned.computed.steps` + `workout.computed.intervals`
**Output**: Table with planned, completed, adherence

---

## 📊 Data Flow Diagram

```
Garmin Sync
    ↓
sensor_data (3000 samples)
    ↓
compute-workout-summary
    ↓
computed.intervals (basic: planned_step_id, executed averages)
    ↓
analyze-running-workout
    ↓
computed.intervals (enhanced: + granular_metrics)
    ↓
Frontend reads computed.intervals
    ↓
Display table
```

**ONE path. ONE storage location. SIMPLE.**

---

## ✅ What We Fixed

### 3 Key Changes:

1. **`auto-attach-planned` (lines 165, 329)**
   - Clears `computed.intervals = []` on re-attach
   - Forces regeneration with new IDs

2. **`analyze-running-workout` (line 606-608)**
   - Writes enhanced intervals BACK to `computed.intervals`
   - No longer duplicates to `workout_analysis.intervals`

3. **`MobileSummary.tsx` (line 473-475)**
   - Reads ONLY from `computed.intervals`
   - No longer checks `workout_analysis.intervals`

---

## 🎯 Result

**Before:**
- ❌ Intervals stored in 2 places
- ❌ Frontend checks 2 locations with fallbacks
- ❌ Re-attach broke because of stale IDs in duplicate
- ❌ Complex, confusing, buggy

**After:**
- ✅ Intervals stored in 1 place (`computed.intervals`)
- ✅ Frontend reads 1 location
- ✅ Re-attach works (clears and regenerates)
- ✅ Simple, clear, working

---

## 📋 Deployment Steps

1. **Deploy `auto-attach-planned`** (re-attach fix)
2. **Deploy `analyze-running-workout`** (writes to computed)
3. **Deploy frontend** (reads from computed)

**Order doesn't matter** because:
- If analyze-running-workout deploys first: Old data still readable
- If frontend deploys first: Backward compatible (checks computed.intervals which exists)
- If auto-attach-planned deploys first: Just fixes re-attach

---

## 🎯 Testing

### Test 1: Normal Sync
1. Complete a run with Garmin
2. Attach to planned workout
3. Open Summary tab
4. **Verify**: Shows planned pace, completed pace, adherence %

### Test 2: Re-Attach
1. Take existing completed workout
2. Click "Unattach"
3. Click "Attach" to different planned workout
4. **Verify**: Intervals update, show correct pace (not "—")

### Test 3: Granular Metrics
1. Open workout with intervals
2. Check that `granular_metrics` exists
3. **Verify**: `pace_variation_pct`, `hr_drift_bpm`, `time_in_target_pct` populated

---

## ❓ Your Questions Answered

### "How will deploying this change things?"

**Immediately after deploy:**
- ✅ Re-attach will work (generates new IDs)
- ✅ Intervals stored in one place (no duplication)
- ✅ Frontend reads from one place (simpler)

### "How are intervals being generated in UI?"

**They're NOT.**

UI just displays what's in `computed.intervals`. That data is generated server-side by `compute-workout-summary`.

### "How is completed data being sliced?"

**By `compute-workout-summary`:**
```typescript
Planned says: "10 minute warmup"
  ↓
Take samples 0-600 (first 10 minutes)
  ↓
Calculate average pace of those 600 samples
  ↓
That's the "completed pace" for warmup interval
```

### "How is it being analyzed?"

**Two passes:**

**Pass 1 (compute-workout-summary):**
- Simple average: Sum all paces / count = 592 s/mi

**Pass 2 (analyze-running-workout):**
- Granular: Check each sample individually
  - Sample 1: 600 (good)
  - Sample 2: 598 (good)
  - Sample 3: 480 (too fast!)
  - ...
- Count: 580 good samples, 20 bad samples
- time_in_target_pct = 96.7%

---

## 💡 Summary

**The system is now simple:**

1. `compute-workout-summary`: Slice sensor data → store basic intervals
2. `analyze-running-workout`: Enhance intervals with granular metrics → update same intervals
3. Frontend: Read intervals → display

**ONE storage location. No duplication. Clean.**

