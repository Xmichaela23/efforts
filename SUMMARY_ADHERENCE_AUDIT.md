# 🔍 Summary Screen Adherence Audit

## Problem Statement

The Summary screen shows **0% Duration** and **0% Pace** adherence despite the workout having execution data. All calculations should happen server-side, but the values are not being calculated or stored correctly.

---

## Data Flow Analysis

### Expected Flow
```
1. Workout sync → sensor_data stored
2. compute-workout-summary → creates computed.intervals
3. analyze-running-workout → calculates adherence scores
4. Stores in workout_analysis.performance:
   - execution_adherence
   - pace_adherence  
   - duration_adherence
5. Frontend reads from workout_analysis.performance
```

### Current Implementation

#### Server-Side: `analyze-running-workout/index.ts`

**Location**: `supabase/functions/analyze-running-workout/index.ts`

**Key Function**: `calculateGarminExecutionScore()` (lines 291-391)

**Duration Adherence Calculation** (lines 323-338):
```typescript
const withDuration = segments.filter((i: any) => 
  i.executed && i.planned && i.planned.duration_s
);

let durationAdherence = 100;
if (withDuration.length > 0) {
  const plannedTotal = withDuration.reduce((sum: number, i: any) => 
    sum + i.planned.duration_s, 0
  );
  const actualTotal = withDuration.reduce((sum: number, i: any) => 
    sum + i.executed.duration_s, 0
  );
  
  durationAdherence = Math.round(Math.min(100, (actualTotal / plannedTotal) * 100));
}
```

**Issues Identified**:

1. **Data Structure Mismatch**: 
   - Function expects segments with `i.planned.duration_s` and `i.executed.duration_s`
   - `computedIntervals` from `workout.computed.intervals` should have this structure, but the filter might be failing
   - If `withDuration.length === 0`, `durationAdherence` defaults to 100 (not 0), so 0% suggests the value isn't being set at all

2. **Duration Calculation Logic Flaw**:
   - Current: `Math.min(100, (actualTotal / plannedTotal) * 100)`
   - Problem: If you run LONGER than planned (e.g., 200% of time), it caps at 100%
   - Problem: If you run SHORTER than planned (e.g., 50% of time), it shows 50%
   - **This is backwards** - longer should be penalized, not rewarded

3. **Pace Adherence Calculation** (lines 949-950):
   ```typescript
   performance.pace_adherence = paceScore;
   ```
   - `paceScore` comes from `executionAnalysis.pace_execution` (line 909)
   - `pace_execution` is set to `executionScore` (line 383), which is penalty-based
   - If penalties are too high, `paceScore` could be 0 or negative (capped at 0)
   - Granular penalties are applied (lines 911-947), which can reduce pace score further

4. **Missing Granular Analysis Integration**:
   - `calculatePrescribedRangeAdherenceGranular()` is called (line 856) and returns detailed analysis
   - This analysis includes `duration_adherence` object (line 1803-1808 in `calculateIntervalPaceAdherence`)
   - **BUT**: This granular duration adherence is NOT used in the final performance calculation
   - The granular analysis has proper time-in-range calculations but they're ignored

#### Frontend: `MobileSummary.tsx`

**Location**: `src/components/MobileSummary.tsx` (lines 1444-1459)

**Reading Adherence Values**:
```typescript
const performance = (completed as any)?.workout_analysis?.performance;
const executionAdherence = performance?.execution_adherence;
const paceAdherence = performance?.pace_adherence;
const durationAdherence = performance?.duration_adherence;

const finalPacePct = Number.isFinite(paceAdherence) ? Math.round(paceAdherence) : 0;
const finalDurationPct = Number.isFinite(durationAdherence) ? Math.round(durationAdherence) : 0;
```

**Issues**:
- Frontend correctly reads from `workout_analysis.performance`
- If values are `undefined`, `null`, or `NaN`, they default to 0
- No fallback to granular analysis data

---

## Root Causes

### 1. **Duration Adherence Not Calculated Properly**

**Problem**: `calculateGarminExecutionScore` filters segments incorrectly or receives wrong data structure.

**Evidence**:
- Line 324-326: Filter requires `i.planned.duration_s` to exist
- If `computedIntervals` structure doesn't match, filter returns empty array
- Empty array → `durationAdherence` stays at 100 (default), but 0% suggests it's being overwritten elsewhere or not stored

