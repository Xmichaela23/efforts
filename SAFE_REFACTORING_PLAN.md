# Safe Refactoring Plan for analyze-running-workout

## 🎯 Goals
1. ✅ **Preserve Summary view** - Exact data structures must remain identical
2. ✅ **Improve daily context** - Better AI narrative and insights
3. ✅ **Enable weekly analysis** - Extract reusable components
4. ✅ **Clean up code** - Reduce from 4,446 lines to manageable modules

## 🔒 Critical Constraints

### Data Structures That MUST NOT Change
```typescript
// Summary view depends on this EXACT structure:
workout.workout_analysis.detailed_analysis.interval_breakdown.intervals[] = [
  {
    interval_id: string,              // ✅ Must match planned_step_id
    interval_type: 'work'|'warmup'|'recovery'|'cooldown',
    actual_pace_min_per_mi: number,   // ✅ Summary reads this
    actual_duration_s: number,         // ✅ Summary reads this
    actual_distance_m: number,         // ✅ Summary reads this
    avg_heart_rate_bpm: number,        // ✅ Summary reads this
    pace_adherence_percent: number,     // ✅ Summary reads this
    // ... other fields
  }
]
```

### Functions That MUST Remain Identical
- `generateIntervalBreakdown()` - Already extracted, working ✅
- Output format of `interval_breakdown.intervals[]` - Must match exactly
- Matching logic in `getDisplayPace()` - Depends on `interval_id` and `interval_type`

---

## 📋 Phase 1: Extract AI Narrative (SAFE - No Data Structure Changes)

**Goal**: Extract the 1,000-line AI narrative function without changing output

**Files to Create**:
```
lib/narrative/
├── ai-generator.ts          # Main function (extract generateAINarrativeInsights)
└── prompt-builders.ts       # Break prompt building into smaller functions
```

**Safety Checks**:
- ✅ Output is still `string[]` (array of insights)
- ✅ Same prompt structure
- ✅ Same OpenAI API call
- ✅ Same error handling

**Test**: Run analysis, verify `narrative_insights` array is identical

---

## 📋 Phase 2: Extract Mile-by-Mile Analysis (SAFE - Isolated Feature)

**Goal**: Extract terrain breakdown for continuous runs

**Files to Create**:
```
lib/analysis/
└── mile-by-mile.ts         # Extract generateMileByMileTerrainBreakdown
```

**Safety Checks**:
- ✅ Output structure unchanged: `{ available, section, splits, ... }`
- ✅ Only used for continuous runs (not interval workouts)
- ✅ Doesn't affect `interval_breakdown`

**Test**: Run continuous run analysis, verify mile breakdown appears

---

## 📋 Phase 3: Extract Detailed Analysis (SAFE - Preserve Structure)

**Goal**: Extract `generateDetailedChartAnalysis` while keeping exact output

**Files to Create**:
```
lib/analysis/
├── detailed-chart.ts        # Main function
├── speed-fluctuations.ts   # Extract analyzeSpeedFluctuations
└── hr-recovery.ts          # Extract analyzeHeartRateRecovery
```

**Safety Checks**:
- ✅ `detailed_analysis.interval_breakdown` structure unchanged
- ✅ `detailed_analysis.speed_fluctuations` structure unchanged
- ✅ `detailed_analysis.heart_rate_recovery` structure unchanged
- ✅ All fields Summary/Context screens read remain identical

**Test**: Verify all detailed analysis fields appear in Context screen

---

## 📋 Phase 4: Extract Pace Range Validation (SAFE - Internal Logic Only)

**Goal**: Consolidate repeated pace range expansion logic

**Files to Create**:
```
lib/
└── pace-range-validator.ts  # Extract range expansion/validation
```

**Safety Checks**:
- ✅ Only affects internal calculations
- ✅ Final `pace_range` values remain identical
- ✅ No changes to output data structures

**Test**: Run analysis, verify pace ranges match previous results

---

