# Analyze Running Workout - Actual Usage Analysis

## 🎯 Purpose
This document identifies **what's actually being used** vs **dead code** to prevent breaking changes during refactoring.

---

## ✅ ACTIVE CODE PATHS (What's Actually Used)

### Main Execution Flow

```
Deno.serve() [Line 454]
  ↓
1. Load workout data [Lines 509-530]
  ↓
2. Extract sensor data [Lines 858-908]
   - Uses: extractSensorData() from shared lib [Line 2 import]
   - Tries: time_series_data → garmin_data → computed → sensor_data
  ↓
3. Prepare intervals [Lines 584-1052]
   - 4 strategies tried (but all do similar enrichment)
   - Enriches with executed data, sample_idx_start/end
  ↓
4. Calculate adherence [Line 1065]
   - Calls: calculatePrescribedRangeAdherenceGranular()
  ↓
5. Generate performance scores [Lines 1102-1151]
   - Uses granular analysis results
   - Calculates execution_adherence, pace_adherence, duration_adherence
  ↓
6. Generate detailed analysis [Line 1272]
   - Calls: generateDetailedChartAnalysis()
  ↓
7. Generate AI narrative [Line 1288]
   - Calls: generateAINarrativeInsights()
  ↓
8. Store results [Lines 1341-1362]
   - Updates: workouts.computed.intervals[].granular_metrics
   - Updates: workouts.workout_analysis.*
```

---

## 🔴 DEAD CODE (Safe to Remove)

### 1. `calculateDurationAdherence()` - **NEVER CALLED**
- **Location**: Lines 1801-1935
- **Status**: Marked as "DEPRECATED - use computed data instead"
- **Usage**: ❌ **ZERO references** - function is defined but never invoked
- **Safe to delete**: ✅ **YES** - 134 lines

### 2. `calculateDurationAdherenceFromComputed()` - **NEVER CALLED**
- **Location**: Lines 1732-1795
- **Status**: Comment says "correct approach" but **never actually used**
- **Usage**: ❌ **ZERO references** - function is defined but never invoked
- **Safe to delete**: ✅ **YES** - 63 lines

**Note**: Duration adherence is calculated **inline** in:
- `calculateIntervalPaceAdherence()` lines 2118-2138
- `calculateSteadyStatePaceAdherence()` lines 2499-2521 (and 2341-2359, 2436-2452)

### 3. Commented `extractSensorData()` - **NEVER CALLED**
- **Location**: Lines 1518-1726 (commented out with `/* */`)
- **Status**: Comment says "OLD - Replaced by shared library"
- **Usage**: ❌ **ZERO** - fully commented out, replaced by import on line 2
- **Safe to delete**: ✅ **YES** - 210 lines

---

## ⚠️ DUPLICATE CODE (Safe to Consolidate)

### Duration Adherence Formula - **Duplicated 4 Times**

The exact same formula appears in 4 places:

1. **`calculateIntervalPaceAdherence()`** - Lines 2118-2138
2. **`calculateSteadyStatePaceAdherence()` (freeform)** - Lines 2341-2359
3. **`calculateSteadyStatePaceAdherence()` (no segments)** - Lines 2436-2452
4. **`calculateSteadyStatePaceAdherence()` (main)** - Lines 2499-2521

**Formula**:
```typescript
const ratio = actualDurationSeconds / plannedDurationSeconds;
if (ratio >= 0.9 && ratio <= 1.1) {
  durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
} else if (ratio < 0.9) {
  durationAdherencePct = ratio * 100;
} else {
  durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
}
durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
```

**Safe to extract**: ✅ **YES** - Extract to helper function, replace all 4 occurrences

---

## ✅ ACTIVE FUNCTIONS (Must Keep)

### Core Analysis Functions

1. **`calculatePrescribedRangeAdherenceGranular()`** [Line 1941]
   - ✅ **CALLED**: Line 1065
   - Routes to interval or steady-state analysis
   - **KEEP**

2. **`calculateIntervalPaceAdherence()`** [Line 1987]
   - ✅ **CALLED**: Line 1977 (from calculatePrescribedRangeAdherenceGranular)
   - Calculates pace adherence for interval workouts
   - **KEEP** (but can extract duration adherence)

3. **`calculateSteadyStatePaceAdherence()`** [Line 2290]
   - ✅ **CALLED**: Line 1979 (from calculatePrescribedRangeAdherenceGranular)
   - Calculates pace adherence for steady-state workouts
   - **KEEP** (but can extract duration adherence)