**Possible Causes**:
- `computedIntervals` might not have `planned` nested object
- `planned.duration_s` might be missing or null
- Segments might be filtered out before reaching this function

### 2. **Pace Adherence Over-Penalized**

**Problem**: Granular penalties (lines 911-947) can drive pace score to 0.

**Evidence**:
- Base pace score from segment penalties
- Additional penalties for CV > 5%, surges, crashes
- Multiple penalties can compound to reduce score significantly
- If base score is already low, granular penalties push it to 0

**Example**:
- Base pace execution: 60%
- CV penalty (7% CV): -10%
- Surges penalty (6 surges): -5%
- Crashes penalty (6 crashes): -5%
- **Final pace score: 40%** (or 0% if penalties exceed base)

### 3. **Granular Analysis Not Used**

**Problem**: `calculatePrescribedRangeAdherenceGranular()` calculates proper time-in-range adherence but results are ignored.

**Evidence**:
- Line 856: Granular analysis is calculated
- Line 1803-1808: Granular analysis includes `duration_adherence` object with proper calculation
- Line 953: Performance uses `executionAnalysis.duration_adherence` instead of granular analysis
- **Granular analysis has true time-in-range calculations but they're discarded**

### 4. **Data Structure Inconsistency**

**Problem**: Multiple data sources and structures make it unclear which one is authoritative.

**Evidence**:
- `workout.computed.intervals` - created by `compute-workout-summary`
- `intervalsToAnalyze` - used for granular analysis (line 851)
- `computedIntervals` - used for execution scoring (line 906)
- These might have different structures or be out of sync

---

## Required Fixes

### 1. **Fix Duration Adherence Calculation**

**Current Logic** (WRONG):
```typescript
durationAdherence = Math.round(Math.min(100, (actualTotal / plannedTotal) * 100));
```

**Correct Logic** (should be):
```typescript
// For duration, being close to planned is good (both over and under should be penalized)
const ratio = actualTotal / plannedTotal;
if (ratio >= 0.9 && ratio <= 1.1) {
  // Within 10% tolerance - high score
  durationAdherence = 100 - Math.abs(ratio - 1) * 100;
} else if (ratio < 0.9) {
  // Too short - penalize
  durationAdherence = ratio * 100;
} else {
  // Too long - penalize (currently rewards this!)
  durationAdherence = (plannedTotal / actualTotal) * 100;
}
```

**OR use granular analysis duration_adherence** which already has proper calculation.

### 2. **Use Granular Analysis for True Adherence**

**Current**: Ignores granular analysis duration_adherence

**Fix**: Use granular analysis results:
```typescript
// From granular analysis (line 1803-1808)
const granularDurationAdherence = enhancedAnalysis.duration_adherence?.adherence_percentage;

// Use granular if available, fallback to execution analysis
performance.duration_adherence = granularDurationAdherence ?? executionAnalysis.duration_adherence;
```

### 3. **Fix Pace Adherence to Use Time-in-Range**

**Current**: Uses penalty-based scoring which can be too harsh

**Fix**: Use granular analysis time-in-range score:
```typescript
// From granular analysis (line 1783)
const granularPaceAdherence = enhancedAnalysis.overall_adherence * 100; // Convert to percentage

// Use granular time-in-range score
performance.pace_adherence = granularPaceAdherence ?? paceScore;
```

### 4. **Add Debugging/Validation**

**Add logging** to verify data structures:
```typescript
console.log('🔍 [DURATION DEBUG] Segments structure:', segments.map(s => ({
  hasExecuted: !!s.executed,
  hasPlanned: !!s.planned,
  plannedDuration: s.planned?.duration_s,
  executedDuration: s.executed?.duration_s
})));

console.log('🔍 [DURATION DEBUG] Filtered segments:', withDuration.length);
console.log('🔍 [DURATION DEBUG] Planned total:', plannedTotal, 'Actual total:', actualTotal);
console.log('🔍 [DURATION DEBUG] Final duration adherence:', durationAdherence);
```

### 5. **Ensure Data Structure Consistency**

**Verify** that `computedIntervals` passed to `calculateGarminExecutionScore` has:
- `planned.duration_s` (not `planned.duration` or `duration_s` at top level)
- `executed.duration_s` (not `executed.duration` or `duration_s` at top level)

