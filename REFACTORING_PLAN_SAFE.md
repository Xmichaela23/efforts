# Safe Refactoring Plan: Minimal Changes

## 🎯 Goal
Extract duplicate code into shared utilities **WITHOUT** changing any:
- Database writes
- Calculation formulas
- Function signatures
- Data structures
- API contracts

---

## ✅ What I Would Change (MINIMAL)

### 1. Create Shared Library (NEW FILES ONLY)

**Location**: `supabase/lib/analysis/`

#### New File 1: `sensor-data-extractor.ts`
**Purpose**: Extract sensor data from various formats (shared by both functions)

**What it does**:
- Handles array, object, JSON string formats
- Extracts pace from speed or cumulative distance
- Returns normalized sensor samples

**Used by**:
- `analyze-running-workout` (currently has `extractSensorData()`)
- `compute-workout-analysis` (currently has `normalizeSamples()`)

**Change**: Extract the logic, keep the output format identical

---

#### New File 2: `pace-calculator.ts`
**Purpose**: Single source of truth for pace calculations

**What it does**:
- Calculates pace from speed (m/s → s/mi or s/km)
- Calculates pace from distance/time delta
- Validates pace ranges (filters unrealistic values)

**Used by**:
- `analyze-running-workout` (multiple places)
- `compute-workout-analysis` (for charts)

**Change**: Extract formulas, keep calculations identical

---

#### New File 3: `duration-calculator.ts`
**Purpose**: Single source of truth for duration calculations

**What it does**:
- Calculates duration adherence
- Handles moving time vs elapsed time
- Validates duration ranges

**Used by**:
- `analyze-running-workout` (has `calculateDurationAdherence()`)

**Change**: Extract function, keep formula identical

---

### 2. Refactor Edge Functions (INTERNAL ONLY)

#### `analyze-running-workout/index.ts`
**Changes**:
- **Line 1514-1718**: Replace `extractSensorData()` with import from shared lib
- **Line 1793-1927**: Replace `calculateDurationAdherence()` with import from shared lib
- **Multiple places**: Replace inline pace calculations with import from shared lib

**What stays the same**:
- ✅ All database writes (lines 1340-1352)
- ✅ All calculation formulas (just moved to shared lib)
- ✅ Function signature (same inputs/outputs)
- ✅ All data structures written to DB

**Risk**: **LOW** - Only extracting code, not changing logic

---

#### `compute-workout-analysis/index.ts`
**Changes**:
- **Line 948-985**: Replace `normalizeSamples()` with import from shared lib
- **Line 1086-1092**: Replace pace calculation with import from shared lib

**What stays the same**:
- ✅ All database writes (lines 1066-1100, 1170-1190, 1237-1359)
- ✅ All calculation formulas (just moved to shared lib)
- ✅ Function signature (same inputs/outputs)
- ✅ All data structures written to DB

**Risk**: **LOW** - Only extracting code, not changing logic

---

## ❌ What I Would NOT Change

### Database Writes (UNTOUCHED)
- ✅ `workouts.computed.series` structure
- ✅ `workouts.computed.overall` structure
- ✅ `workouts.computed.analysis.splits` structure
- ✅ `workouts.computed.analysis.zones` structure
- ✅ `workouts.workout_analysis.performance` structure
- ✅ `workouts.workout_analysis.narrative_insights` structure
- ✅ `workouts.workout_analysis.detailed_analysis` structure

### Calculation Formulas (UNTOUCHED)
- ✅ Pace calculation: `dt / (dd / 1000)` (for Details screen)
- ✅ Pace calculation: `1609.34 / speedMps` (for Summary/Context)
- ✅ Execution adherence: `40% avg pace + 30% time-in-range + 30% duration`
- ✅ Duration adherence: `(actual / planned) * 100`
- ✅ All other formulas remain identical

### Function Signatures (UNTOUCHED)
- ✅ `analyze-running-workout` inputs: `{ workout_id: string }`
- ✅ `analyze-running-workout` outputs: `{ success: boolean, analysis: {...} }`
- ✅ `compute-workout-analysis` inputs: `{ workout_id: string }`
- ✅ `compute-workout-analysis` outputs: `{ success: boolean }`

### API Contracts (UNTOUCHED)
- ✅ All edge function endpoints remain the same
- ✅ All response formats remain the same
- ✅ All error handling remains the same

---

## 🔍 Verification Strategy

### Step 1: Create Shared Library (No Impact)
1. Create `supabase/lib/analysis/` directory
2. Copy code from `analyze-running-workout` to shared lib
3. Copy code from `compute-workout-analysis` to shared lib
4. **Test**: Run unit tests on shared lib functions
5. **Verify**: Output matches original functions exactly

### Step 2: Update One Function at a Time

#### Phase 1: Update `analyze-running-workout` Only
1. Import shared utilities
2. Replace `extractSensorData()` call with shared lib call
3. **Test**: Run function on sample workout
4. **Verify**: Database writes are identical (compare before/after)
5. **Verify**: Execution scores are identical
6. **Verify**: AI insights are identical

#### Phase 2: Update `compute-workout-analysis` Only
1. Import shared utilities
2. Replace `normalizeSamples()` call with shared lib call
3. **Test**: Run function on sample workout
4. **Verify**: Database writes are identical (compare before/after)
5. **Verify**: Charts display correctly
6. **Verify**: Splits table is identical

