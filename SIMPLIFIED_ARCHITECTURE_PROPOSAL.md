# 🏗️ Simplified Architecture Proposal

## 🚨 Current Problems: Data Duplication

### Duplicated Storage

**Same interval data stored in TWO places:**

1. **`workouts.computed.intervals`**
   - Created by: `compute-workout-summary`
   - Contains: planned, executed, adherence_percentage
   - Size: ~5-20 intervals per workout

2. **`workouts.workout_analysis.intervals`**  
   - Created by: `analyze-running-workout`
   - Contains: **EXACT COPY** of #1 + granular_metrics
   - Size: ~5-20 intervals per workout (duplicated)

### The Duplication Cost

```typescript
// CURRENT: Stored twice
workouts.computed.intervals = [
  { planned_step_id: "abc", planned: {...}, executed: {...} },
  { planned_step_id: "def", planned: {...}, executed: {...} },
  ...
];

workouts.workout_analysis.intervals = [
  { planned_step_id: "abc", planned: {...}, executed: {...}, granular_metrics: {...} }, // ← DUPLICATE
  { planned_step_id: "def", planned: {...}, executed: {...}, granular_metrics: {...} }, // ← DUPLICATE
  ...
];
```

**Storage waste**: 2x the data for intervals
**Sync issues**: Changes to one don't update the other
**Confusion**: Which is the source of truth?

---

## ✅ Proposed Simplified Architecture

### Single Source of Truth: `computed.intervals`

**Store everything in ONE place:**

```typescript
workouts.computed.intervals = [
  {
    planned_step_id: "abc-123",
    planned_index: 0,
    kind: "warmup",
    role: "warmup",
    sample_idx_start: 0,
    sample_idx_end: 600,
    
    // Planned data (from planned_workouts)
    planned: {
      duration_s: 600,
      distance_m: 1609,
      target_pace_s_per_mi: 600
    },
    
    // Executed data (from sensor_data)
    executed: {
      duration_s: 606,
      distance_m: 1642,
      avg_pace_s_per_mi: 592,
      avg_hr: 135,
      adherence_percentage: 98
    },
    
    // Granular analysis (added by analyze-running-workout)
    granular_metrics: {
      pace_variation_pct: 3.2,
      hr_drift_bpm: 2.1,
      cadence_consistency_pct: 96.5,
      time_in_target_pct: 98
    }
  }
]
```

### Changes Required

#### 1. Remove `workout_analysis.intervals`

**Before:**
```typescript
workout_analysis: {
  granular_analysis: {...},
  intervals: [...],  // ← DELETE THIS
  performance: {...}
}
```

**After:**
```typescript
workout_analysis: {
  granular_analysis: {...},
  performance: {...}
  // intervals removed - use computed.intervals instead
}
```

#### 2. Update `analyze-running-workout`

**File**: `supabase/functions/analyze-running-workout/index.ts`

**Before (line 603-613):**
```typescript
// Stores a COPY of intervals
await supabase
  .from('workouts')
  .update({
    workout_analysis: {
      ...existingAnalysis,
      granular_analysis: enhancedAnalysis,
      intervals: computedIntervals,  // ← DUPLICATE!
      performance: performance
    }
  })
  .eq('id', workout_id);
```

**After:**
```typescript
// Update computed.intervals IN PLACE (add granular_metrics)
await supabase
  .from('workouts')
  .update({
    computed: {
      ...workout.computed,
      intervals: computedIntervals  // ← Same array with granular_metrics added
    },
    workout_analysis: {
      ...existingAnalysis,
      granular_analysis: enhancedAnalysis,
      // NO intervals here - they're in computed.intervals
      performance: performance
    }
  })
  .eq('id', workout_id);
```

#### 3. Update Frontend

**File**: `src/components/MobileSummary.tsx`

**Before (line 471-475):**
```typescript
// Reads from TWO possible locations
const workoutAnalysisIntervals = workout?.workout_analysis?.intervals;
const completedComputed = workout?.computed;
const computedIntervals = Array.isArray(workoutAnalysisIntervals)
  ? workoutAnalysisIntervals  // ← Prefers duplicate
  : (Array.isArray(completedComputed?.intervals) ? completedComputed.intervals : []);
```

**After:**
```typescript
// Reads from ONE location
const computedIntervals = Array.isArray(workout?.computed?.intervals)
  ? workout.computed.intervals
  : [];
```

---

## 📊 Comparison

### Current Architecture (Complex)

```
compute-workout-summary
  ↓
workouts.computed.intervals (stored)
  ↓
analyze-running-workout (reads computed.intervals)
  ↓
workouts.workout_analysis.intervals (duplicated + enhanced)
  ↓
Frontend (reads workout_analysis.intervals OR computed.intervals)
```

**Problems:**
- ❌ Data stored twice
- ❌ Sync issues if one is updated
- ❌ Frontend has to check two locations
- ❌ Unclear which is canonical

### Proposed Architecture (Simple)