**Add validation**:
```typescript
// Normalize structure before calculation
const normalizedSegments = segments.map(segment => ({
  ...segment,
  planned: segment.planned || { duration_s: segment.duration_s },
  executed: segment.executed || { duration_s: segment.executed?.duration_s || segment.duration_s }
}));
```

---

## True Granular Analysis Requirements

### What "True Granular Analysis" Means

1. **Time-in-Range Calculation**: For each interval, calculate what percentage of time was spent within the prescribed pace range
2. **Sample-by-Sample Analysis**: Use actual sensor data samples, not just averages
3. **Duration Adherence**: Compare actual duration to planned duration with proper penalty for both over and under
4. **Pace Consistency**: Measure coefficient of variation, surges, crashes
5. **Interval-by-Interval Breakdown**: Each interval gets its own adherence score

### Current State

✅ **Granular analysis IS calculated** (`calculatePrescribedRangeAdherenceGranular`)
✅ **Time-in-range IS calculated** (uses sample-by-sample analysis)
✅ **Duration adherence IS calculated** (in granular analysis)
❌ **Results are NOT used** (ignored in favor of penalty-based scoring)
❌ **Frontend doesn't have access** to granular interval breakdowns

### What Needs to Happen

1. **Use granular analysis results** for pace and duration adherence
2. **Store granular analysis** in `workout_analysis.granular_analysis` (already done)
3. **Expose interval breakdown** to frontend for detailed view
4. **Fix duration calculation** to properly penalize both over and under
5. **Ensure all calculations happen server-side** (they do, but results aren't used)

---

## Database Storage Verification

**Location**: Lines 1044-1064 in `analyze-running-workout/index.ts`

**Storage Confirmed**:
```typescript
const updatePayload = {
  computed: minimalComputed,
  workout_analysis: {
    granular_analysis: enhancedAnalysis,
    performance: performance,  // ✅ Stored correctly
    detailed_analysis: detailedAnalysis,
    narrative_insights: narrativeInsights
  },
  analysis_status: 'complete',
  analyzed_at: new Date().toISOString()
};
```

**Conclusion**: Performance object IS being stored correctly. The issue is in the **calculation**, not storage.

---

## Summary

**Main Issues**:
1. **Duration adherence calculation has flawed logic** (rewards going over, doesn't properly penalize)
   - Current: `Math.min(100, (actualTotal / plannedTotal) * 100)` caps at 100% for going over
   - Should penalize both over and under equally
   
2. **Granular analysis calculates proper adherence but results are ignored**
   - `calculatePrescribedRangeAdherenceGranular()` does true time-in-range analysis
   - Returns `duration_adherence` object with proper calculation (line 1803-1808)
   - But `performance.duration_adherence` uses `executionAnalysis.duration_adherence` instead (line 953)
   
3. **Pace adherence uses penalty system that can be too harsh** (drives to 0%)
   - Base pace score from segment penalties
   - Additional granular penalties (CV, surges, crashes) can compound
   - Granular analysis has proper time-in-range score but it's ignored
   
4. **Data structure mismatches might cause filter failures**
   - `calculateGarminExecutionScore` filters for `i.planned.duration_s`
   - If structure doesn't match, filter returns empty array
   - Empty array → durationAdherence stays at 100 (default), but 0% suggests it's being overwritten
   
5. **No validation/logging to debug why values are 0%**
   - Console logs exist but don't validate data structures
   - No logging of filter results or intermediate calculations

**Root Cause**: 
The system calculates **two different adherence scores**:
1. **Penalty-based** (`calculateGarminExecutionScore`) - used for final performance
2. **Granular time-in-range** (`calculatePrescribedRangeAdherenceGranular`) - calculated but ignored

The penalty-based system can produce 0% scores, while the granular system would produce accurate scores.

**Solution**:
1. **Use granular analysis results** instead of penalty-based scoring for pace and duration
2. **Fix duration adherence calculation logic** to properly penalize both over and under
3. **Add validation and logging** to debug data structure issues
4. **Ensure data structure consistency** between computed intervals and execution analysis
5. **Expose granular analysis to frontend** for true interval-by-interval breakdown
6. **Consider hybrid approach**: Use granular for adherence, penalties for execution score