4. **`analyzeIntervalPace()`** [Line 3004]
   - ✅ **CALLED**: Lines 2027, 2177 (from calculateIntervalPaceAdherence)
   - Analyzes single interval's pace adherence
   - **KEEP**

5. **`generateDetailedChartAnalysis()`** [Line 3188]
   - ✅ **CALLED**: Line 1272
   - Generates detailed analysis for Context screen
   - **KEEP** (but can split into smaller functions)

6. **`generateAINarrativeInsights()`** [Line 4305]
   - ✅ **CALLED**: Line 1288
   - Generates AI narrative for Context screen
   - **KEEP** (but can split into smaller functions)

### Helper Functions

7. **`calculateGarminExecutionScore()`** [Line 352]
   - ✅ **CALLED**: Line 1115
   - Calculates penalty-based execution score
   - **KEEP**

8. **`calculateHeartRateDrift()`** [Line 2768]
   - ✅ **CALLED**: Lines 2230, 2332, 3144
   - Calculates HR drift
   - **KEEP**

9. **`generateMileByMileTerrainBreakdown()`** [Line 3897]
   - ✅ **CALLED**: Line 3229 (from generateDetailedChartAnalysis)
   - Generates mile-by-mile breakdown
   - **KEEP** (but can split)

10. **`generateIntervalBreakdown()`** [Line 3391]
    - ✅ **CALLED**: Line 3207 (from generateDetailedChartAnalysis)
    - Generates interval breakdown
    - **KEEP**

11. **`analyzeSpeedFluctuations()`** [Line 3257]
    - ✅ **CALLED**: Line 3196 (from generateDetailedChartAnalysis)
    - **KEEP**

12. **`analyzeHeartRateRecovery()`** [Line 3318]
    - ✅ **CALLED**: Line 3199 (from generateDetailedChartAnalysis)
    - **KEEP**

13. **`analyzePacingConsistency()`** [Line 3794]
    - ✅ **CALLED**: Line 3210 (from generateDetailedChartAnalysis)
    - **KEEP**

14. **`identifyPacePatterns()`** [Line 3841]
    - ✅ **CALLED**: Line 3300 (from analyzeSpeedFluctuations)
    - **KEEP**

### Utility Functions

15. **`inferSegmentType()`** [Line 163]
    - ✅ **CALLED**: Lines 230, 361 (from getPaceToleranceForSegment, calculateGarminExecutionScore)
    - **KEEP**

16. **`getPaceToleranceForSegment()`** [Line 229]
    - ✅ **CALLED**: Lines 925, 941, 947, 981, 994, 3026, 3099
    - **KEEP**

17. **`getDirectionalPenalty()`** [Line 255]
    - ✅ **CALLED**: Line 308 (from calculateSegmentPenalty)
    - **KEEP**

18. **`calculateSegmentPenalty()`** [Line 281]
    - ✅ **CALLED**: Line 372 (from calculateGarminExecutionScore)
    - **KEEP**

19. **`generatePenaltyReason()`** [Line 328]
    - ✅ **CALLED**: Line 321 (from calculateSegmentPenalty)
    - **KEEP**

20. **`calculateAveragePace()`** [Line 2639]
    - ✅ **CALLED**: Line 2426 (from calculateSteadyStatePaceAdherence)
    - **KEEP**

21. **`calculateStandardDeviation()`** [Line 2654]
    - ✅ **CALLED**: Lines 2071, 2338, 2466
    - **KEEP**

22. **`createEmptyAdherence()`** [Line 2611]
    - ✅ **CALLED**: Line 2454 (from calculateSteadyStatePaceAdherence)
    - **KEEP**

---

## 📊 Output Structure (What Must Be Preserved)

### Database Updates

The function writes to **two places**:

1. **`workouts.computed.intervals[].granular_metrics`** [Line 1317]
   ```typescript
   {
     pace_variation_pct: number,
     hr_drift_bpm: number,
     cadence_consistency_pct: number,
     time_in_target_pct: number
   }
   ```

2. **`workouts.workout_analysis`** [Lines 1343-1349]
   ```typescript
   {
     granular_analysis: PrescribedRangeAdherence,
     performance: {
       execution_adherence: number,
       pace_adherence: number,
       duration_adherence: number,
       completed_steps: number,
       total_steps: number
     },
     detailed_analysis: {
       speed_fluctuations: {...},
       heart_rate_recovery: {...},
       interval_breakdown: {...},
       pacing_consistency: {...},
       workout_summary: {...},
       mile_by_mile_terrain: {...}
     },
     narrative_insights: string[],
     mile_by_mile_terrain: {...}
   }
   ```

