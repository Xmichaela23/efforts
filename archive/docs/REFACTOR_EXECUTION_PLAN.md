# Refactoring Execution Plan: analyze-running-workout

## Current State
- **5,703 lines** in one file
- **~29 functions** mixed together
- **Multiple responsibilities** in single handler
- **Fragile data flow** causing repeated bugs

## Strategy: Extract to Modules (Keep Main Handler Simple)

### Phase 1: Extract Pure Calculation Functions (No Dependencies)

**Goal**: Extract functions that take inputs and return outputs (no DB, no side effects)

**Files to Create**:
1. `lib/adherence/pace-adherence.ts` (~200 lines)
   - `calculatePaceRangeAdherence()`
   - `calculateIntervalAveragePaceAdherence()`
   - `calculatePaceRangeAdherence()` (with tolerance)

2. `lib/adherence/duration-adherence.ts` (~150 lines)
   - `calculateDurationAdherence()`
   - Duration penalty calculations

3. `lib/adherence/execution-score.ts` (~100 lines)
   - `calculateExecutionScore()` - weighted average
   - Segment weight calculations

**Test**: Import and test each function independently

---

### Phase 2: Extract Interval Processing

**Files to Create**:
4. `lib/intervals/interval-breakdown.ts` (~400 lines)
   - `generateIntervalBreakdown()` - main function
   - Takes: workIntervals, allIntervals, sensorData, plannedWorkout
   - Returns: `{ available, intervals[], section, summary }`
   - **Key**: Generate intervals in planned workout order

5. `lib/intervals/interval-data.ts` (~200 lines)
   - `calculateIntervalHeartRate()`
   - `calculateIntervalElevation()`
   - `calculateIntervalMetrics()` - combines HR + elevation

**Test**: Generate breakdown for known workout, verify structure

---

### Phase 3: Extract Analysis Components

**Files to Create**:
6. `lib/analysis/heart-rate.ts` (~300 lines)
   - `analyzeHeartRateDrift()`
   - `analyzeHeartRateRecovery()`
   - HR zone calculations

7. `lib/analysis/elevation.ts` (~150 lines)
   - `calculateElevationMetrics()`
   - Grade calculations
   - Use Garmin elevation data

8. `lib/analysis/pacing-consistency.ts` (~200 lines)
   - `analyzePacingConsistency()`
   - Variability calculations

**Test**: Each analysis component independently

---

### Phase 4: Extract AI Narrative

**Files to Create**:
9. `lib/narrative/ai-insights.ts` (~400 lines)
   - `generateAINarrativeInsights()` - main function
   - Prompt building logic
   - Response parsing

**Test**: Generate narrative for known workout

---

### Phase 5: Simplify Main Handler

**New `index.ts`** (~300 lines):
```typescript
import { calculatePaceAdherence } from './lib/adherence/pace-adherence.ts';
import { calculateDurationAdherence } from './lib/adherence/duration-adherence.ts';
import { calculateExecutionScore } from './lib/adherence/execution-score.ts';
import { generateIntervalBreakdown } from './lib/intervals/interval-breakdown.ts';
import { analyzeHeartRate } from './lib/analysis/heart-rate.ts';
import { generateAINarrativeInsights } from './lib/narrative/ai-insights.ts';

Deno.serve(async (req) => {
  // 1. Get workout data
  // 2. Extract sensor data
  // 3. Get planned workout
  // 4. Call extracted functions
  // 5. Combine results
  // 6. Return response
});
```

---

## Execution Order

### Step 1: Create Module Structure
```bash
mkdir -p supabase/functions/analyze-running-workout/lib/{adherence,intervals,analysis,narrative}
```

### Step 2: Extract One Module at a Time
1. Start with `pace-adherence.ts` (easiest, pure functions)
2. Test it works
3. Update main handler to import it
4. Remove old code
5. Move to next module

### Step 3: Test After Each Extraction
- Run analysis on known workout
- Verify output matches
- Check Summary screen displays correctly
- Check Context screen displays correctly

---

## Key Principles

1. **One file = One responsibility**
2. **Pure functions where possible** (no side effects)
3. **Clear interfaces** (TypeScript types for all inputs/outputs)
4. **Testable** (each module can be tested independently)
5. **Backward compatible** (output structure stays the same)

---

## Success Metrics

- [ ] Main handler < 500 lines
- [ ] Each module < 400 lines
- [ ] All tests pass
- [ ] Pace displays correctly
- [ ] No breaking changes to output structure

---

## Risk Mitigation

1. **Keep old code** until new code is verified
2. **Extract one module at a time** (don't do everything at once)
3. **Test after each extraction** (catch issues early)
4. **Version control** (easy to revert if needed)

---

## Timeline Estimate

- **Phase 1** (Calculations): 2-3 hours
- **Phase 2** (Intervals): 3-4 hours  
- **Phase 3** (Analysis): 2-3 hours
- **Phase 4** (Narrative): 2-3 hours
- **Phase 5** (Main handler): 1-2 hours

**Total**: ~10-15 hours of focused work

---

## Start Here?

I recommend starting with **Phase 1** (extract calculation functions). They're pure functions, easy to test, and low risk.

Want me to start extracting the pace adherence calculations?