## 📋 Phase 5: Extract Execution Scoring (SAFE - Already Modular)

**Goal**: Extract Garmin-style execution scoring

**Files to Create**:
```
lib/
└── execution-scoring.ts     # Extract calculateGarminExecutionScore + helpers
```

**Safety Checks**:
- ✅ `performance.execution_adherence` calculation unchanged
- ✅ `performance.pace_adherence` calculation unchanged
- ✅ `performance.duration_adherence` calculation unchanged

**Test**: Verify execution scores match previous calculations

---

## 📋 Phase 6: Extract Types & Utilities (SAFE - No Logic Changes)

**Goal**: Move type definitions and helper functions

**Files to Create**:
```
lib/
├── types.ts                 # All interfaces/types
└── utils/
    └── pace-calculations.ts # Helper functions (calculateAveragePace, etc.)
```

**Safety Checks**:
- ✅ Type definitions remain identical
- ✅ Helper functions produce same outputs
- ✅ No changes to function signatures

---

## 📋 Phase 7: Extract Interval Matching (CAREFUL - Used by Summary)

**Goal**: Consolidate interval matching/enrichment logic

**Files to Create**:
```
lib/intervals/
└── interval-matcher.ts      # Extract matching logic (lines 589-825)
```

**Safety Checks**:
- ✅ `computedIntervals[]` structure unchanged
- ✅ `planned_step_id` matching logic identical
- ✅ Enrichment with pace ranges produces same results

**Test**: Verify Summary view shows all intervals correctly

---

## 📋 Phase 8: Extract Granular Adherence (CAREFUL - Core Logic)

**Goal**: Extract main adherence calculation functions

**Files to Create**:
```
lib/analysis/
└── granular-adherence.ts    # Extract calculatePrescribedRangeAdherenceGranular
```

**Safety Checks**:
- ✅ `granular_analysis` output structure unchanged
- ✅ `overall_adherence` calculation identical
- ✅ `time_in_range_score` calculation identical

**Test**: Verify adherence percentages match previous results

---

## 🧪 Testing Strategy

### After Each Phase:
1. **Run analysis on test workout**
2. **Verify Summary view** - All intervals display correctly
3. **Verify Context view** - All insights appear
4. **Compare outputs** - JSON structure identical to previous version

### Test Cases:
- ✅ Interval workout (multiple work + recovery intervals)
- ✅ Continuous run (single long effort)
- ✅ Workout with warmup/cooldown
- ✅ Workout without planned workout (unplanned run)

---

## 🚀 Implementation Order (Safest First)

1. **Phase 6** (Types/Utils) - Zero risk, just moving code
2. **Phase 1** (AI Narrative) - Isolated, doesn't affect Summary
3. **Phase 2** (Mile-by-Mile) - Isolated feature
4. **Phase 4** (Pace Range Validator) - Internal logic only
5. **Phase 5** (Execution Scoring) - Already modular
6. **Phase 3** (Detailed Analysis) - Preserve structure carefully
7. **Phase 7** (Interval Matching) - Test Summary view thoroughly
8. **Phase 8** (Granular Adherence) - Core logic, test extensively

---

## 📊 Expected Results

**Current**: 4,445 lines in one file

**Extractable Code** (by phase):
1. **AI Narrative** (Phase 1): ~1,001 lines (3443-4444)
2. **Mile-by-Mile** (Phase 2): ~402 lines (3035-3437)
3. **Detailed Analysis** (Phase 3): ~200 lines (2828-2896 + helpers)
4. **Pace Range Validator** (Phase 4): ~140 lines (repeated logic in 920-1060)
5. **Execution Scoring** (Phase 5): ~289 lines (168-457)
6. **Types** (Phase 6): ~169 lines (47-164, 1605-1656)
7. **Utils** (Phase 6): ~165 lines (2471-2636)
8. **Interval Matching** (Phase 7): ~471 lines (589-1060, includes pace expansion)
9. **Granular Adherence** (Phase 8): ~380 lines (1662-2042)

