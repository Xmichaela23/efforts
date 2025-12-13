# Comprehensive Analysis: analyze-running-workout Function

## Overview
The `analyze-running-workout` function is a **5,203-line** edge function that performs granular adherence analysis for running workouts. It serves **two primary consumers**:

1. **Summary Screen** (`MobileSummary.tsx`) - Needs execution scores
2. **Context Screen** (`TodaysWorkoutsTab.tsx`) - Needs detailed insights and narrative

---

## 🎯 What It Does for Summary Screen

### Purpose
Calculate **execution scores** that show how well the user executed the planned workout.

### Key Outputs for Summary Screen
Located in `workout_analysis.performance`:
- `execution_adherence` (0-100%) - Overall execution score
- `pace_adherence` (0-100%) - Pace adherence percentage  
- `duration_adherence` (0-100%) - Duration adherence percentage
- `completed_steps` - Number of completed intervals
- `total_steps` - Total planned intervals

### How Summary Screen Uses It
**File**: `src/components/MobileSummary.tsx` (lines 1436-1453)

```typescript
const performance = completed?.workout_analysis?.performance;
const executionAdherence = performance?.execution_adherence;
const paceAdherence = performance?.pace_adherence;
const durationAdherence = performance?.duration_adherence;
```

**Display**: Shows three chips:
- **Execution**: Overall score (e.g., "71%")
- **Pace**: Pace adherence (e.g., "89%")
- **Duration**: Duration adherence (e.g., "95%")

### Calculation Flow for Summary Screen

1. **Extract sensor data** (lines 1514-1718)
   - Reads from `workouts.sensor_data`
   - Extracts pace, HR, elevation, cadence
   - Handles multiple data sources (device_speed, cumulative_distance, GPS)

2. **Load intervals** (lines 600-1052)
   - Reads `workouts.computed.intervals` (pre-computed by `compute-workout-summary`)
   - Matches intervals to planned steps
   - Expands pace ranges with tolerance (5-10% depending on segment type)

3. **Calculate granular adherence** (lines 1933-2276)
   - `calculatePrescribedRangeAdherenceGranular()` - Main analysis function
   - For intervals: `calculateIntervalPaceAdherence()` (lines 1979-2276)
   - For steady-state: `calculateSteadyStatePaceAdherence()` (lines 2282-2546)
   - **Time-in-range calculation**: Sample-by-sample analysis (not averages)

4. **Calculate execution scores** (lines 1099-1261)
   - **Pace adherence**: Uses granular time-in-range score (lines 1121-1137)
   - **Duration adherence**: Uses granular duration adherence (lines 1126-1138)
   - **Execution adherence**: Weighted combination (lines 1142-1258)
     - For range workouts: 40% avg pace + 30% time-in-range + 30% duration
     - For single-target: 50% pace + 50% duration

5. **Store results** (lines 1309-1405)
   - Updates `workouts.workout_analysis.performance`
   - Updates `workouts.computed.intervals[]` with granular_metrics
   - Sets `analysis_status = 'complete'`

---

## 🎯 What It Does for Context Screen

### Purpose
Generate **detailed insights** and **AI-powered narrative** explaining workout performance.

### Key Outputs for Context Screen
Located in `workout_analysis`:
- `narrative_insights` (string[]) - AI-generated human-readable observations
- `detailed_analysis` - Structured breakdown with:
  - `speed_fluctuations` - Pace variability analysis
  - `heart_rate_recovery` - HR recovery between intervals
  - `interval_breakdown` - Per-interval performance with formatted text
  - `pacing_consistency` - Consistency metrics
  - `mile_by_mile_terrain` - Mile-by-mile breakdown (for continuous runs only)
- `granular_analysis` - Raw metrics used for calculations
- `performance` - Same scores used by Summary screen

### How Context Screen Uses It
**File**: `src/components/context/TodaysWorkoutsTab.tsx` (lines 581-744)

```typescript
const analysis = workout.workout_analysis;
const insights = analysis.narrative_insights; // AI-generated array
const detailedAnalysis = analysis.detailed_analysis;
const performance = analysis.performance;
```

**Display**: Shows:
- **Latest workout analysis** section with AI insights
- **Mile-by-mile terrain breakdown** (if available)
- **Interval-by-interval breakdown** (if interval workout)
- **Red flags** and **strengths**

### Calculation Flow for Context Screen