### Response Structure

Returns [Lines 1412-1426]:
```typescript
{
  success: boolean,
  analysis: PrescribedRangeAdherence,
  intervals: Interval[],
  performance: Performance,
  detailed_analysis: DetailedAnalysis
}
```

---

## 🎯 Safe Refactoring Plan

### Phase 1: Remove Dead Code (ZERO RISK)

1. ✅ **Delete `calculateDurationAdherence()`** [Lines 1801-1935]
   - **Risk**: None - never called
   - **Savings**: 134 lines

2. ✅ **Delete `calculateDurationAdherenceFromComputed()`** [Lines 1732-1795]
   - **Risk**: None - never called
   - **Savings**: 63 lines

3. ✅ **Delete commented `extractSensorData()`** [Lines 1518-1726]
   - **Risk**: None - fully commented out, replaced by import
   - **Savings**: 210 lines

**Total Phase 1**: ~407 lines removed, **ZERO risk**

---

### Phase 2: Extract Duplicate Logic (LOW RISK)

1. ✅ **Extract duration adherence formula**
   - Create: `calculateDurationAdherence(planned: number, actual: number): number`
   - Replace in 4 locations:
     - `calculateIntervalPaceAdherence()` line 2118
     - `calculateSteadyStatePaceAdherence()` lines 2341, 2436, 2499
   - **Risk**: Low - same formula, just extracted
   - **Savings**: ~60 lines (15 lines × 4 locations - 1 function)

2. ✅ **Extract pace formatting**
   - Create utility functions for pace formatting
   - Replace in 3+ locations
   - **Risk**: Low - formatting only
   - **Savings**: ~40 lines

**Total Phase 2**: ~100 lines saved, **LOW risk** (test thoroughly)

---

### Phase 3: Split Large Functions (MEDIUM RISK)

1. ⚠️ **Split `generateAINarrativeInsights()`** [960 lines]
   - Extract: `buildWorkoutContext()`, `buildAIPrompt()`, `fetchPlanContext()`
   - **Risk**: Medium - complex function, test AI output carefully
   - **Savings**: ~200 lines (better organization)

2. ⚠️ **Split `generateMileByMileTerrainBreakdown()`** [402 lines]
   - Extract: `calculateMileSplits()`, `formatMileBreakdownText()`
   - **Risk**: Medium - test mile breakdown output
   - **Savings**: ~100 lines

**Total Phase 3**: ~300 lines saved, **MEDIUM risk** (test output matches)

---

## ✅ Verification Checklist

Before refactoring, verify:

- [ ] `calculateDurationAdherence()` is never called ✅ (verified)
- [ ] `calculateDurationAdherenceFromComputed()` is never called ✅ (verified)
- [ ] Commented `extractSensorData()` is never used ✅ (verified)
- [ ] Duration adherence formula matches in all 4 locations ✅ (verified)
- [ ] Output structure matches expected format ✅ (verified)
- [ ] Database updates preserve required fields ✅ (verified)

---

## 🚨 Critical: What NOT to Touch

### DO NOT MODIFY:

1. **Main handler flow** [Lines 454-1456]
   - Orchestrates entire process
   - Only refactor if splitting into smaller functions

2. **Output structure** [Lines 1341-1353]
   - Frontend depends on exact structure
   - Test Summary + Context screens after changes

3. **Pace adherence calculation** [Lines 1987-2284, 2290-2606]
   - Core business logic
   - Only extract duplicate duration adherence

4. **Interval matching logic** [Lines 601-818]
   - Complex but working
   - Only extract enrichment logic if needed

---

## 📈 Expected Impact

| Phase | Lines Removed | Risk Level | Test Required |
|-------|---------------|------------|---------------|
| Phase 1: Dead Code | 407 | ✅ ZERO | None |
| Phase 2: Extract Duplicates | 100 | ⚠️ LOW | Unit tests |
| Phase 3: Split Functions | 300 | ⚠️ MEDIUM | Integration tests |
| **Total** | **~807** | **Mixed** | **Full test suite** |

---

## 🎯 Recommendation

**Start with Phase 1** - Remove dead code (407 lines, zero risk):
- Immediate cleanup
- No functional changes
- No testing required
- Clear win

Then proceed with Phase 2 and Phase 3 incrementally, testing after each change.