### Step 3: End-to-End Testing
1. **Details Screen**: Verify charts, splits, zones display correctly
2. **Summary Screen**: Verify execution scores display correctly
3. **Context Screen**: Verify AI insights display correctly
4. **Compare**: Run same workout through old vs new code, compare outputs

---

## 📋 Specific Code Changes

### Change 1: Extract `extractSensorData()` to Shared Lib

**Before** (in `analyze-running-workout/index.ts`):
```typescript
function extractSensorData(data: any): any[] {
  // 200+ lines of code
  return samplesWithQuality;
}

// Later in code:
const sensorData = extractSensorData(workout.sensor_data);
```

**After** (in `analyze-running-workout/index.ts`):
```typescript
import { extractSensorData } from '../../lib/analysis/sensor-data-extractor.ts';

// Later in code:
const sensorData = extractSensorData(workout.sensor_data); // SAME CALL
```

**New File** (`supabase/lib/analysis/sensor-data-extractor.ts`):
```typescript
export function extractSensorData(data: any): any[] {
  // EXACT SAME CODE - just moved here
  return samplesWithQuality;
}
```

**Risk**: **ZERO** - Code is identical, just moved

---

### Change 2: Extract `normalizeSamples()` to Shared Lib

**Before** (in `compute-workout-analysis/index.ts`):
```typescript
function normalizeSamples(samplesIn: any[]): Array<{...}> {
  // 40 lines of code
  return out;
}

// Later in code:
let rows = normalizeSamples(sensor);
```

**After** (in `compute-workout-analysis/index.ts`):
```typescript
import { normalizeSamples } from '../../lib/analysis/sensor-data-extractor.ts';

// Later in code:
let rows = normalizeSamples(sensor); // SAME CALL
```

**New File** (`supabase/lib/analysis/sensor-data-extractor.ts`):
```typescript
export function normalizeSamples(samplesIn: any[]): Array<{...}> {
  // EXACT SAME CODE - just moved here
  return out;
}
```

**Risk**: **ZERO** - Code is identical, just moved

---

### Change 3: Extract Pace Calculations to Shared Lib

**Before** (in `analyze-running-workout/index.ts`):
```typescript
// Inline pace calculation:
if (speedMps != null && speedMps > 0) {
  pace_s_per_mi = 1609.34 / speedMps;
}
```

**After** (in `analyze-running-workout/index.ts`):
```typescript
import { calculatePaceFromSpeed } from '../../lib/analysis/pace-calculator.ts';

// Same calculation:
pace_s_per_mi = calculatePaceFromSpeed(speedMps);
```

**New File** (`supabase/lib/analysis/pace-calculator.ts`):
```typescript
export function calculatePaceFromSpeed(speedMps: number): number {
  return 1609.34 / speedMps; // EXACT SAME FORMULA
}
```

**Risk**: **ZERO** - Formula is identical, just extracted

---

## 🛡️ Safety Measures

### 1. Keep Original Functions as Backup
- Don't delete original functions immediately
- Comment them out with `// OLD - replaced by shared lib`
- Keep for 1-2 weeks as backup

### 2. Gradual Rollout
- Update `analyze-running-workout` first
- Test thoroughly
- Then update `compute-workout-analysis`
- Test thoroughly

### 3. Database Comparison
- Run same workout through old and new code
- Compare database writes byte-by-byte
- Verify all fields are identical

### 4. Frontend Testing
- Test Details screen with new data
- Test Summary screen with new data
- Test Context screen with new data
- Verify all displays are identical

---

## 🎯 Summary: What Changes vs What Doesn't

### Changes (MINIMAL):
- ✅ Extract duplicate code to shared library
- ✅ Replace function calls with imports
- ✅ **NO changes to logic**
- ✅ **NO changes to formulas**
- ✅ **NO changes to database writes**

### Doesn't Change (EVERYTHING ELSE):
- ❌ Database schema
- ❌ Data structures
- ❌ Calculation formulas
- ❌ Function signatures
- ❌ API contracts
- ❌ Frontend code
- ❌ Display logic

---

## ✅ Final Answer: Which Edge Functions Would I Change?

### Functions I Would Modify:
1. **`analyze-running-workout/index.ts`**
   - Replace `extractSensorData()` with import
   - Replace `calculateDurationAdherence()` with import
   - Replace inline pace calculations with imports
   - **Risk**: LOW (only extracting code, not changing logic)

2. **`compute-workout-analysis/index.ts`**
   - Replace `normalizeSamples()` with import
   - Replace inline pace calculations with imports
   - **Risk**: LOW (only extracting code, not changing logic)

### Functions I Would NOT Touch:
- ❌ `compute-workout-summary` (no duplicates found)
- ❌ `analyze-swim-workout` (not in scope for running refactor)
- ❌ `analyze-cycling-workout` (not in scope for running refactor)
- ❌ Any other edge functions

### New Files I Would Create:
- ✅ `supabase/lib/analysis/sensor-data-extractor.ts` (shared utilities)
- ✅ `supabase/lib/analysis/pace-calculator.ts` (shared utilities)
- ✅ `supabase/lib/analysis/duration-calculator.ts` (shared utilities)

---

## 🎯 Recommendation

**Start with the safest change first:**

1. **Phase 1**: Create shared library, copy code (no impact)
2. **Phase 2**: Update `analyze-running-workout` only (test thoroughly)
3. **Phase 3**: Update `compute-workout-analysis` only (test thoroughly)
4. **Phase 4**: Remove old code (after 1-2 weeks of verification)

**This minimizes risk and allows gradual rollout.**