1. **Generate detailed chart analysis** (lines 3128-3192)
   - `generateDetailedChartAnalysis()` orchestrates:
     - Speed fluctuation analysis (lines 3197-3253)
     - HR recovery analysis (lines 3258-3323)
     - Interval breakdown (lines 3331-3729)
     - Pacing consistency (lines 3734-3776)
     - Mile-by-mile terrain (lines 3837-4239) - **ONLY for continuous runs**

2. **Generate interval breakdown** (lines 3331-3729)
   - Creates per-interval performance scores
   - Generates formatted text section with:
     - Pace adherence breakdown
     - Duration adherence breakdown
     - Segment-by-segment analysis (warmup/work/recovery/cooldown)
     - Coaching insights

3. **Generate mile-by-mile breakdown** (lines 3837-4239)
   - **ONLY for continuous runs** (not interval workouts)
   - Calculates mile splits from sensor data
   - Compares each mile to target pace range
   - Categorizes miles: within range / faster than range / slower than range
   - Includes terrain analysis (elevation, grade)

4. **Generate AI narrative insights** (lines 4245-5201)
   - `generateAINarrativeInsights()` - **Largest function** (~950 lines
   - Builds comprehensive context:
     - Workout metrics (duration, distance, pace, HR)
     - Weather and terrain data
     - Plan context (if part of training plan)
     - Adherence metrics
     - Pre-calculated mile/interval categorizations
   - Sends to OpenAI GPT-4o-mini
   - Returns 3-4 factual observations

5. **Store results** (lines 1340-1352)
   - Updates `workout_analysis` with:
     - `granular_analysis` - Raw metrics
     - `performance` - Execution scores
     - `detailed_analysis` - Structured breakdown
     - `narrative_insights` - AI-generated insights
     - `mile_by_mile_terrain` - Terrain breakdown

---

## 🔍 Key Functions Breakdown

### Core Analysis Functions

1. **`calculatePrescribedRangeAdherenceGranular()`** (lines 1933-1973)
   - **Purpose**: Main orchestrator - routes to interval or steady-state analysis
   - **Input**: sensor data, intervals, workout, planned workout
   - **Output**: `PrescribedRangeAdherence` object with time-in-range metrics

2. **`calculateIntervalPaceAdherence()`** (lines 1979-2276)
   - **Purpose**: Analyze interval workouts (work/recovery pattern)
   - **Key**: Sample-by-sample time-in-range calculation
   - **Output**: Overall adherence, segment breakdown, HR drift, pacing variability

3. **`calculateSteadyStatePaceAdherence()`** (lines 2282-2546)
   - **Purpose**: Analyze continuous runs (no intervals)
   - **Key**: Average pace + consistency penalty
   - **Output**: Pace adherence with CV penalty

4. **`analyzeIntervalPace()`** (lines 2944-3112)
   - **Purpose**: Analyze single interval's pace adherence
   - **Key**: Sample-by-sample range checking
   - **Output**: Time in range, granular metrics (pace variation, HR drift, cadence)

### Execution Scoring Functions

5. **`calculateGarminExecutionScore()`** (lines 351-451)
   - **Purpose**: Calculate penalty-based execution score (Garmin-style)
   - **Key**: Segment-by-segment penalties with tolerance
   - **Output**: Overall execution score, segment summary, penalties

6. **`calculateSegmentPenalty()`** (lines 280-322)
   - **Purpose**: Calculate penalty for single segment
   - **Key**: Tolerance-based (5-10% depending on segment type)
   - **Output**: Penalty object with reason

7. **`inferSegmentType()`** (lines 162-221)
   - **Purpose**: Determine segment type (warmup/work_interval/tempo/recovery/etc.)
   - **Key**: Uses role, token, duration, distance to infer type
   - **Output**: SegmentType enum

8. **`getPaceToleranceForSegment()`** (lines 228-249)
   - **Purpose**: Get tolerance percentage for segment type
   - **Key**: Different tolerances for different segment types
   - **Output**: Tolerance percentage (5-15%)

### Detailed Analysis Functions

9. **`generateDetailedChartAnalysis()`** (lines 3128-3192)
   - **Purpose**: Orchestrate detailed analysis generation
   - **Key**: Routes to appropriate analysis functions
   - **Output**: Complete detailed_analysis object

10. **`generateIntervalBreakdown()`** (lines 3331-3729)
    - **Purpose**: Generate per-interval breakdown with formatted text
    - **Key**: Creates coaching insights and pacing analysis
    - **Output**: Interval breakdown with section text

11. **`generateMileByMileTerrainBreakdown()`** (lines 3837-4239)
    - **Purpose**: Generate mile-by-mile breakdown for continuous runs
    - **Key**: Compares each mile to target range, includes terrain
    - **Output**: Mile splits with categorization and formatted text

12. **`generateAINarrativeInsights()`** (lines 4245-5201)
    - **Purpose**: Generate AI-powered narrative insights
    - **Key**: Builds comprehensive prompt, calls OpenAI API
    - **Output**: Array of 3-4 factual observations

### Helper Functions

13. **`extractSensorData()`** (lines 1514-1718)
    - **Purpose**: Extract and normalize sensor data from database
    - **Key**: Handles multiple data source types, calculates pace
    - **Output**: Array of normalized sensor samples

14. **`calculateHeartRateDrift()`** (lines 2708-2942)
    - **Purpose**: Calculate HR drift (increase over time)
    - **Key**: Uses time windows (early vs late)
    - **Output**: Drift BPM, interpretation

15. **`calculateDurationAdherenceFromComputed()`** (lines 1724-1787)
    - **Purpose**: Calculate duration adherence from computed data
    - **Key**: Uses pre-computed duration values
    - **Output**: Duration adherence percentage

16. **`calculateDurationAdherence()`** (lines 1793-1927)
    - **Purpose**: DEPRECATED - Calculate duration adherence from sensor data
    - **Key**: Multiple fallback strategies
    - **Status**: Marked as deprecated but still used

---

## 🔄 Data Flow

### Complete Flow Diagram

```
1. User triggers analysis (Context screen or auto-trigger)
   ↓
2. analyze-running-workout edge function called
   ↓
3. Extract sensor data (extractSensorData)
   - Reads workouts.sensor_data
   - Normalizes pace, HR, elevation
   ↓
4. Load intervals (lines 600-1052)
   - Reads workouts.computed.intervals
   - Matches to planned steps
   - Expands pace ranges with tolerance
   ↓
5. Calculate granular adherence (calculatePrescribedRangeAdherenceGranular)
   ├─→ Interval workout? → calculateIntervalPaceAdherence
   │   - Sample-by-sample time-in-range
   │   - Segment breakdown (warmup/work/recovery/cooldown)
   │   - HR drift calculation
   │   - Pacing variability
   │
   └─→ Steady-state? → calculateSteadyStatePaceAdherence
       - Average pace + consistency penalty
       - HR drift calculation
       - Duration adherence
   ↓
6. Calculate execution scores (lines 1099-1261)
   - Pace adherence: granular time-in-range
   - Duration adherence: granular duration
   - Execution adherence: weighted combination
   ↓
7. Generate detailed analysis (generateDetailedChartAnalysis)
   ├─→ Speed fluctuations (analyzeSpeedFluctuations)
   ├─→ HR recovery (analyzeHeartRateRecovery)
   ├─→ Interval breakdown (generateIntervalBreakdown)
   │   - Per-interval scores
   │   - Formatted text section
   │   - Coaching insights
   ├─→ Pacing consistency (analyzePacingConsistency)
   └─→ Mile-by-mile terrain (generateMileByMileTerrainBreakdown)
       - ONLY for continuous runs
       - Mile splits with categorization
       - Terrain analysis
   ↓
8. Generate AI narrative (generateAINarrativeInsights)
   - Build comprehensive context
   - Call OpenAI API
   - Parse JSON array response
   ↓
9. Store results (lines 1340-1405)
   - Update workouts.workout_analysis
   - Update workouts.computed.intervals
   - Set analysis_status = 'complete'
   ↓
10. Frontend displays:
    - Summary screen: execution scores
    - Context screen: AI insights + detailed breakdown
```

---

## ⚠️ Issues, Duplications, and Contradictions

### 1. **Duplicate Duration Adherence Calculations**

**Problem**: Two functions calculate duration adherence:
- `calculateDurationAdherenceFromComputed()` (lines 1724-1787) - Uses computed data
- `calculateDurationAdherence()` (lines 1793-1927) - Uses sensor data, marked DEPRECATED

**Issue**: Both are still referenced in code. The deprecated one has complex fallback logic that may conflict.

**Location**: 
- Line 1126: Uses granular analysis duration_adherence
- Line 2111-2130: calculateIntervalPaceAdherence calculates its own duration adherence
- Line 2439-2461: calculateSteadyStatePaceAdherence calculates its own duration adherence

**Contradiction**: Duration adherence is calculated in **3 different places** with potentially different formulas.

---

### 2. **Contradictory Execution Score Formulas**

**Problem**: Execution score is calculated multiple times with different formulas:

**Location 1** (lines 1142-1144):
```typescript
performance.execution_adherence = Math.round(
  (performance.pace_adherence * 0.5) + (performance.duration_adherence * 0.5)
);
```
- Simple 50/50 split

**Location 2** (lines 1209-1258):
```typescript
// For range workouts with average pace weighting
performance.execution_adherence = Math.round(
  (avgPaceAdherenceScore * 0.4) + 
  (performance.pace_adherence * 0.3) + 
  (performance.duration_adherence * 0.3)
);
```
- 40/30/30 split with average pace weighting

**Location 3** (lines 351-451):
```typescript
// Garmin-style penalty system
const executionScore = Math.max(0, Math.round(100 - totalPenalty));
```
- Penalty-based system (100 - penalties)

**Contradiction**: Three different formulas produce different results. The penalty-based system is calculated but may not be used in final performance object.

---

### 3. **Duplicate Pace Range Expansion Logic**

**Problem**: Pace range expansion logic is duplicated in multiple places:

**Location 1** (lines 916-1052): Main interval preparation loop
- Expands single pace to range
- Expands zero-width ranges
- Expands too-tight ranges

**Location 2** (lines 2963-3009): `analyzeIntervalPace()` function
- Same expansion logic repeated
- Same tolerance calculation

**Location 3** (lines 1026-1028, 1041-1043, etc.): Multiple inline expansions

**Issue**: Same logic repeated 3+ times with slight variations. Changes to tolerance logic must be made in multiple places.

---

### 4. **Contradictory Pace Adherence Sources**

**Problem**: Pace adherence comes from multiple sources:

**Source 1** (lines 1121-1137): Granular time-in-range score
```typescript
const granularPaceAdherence = enhancedAnalysis.overall_adherence * 100;
performance.pace_adherence = granularPaceAdherence !== null ? granularPaceAdherence : executionAnalysis.pace_execution;
```

**Source 2** (lines 351-451): Garmin execution score
```typescript
pace_execution: executionScore, // Same as overall since pace is main factor
```

**Source 3** (lines 2133): Interval analysis
```typescript
const avgPaceAdherence = timeInRangeScore * 100;
```

**Contradiction**: Three different calculations may produce different results. Fallback chain is unclear.

---

### 5. **Duplicate Segment Type Inference**

**Problem**: Segment type is inferred in multiple places:

**Location 1** (lines 162-221): `inferSegmentType()` function
- Uses role, token, duration, distance

**Location 2** (lines 358-365): `calculateGarminExecutionScore()`
- Re-infers segment type for each segment

**Location 3** (lines 2145-2148): `calculateIntervalPaceAdherence()`
- Filters by role/kind/type (different logic)

**Issue**: Same inference logic scattered across functions. Inconsistencies may cause different segment classifications.

---

### 6. **Contradictory Mile-by-Mile Logic**

**Problem**: Mile-by-mile breakdown has conditional logic that may conflict:

**Location 1** (lines 3164-3175): Conditional generation
```typescript
const isIntervalWorkout = workIntervals.length > 1 || 
  (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);

const mileByMileTerrain = isIntervalWorkout ? null : generateMileByMileTerrainBreakdown(...);
```

**Location 2** (lines 4601-4603): Different interval detection
```typescript
const hasIntervals = workSteps.length > 1 || 
  steps.some((step: any) => step.step_type === 'interval' || step.step_type === 'repeat') ||
  (workSteps.length >= 1 && recoverySteps.length >= 1 && steps.length > 2);
```

**Contradiction**: Two different formulas for detecting interval workouts. May produce different results.

---

### 7. **Massive AI Narrative Function**

**Problem**: `generateAINarrativeInsights()` is **~950 lines** (lines 4245-5201)

**Issues**:
- Single function does too much
- Complex prompt building with nested conditionals
- Pace calculation logic duplicated from other functions
- Plan context extraction embedded in function
- Hard to test and maintain

**Should be split into**:
- `buildWorkoutContext()` - Extract workout metrics
- `buildAdherenceContext()` - Extract adherence metrics  
- `buildPlanContext()` - Extract plan context
- `buildAIPrompt()` - Build prompt from contexts
- `callOpenAI()` - Make API call

---

### 8. **Duplicate Pace Calculation Logic**

**Problem**: Pace is calculated in multiple places:

**Location 1** (lines 4295-4331): AI narrative function
- Calculates from moving_time and distance
- Fallback to sensor speed samples

**Location 2** (lines 1514-1718): `extractSensorData()`
- Calculates pace from speed or cumulative distance

**Location 3** (lines 2607-2655): `calculatePaceFromGPS()`
- Haversine formula calculation

**Location 4** (lines 3154-3161): Detailed analysis
- Calculates workout-level average pace

**Issue**: Same calculation logic repeated with different fallbacks. Inconsistencies may cause different pace values.

---

### 9. **Contradictory Tolerance Values**

**Problem**: Tolerance values are defined in multiple places:

**Location 1** (lines 149-157): `SEGMENT_CONFIG` constant
```typescript
work_interval: { tolerance: 5, weight: 1.0 },
tempo: { tolerance: 7, weight: 1.0 },
recovery_jog: { tolerance: 15, weight: 0.7 },
```

**Location 2** (lines 228-249): `getPaceToleranceForSegment()`
- Returns tolerance percentage

**Location 3** (lines 1886-1888): `calculateDurationAdherence()`
```typescript
const tolerance = 0.10; // 10% tolerance
```

**Issue**: Tolerance values scattered. Hard to maintain consistency.

---

### 10. **Dead Code: calculatePrescribedRangeAdherence**

**Problem**: Comment at lines 3115-3122 indicates dead code was removed:
```typescript
/**
 * REMOVED: calculatePrescribedRangeAdherence - Dead code, never called
 * Replaced by calculatePrescribedRangeAdherenceGranular
 * 
 * Removed ~960 lines of dead code including:
 * - calculatePrescribedRangeAdherence
 * - calculateEnhancedAdherence  
 * - All helper functions only used by dead code
 */
```

**Issue**: Suggests previous refactoring removed dead code, but current code still has duplicates and contradictions.

---

## 📊 Function Size Breakdown

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateAINarrativeInsights()` | ~950 | AI narrative generation |
| `generateMileByMileTerrainBreakdown()` | ~400 | Mile-by-mile analysis |
| `generateIntervalBreakdown()` | ~400 | Interval breakdown |
| `calculateIntervalPaceAdherence()` | ~300 | Interval analysis |
| `calculateSteadyStatePaceAdherence()` | ~265 | Steady-state analysis |
| `calculateHeartRateDrift()` | ~235 | HR drift calculation |
| `extractSensorData()` | ~205 | Sensor data extraction |
| `calculateDurationAdherence()` | ~135 | Duration adherence (deprecated) |
| `analyzeIntervalPace()` | ~170 | Single interval analysis |
| Main handler | ~1000 | Orchestration and storage |

---

## 🎯 Summary: What Each Screen Needs

### Summary Screen Needs:
1. ✅ `workout_analysis.performance.execution_adherence` - Overall score
2. ✅ `workout_analysis.performance.pace_adherence` - Pace score
3. ✅ `workout_analysis.performance.duration_adherence` - Duration score
4. ✅ `workout_analysis.performance.completed_steps` - Completion count

### Context Screen Needs:
1. ✅ `workout_analysis.narrative_insights` - AI-generated observations
2. ✅ `workout_analysis.detailed_analysis.interval_breakdown` - Per-interval breakdown
3. ✅ `workout_analysis.detailed_analysis.mile_by_mile_terrain` - Mile breakdown (continuous runs)
4. ✅ `workout_analysis.detailed_analysis.speed_fluctuations` - Pace variability
5. ✅ `workout_analysis.detailed_analysis.heart_rate_recovery` - HR recovery
6. ✅ `workout_analysis.performance` - Same as Summary screen

---

## 🔧 Refactoring Opportunities

### High Priority:
1. **Consolidate duration adherence calculation** - Single source of truth
2. **Consolidate execution score calculation** - Single formula
3. **Consolidate pace range expansion** - Single function
4. **Split AI narrative function** - Break into smaller functions
5. **Consolidate pace calculation** - Single function with clear fallbacks

### Medium Priority:
6. **Consolidate segment type inference** - Single function
7. **Consolidate interval detection** - Single function
8. **Consolidate tolerance values** - Single configuration object
9. **Remove deprecated functions** - Clean up dead code

### Low Priority:
10. **Extract helper functions** - Break down large functions
11. **Standardize data structures** - Consistent interfaces
12. **Add type definitions** - Better TypeScript types

---

## 📝 Notes

- **Total lines**: 5,203
- **Main function**: `Deno.serve()` handler (lines 453-1455)
- **Largest sub-function**: `generateAINarrativeInsights()` (~950 lines)
- **Most duplicated logic**: Pace range expansion (3+ locations)
- **Most contradictory logic**: Execution score calculation (3 formulas)
- **Most complex logic**: AI prompt building (nested conditionals)

---

**Last Updated**: Analysis completed for refactoring planning
**Status**: Ready for refactoring discussion