**Total Extractable**: ~3,217 lines (72% of file)

**After Refactoring**:
- `index.ts`: ~1,228 lines (main handler + orchestration)
- 9 focused modules: 140-1,001 lines each
- **Total reduction**: 4,445 → 1,228 lines in main file (72% reduction)
- **Better organization**: Related code grouped together

### What `index.ts` Will Look Like After Refactoring

```typescript
// ~50 lines: Imports
import { generateIntervalBreakdown } from './lib/intervals/interval-breakdown.ts';
import { calculatePaceRangeAdherence } from './lib/adherence/pace-adherence.ts';
import { generateAINarrativeInsights } from './lib/narrative/ai-generator.ts';
import { generateDetailedChartAnalysis } from './lib/analysis/detailed-chart.ts';
import { calculateGarminExecutionScore } from './lib/execution-scoring.ts';
import { validateAndExpandPaceRanges } from './lib/pace-range-validator.ts';
import { matchIntervalsToPlannedSteps } from './lib/intervals/interval-matcher.ts';
import { calculatePrescribedRangeAdherenceGranular } from './lib/analysis/granular-adherence.ts';
// ... more imports

// ~100 lines: Type definitions (or import from lib/types.ts)
// ... types

// ~1,078 lines: Main handler (Deno.serve)
Deno.serve(async (req) => {
  // CORS handling (~15 lines)
  // Data loading (~200 lines)
  // Interval matching/enrichment (~150 lines) - calls matchIntervalsToPlannedSteps()
  // Pace range validation (~50 lines) - calls validateAndExpandPaceRanges()
  // Granular analysis (~50 lines) - calls calculatePrescribedRangeAdherenceGranular()
  // Execution scoring (~50 lines) - calls calculateGarminExecutionScore()
  // Detailed analysis (~30 lines) - calls generateDetailedChartAnalysis()
  // AI narrative (~30 lines) - calls generateAINarrativeInsights()
  // Database update (~200 lines)
  // Error handling (~50 lines)
  // Response (~50 lines)
});
```

**Result**: Main file becomes a clean orchestrator that calls focused modules

**Benefits**:
- ✅ Easier to test individual components
- ✅ Easier to improve daily/weekly context (AI narrative module)
- ✅ Easier to add weekly analysis features
- ✅ Reduced duplication
- ✅ Clearer separation of concerns

---

## ⚠️ What We WON'T Change

- ❌ Data structure of `interval_breakdown.intervals[]`
- ❌ Field names (e.g., `actual_pace_min_per_mi`, `interval_id`)
- ❌ Calculation logic (only move it, don't change it)
- ❌ Matching logic between planned steps and executed intervals
- ❌ Output format of any analysis results

---

## 🎯 Focus Areas for Daily/Weekly Context

### Daily Context Improvements:
1. **Better AI Narrative** (Phase 1)
   - Extract to module for easier prompt improvements
   - Add plan context awareness
   - Better pattern detection

2. **Enhanced Detailed Analysis** (Phase 3)
   - Extract speed fluctuation analysis
   - Extract HR recovery analysis
   - Make it easier to add new analysis types

### Weekly Analysis Enablement:
1. **Reusable Analysis Components**
   - Pace adherence calculation → reusable
   - HR drift calculation → reusable
   - Execution scoring → reusable

2. **Shared Types**
   - Common interfaces for all analysis functions
   - Consistent data structures across daily/weekly

---

## ✅ Success Criteria

1. ✅ Summary view works identically (all intervals display)
2. ✅ Context view shows all insights
3. ✅ No regression in analysis quality
4. ✅ Code is more maintainable
5. ✅ Easier to add weekly analysis features
6. ✅ Daily context insights are improved

---

## 🔄 Rollback Plan

If any phase breaks functionality:
1. Revert that phase's changes
2. Keep previous phases (they're working)
3. Fix issues before proceeding
4. Test thoroughly before next phase