```
compute-workout-summary
  ↓
workouts.computed.intervals (stored - partial data)
  ↓
analyze-running-workout (reads & enhances in-place)
  ↓
workouts.computed.intervals (updated with granular_metrics)
  ↓
Frontend (reads ONLY computed.intervals)
```

**Benefits:**
- ✅ Single source of truth
- ✅ No duplication
- ✅ Updates happen in-place
- ✅ Frontend always knows where to read

---

## 🎯 Implementation Steps

### Step 1: Modify `analyze-running-workout`
```typescript
// Instead of copying intervals to workout_analysis
// Update computed.intervals with granular_metrics

const enhancedIntervals = computedIntervals.map(interval => {
  const granularMetrics = calculateGranularMetrics(interval);
  return {
    ...interval,
    granular_metrics: granularMetrics
  };
});

await supabase
  .from('workouts')
  .update({
    computed: {
      ...workout.computed,
      intervals: enhancedIntervals  // ← Update in place
    },
    workout_analysis: {
      granular_analysis: ...,
      performance: ...
      // No intervals field
    }
  })
  .eq('id', workout_id);
```

### Step 2: Update Frontend
```typescript
// Always read from computed.intervals
const intervals = workout.computed?.intervals || [];

// Granular metrics are now part of each interval
intervals.forEach(interval => {
  const paceVariation = interval.granular_metrics?.pace_variation_pct;
  const hrDrift = interval.granular_metrics?.hr_drift_bpm;
  // ...
});
```

### Step 3: Database Migration (Optional)
```sql
-- Copy any existing workout_analysis.intervals to computed.intervals
-- if they have granular_metrics that computed.intervals doesn't

UPDATE workouts
SET computed = jsonb_set(
  computed,
  '{intervals}',
  workout_analysis->'intervals'
)
WHERE workout_analysis->'intervals' IS NOT NULL
  AND computed->'intervals' IS NOT NULL;

-- Then remove workout_analysis.intervals
UPDATE workouts
SET workout_analysis = workout_analysis - 'intervals'
WHERE workout_analysis->'intervals' IS NOT NULL;
```

---

## 🔄 Migration Path

### Phase 1: Make Frontend Backward Compatible
```typescript
// Support BOTH locations during transition
const intervals = 
  workout.computed?.intervals ||           // ← New location
  workout.workout_analysis?.intervals ||   // ← Old location (fallback)
  [];
```

### Phase 2: Update analyze-running-workout
- Change it to update `computed.intervals` in-place
- Stop writing to `workout_analysis.intervals`

### Phase 3: Backfill Existing Data
- Run migration to copy `workout_analysis.intervals` → `computed.intervals`
- Add `granular_metrics` to any intervals that don't have it

### Phase 4: Clean Up
- Remove fallback from frontend
- Remove `workout_analysis.intervals` references
- Update documentation

---

## 💰 Benefits Summary

### Storage
- **Before**: ~10KB per workout (intervals × 2)
- **After**: ~5KB per workout (intervals × 1)
- **Savings**: 50% reduction

### Code Complexity
- **Before**: 3 locations to check (computed, workout_analysis, fallback)
- **After**: 1 location (computed.intervals)
- **Savings**: 66% reduction in code paths

### Maintenance
- **Before**: Update both places when changing interval structure
- **After**: Update one place
- **Savings**: Less duplication = fewer bugs

### Performance
- **Before**: Frontend tries multiple data sources
- **After**: Direct read from one source
- **Savings**: Faster rendering, less branching

---

## 🤔 Potential Concerns

### Q: What about backward compatibility?

**A**: Use phased migration:
1. Frontend supports both locations
2. Backend writes to new location
3. Backfill old data
4. Remove old location

### Q: What if analyze-running-workout fails?

**A**: Same as now - intervals exist without `granular_metrics`. Frontend can handle missing field.

### Q: What if we want to keep analysis history?

**A**: Store historical snapshots in separate table:
```typescript
workout_analysis_history = [
  { timestamp, granular_analysis, performance }
]
```

But intervals always live in `computed.intervals`.

---

## 🎯 Recommendation

**YES, simplify immediately.**

The duplication is causing:
- ❌ Sync bugs (like the re-attach issue)
- ❌ Confusion about data source
- ❌ Wasted storage
- ❌ Complex frontend code

**The fix is straightforward**:
1. Update `analyze-running-workout` to enhance `computed.intervals` in-place
2. Remove `workout_analysis.intervals` field
3. Update frontend to read one location

**Estimated effort**: 2-3 hours
**Risk**: Low (with backward-compatible frontend)
**Benefit**: Permanent simplification

---

## 📋 Action Plan

1. ✅ Deploy current re-attach fix (already done)
2. 🔄 Test that it works
3. 🏗️ Implement simplified architecture:
   - Update `analyze-running-workout` (30 min)
   - Update frontend to support both locations (30 min)
   - Test thoroughly (1 hour)
   - Backfill data (30 min)
   - Remove old location (30 min)

**Total time**: ~3 hours for permanent simplification
**Payoff**: Cleaner codebase, fewer bugs, better performance

