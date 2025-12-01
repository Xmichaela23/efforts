# Refactoring Execution Plan: Step-by-Step Strategy

## 🎯 Goal
Refactor `analyze-running-workout` to extract shared utilities while maintaining 100% integrity of all three screens.

---

## 📋 Execution Strategy: Incremental & Safe

### Phase 0: Preparation (No Code Changes)
**Goal**: Set up testing and verification infrastructure

1. **Create test workout dataset**
   - Interval workout (4 × 1 mile @ 5K pace)
   - Long run (10 miles @ easy pace range)
   - Single-target workout (tempo run @ exact pace)
   - Store expected outputs for comparison

2. **Document current outputs**
   - Run each test workout through current code
   - Save database writes (JSON files)
   - Save AI responses (JSON files)
   - These become "golden" references

3. **Set up verification script**
   - Compare new outputs to golden references
   - Byte-by-byte comparison for database writes
   - Verify all fields match exactly

**Time**: 1-2 hours  
**Risk**: ZERO (no code changes)

---

## Phase 1: Extract Shared Utilities (Lowest Risk)

### Step 1.1: Create Shared Library Structure
**Goal**: Create directory structure, no logic changes

```bash
mkdir -p supabase/lib/analysis/sensor-data
mkdir -p supabase/lib/analysis/metrics
mkdir -p supabase/lib/analysis/running
```

**Files to create**:
- `supabase/lib/analysis/sensor-data/extractor.ts` (empty for now)
- `supabase/lib/analysis/metrics/pace-calculator.ts` (empty for now)
- `supabase/lib/analysis/metrics/duration-calculator.ts` (empty for now)

**Time**: 15 minutes  
**Risk**: ZERO (empty files)

---

### Step 1.2: Extract `extractSensorData()` to Shared Lib
**Goal**: Move code, don't change logic

**Before**:
```typescript
// In analyze-running-workout/index.ts
function extractSensorData(data: any): any[] {
  // 200+ lines of code
}
```

**After**:
```typescript
// In supabase/lib/analysis/sensor-data/extractor.ts
export function extractSensorData(data: any): any[] {
  // EXACT SAME CODE - just moved
}

// In analyze-running-workout/index.ts
import { extractSensorData } from '../../lib/analysis/sensor-data/extractor.ts';
// Replace function call with import
```

**Verification**:
- Run test workouts through function
- Compare outputs byte-by-byte
- Verify all screens still work

**Time**: 1 hour  
**Risk**: LOW (code moved, not changed)

---

### Step 1.3: Extract `normalizeSamples()` to Shared Lib
**Goal**: Move code from `compute-workout-analysis`, don't change logic

**Before**:
```typescript
// In compute-workout-analysis/index.ts
function normalizeSamples(samplesIn: any[]): Array<{...}> {
  // 40 lines of code
}
```

**After**:
```typescript
// In supabase/lib/analysis/sensor-data/extractor.ts
export function normalizeSamples(samplesIn: any[]): Array<{...}> {
  // EXACT SAME CODE - just moved
}

// In compute-workout-analysis/index.ts
import { normalizeSamples } from '../../lib/analysis/sensor-data/extractor.ts';
```

**Verification**:
- Run test workouts through function
- Verify Details screen charts still display correctly
- Compare database writes byte-by-byte

**Time**: 30 minutes  
**Risk**: LOW (code moved, not changed)

---

### Step 1.4: Extract Pace Calculation Utilities
**Goal**: Extract pace calculation formulas to shared lib

**Extract**:
- `calculatePaceFromSpeed()` - Convert speed (m/s) to pace (s/mi)
- `calculatePaceFromDistanceTime()` - Calculate pace from distance/time delta
- `validatePaceRange()` - Filter unrealistic pace values

**Verification**:
- Run test workouts
- Verify pace calculations match exactly
- Check all three screens display correct paces

**Time**: 1 hour  
**Risk**: LOW (formulas extracted, not changed)

---

### Step 1.5: Extract Duration Calculation Utilities
**Goal**: Extract duration adherence calculation to shared lib

**Extract**:
- `calculateDurationAdherence()` - Duration adherence with 10% tolerance

**Verification**:
- Run test workouts
- Verify duration adherence scores match exactly
- Check Summary screen displays correct scores

**Time**: 30 minutes  
**Risk**: LOW (formula extracted, not changed)

---

## Phase 2: Refactor `analyze-running-workout` (Medium Risk)

### Step 2.1: Replace `extractSensorData()` Calls
**Goal**: Use shared lib instead of local function

**Changes**:
- Remove local `extractSensorData()` function
- Replace all calls with import from shared lib

**Verification**:
- Run test workouts
- Compare database writes byte-by-byte
- Verify Summary screen execution scores
- Verify Context screen AI insights

**Time**: 30 minutes  
**Risk**: LOW (using same code, just from different location)

---

### Step 2.2: Replace Pace Calculation Calls
**Goal**: Use shared lib instead of inline calculations

**Changes**:
- Replace inline pace calculations with shared lib functions
- Verify all calculations produce identical results

**Verification**:
- Run test workouts
- Compare pace adherence scores
- Verify all screens display correct paces

**Time**: 1 hour  
**Risk**: LOW (using same formulas, just from shared lib)

---

### Step 2.3: Replace Duration Calculation Calls
**Goal**: Use shared lib instead of local function

**Changes**:
- Remove local `calculateDurationAdherence()` function
- Replace calls with import from shared lib

**Verification**:
- Run test workouts
- Compare duration adherence scores
- Verify Summary screen displays correct scores

**Time**: 30 minutes  
**Risk**: LOW (using same formula, just from shared lib)

---

### Step 2.4: Consolidate Interval Detection
**Goal**: Single detection point, reuse everywhere

**Before**:
- Line 3163: `isIntervalWorkout` (for detailed analysis)
- Line 4601: `hasIntervals` (for AI prompt)
- Line 1965: `isIntervalWorkout` (for granular analysis)

**After**:
```typescript
// Single detection at top of function
const workoutType = detectWorkoutType(plannedWorkout, intervals);
// workoutType = 'interval' | 'long_run_range' | 'long_run_single' | 'freeform'

// Reuse everywhere
if (workoutType === 'interval') { ... }
else if (workoutType === 'long_run_range') { ... }
```

**Verification**:
- Run test workouts (intervals, long runs)
- Verify detection is consistent everywhere
- Verify all screens display correctly

**Time**: 1 hour  
**Risk**: MEDIUM (consolidating logic, but should be identical)

---

### Step 2.5: Consolidate Pace Info Extraction
**Goal**: Extract once, reuse everywhere

**Before**:
- Line 1156: Extracts `plannedPaceInfo` (for execution score)
- Line 4574: Re-extracts `plannedPaceInfo` (for AI prompt)

**After**:
```typescript
// Extract once at top
const plannedPaceInfo = extractPlannedPaceInfo(plannedWorkout, userUnits);

// Reuse for execution score calculation
// Reuse for AI prompt building
```

**Verification**:
- Run test workouts
- Verify execution scores match
- Verify AI prompts use correct pace info

**Time**: 30 minutes  
**Risk**: LOW (extracting same logic, just once)

---

## Phase 3: Refactor AI Prompt Generation (Higher Risk)

### Step 3.1: Extract Prompt Building Functions
**Goal**: Split massive function into smaller, focused functions

**Create**:
- `buildBasePrompt()` - Base prompt (same for all)
- `buildIntervalPrompt()` - Interval workout prompt
- `buildLongRunRangePrompt()` - Range workout prompt
- `buildLongRunSinglePrompt()` - Single-target prompt
- `buildFreeformPrompt()` - Freeform run prompt

**Verification**:
- Run test workouts (all types)
- Compare AI responses (should be similar, not identical)
- Verify Context screen displays insights correctly

**Time**: 2-3 hours  
**Risk**: MEDIUM (splitting function, but logic unchanged)

---

### Step 3.2: Extract Workout Context Building
**Goal**: Extract context building to separate function

**Create**:
- `buildWorkoutContext()` - Extract workout metrics
- `buildPlanContext()` - Extract plan context
- `buildAdherenceContext()` - Extract adherence metrics

**Verification**:
- Run test workouts
- Verify context objects match exactly
- Verify AI prompts use correct context

**Time**: 1 hour  
**Risk**: LOW (extracting code, not changing logic)

---

## Phase 4: Refactor `compute-workout-analysis` (Low Risk)

### Step 4.1: Replace `normalizeSamples()` Call
**Goal**: Use shared lib instead of local function

**Changes**:
- Remove local `normalizeSamples()` function
- Replace call with import from shared lib

**Verification**:
- Run test workouts
- Verify Details screen charts display correctly
- Compare database writes byte-by-byte

**Time**: 30 minutes  
**Risk**: LOW (using same code, just from shared lib)

---

### Step 4.2: Replace Pace Calculation Calls
**Goal**: Use shared lib instead of inline calculations

**Changes**:
- Replace inline pace calculations with shared lib functions

**Verification**:
- Run test workouts
- Verify Details screen charts display correct paces
- Compare database writes byte-by-byte

**Time**: 30 minutes  
**Risk**: LOW (using same formulas, just from shared lib)

---

## Phase 5: Testing & Verification (Critical)

### Step 5.1: End-to-End Testing
**Goal**: Verify all three screens work correctly

**Test Cases**:
1. **Interval Workout**:
   - Details screen: Charts, splits, zones display correctly
   - Summary screen: Execution scores display correctly
   - Context screen: Interval breakdown displays correctly

2. **Long Run (Range)**:
   - Details screen: Charts, splits, zones display correctly
   - Summary screen: Execution scores display correctly
   - Context screen: Mile-by-mile breakdown displays correctly

3. **Long Run (Single-Target)**:
   - Details screen: Charts, splits, zones display correctly
   - Summary screen: Execution scores display correctly
   - Context screen: Consistency analysis displays correctly

**Time**: 2-3 hours  
**Risk**: NONE (just testing)

---

### Step 5.2: Database Comparison
**Goal**: Verify database writes are identical

**Process**:
- Run same workout through old and new code
- Compare `workouts.computed.*` fields byte-by-byte
- Compare `workouts.workout_analysis.*` fields byte-by-byte
- Verify all fields match exactly

**Time**: 1 hour  
**Risk**: NONE (just comparison)

---

### Step 5.3: Frontend Testing
**Goal**: Verify all screens display correctly

**Test**:
- Open Details screen → Verify charts/splits/zones
- Open Summary screen → Verify execution scores
- Open Context screen → Verify AI insights

**Time**: 1 hour  
**Risk**: NONE (just testing)

---

## 🎯 Recommended Execution Order

### Option A: Screen-by-Screen (Safer)
**Focus**: Test one screen at a time

1. **Phase 1**: Extract shared utilities (no screen impact)
2. **Phase 2**: Refactor `analyze-running-workout` (affects Summary + Context)
   - Test Summary screen after each step
   - Test Context screen after each step
3. **Phase 4**: Refactor `compute-workout-analysis` (affects Details)
   - Test Details screen after each step
4. **Phase 5**: End-to-end testing

**Pros**:
- ✅ Can verify each screen works before moving on
- ✅ Easier to isolate issues
- ✅ Lower risk

**Cons**:
- ⚠️ Takes longer (more testing cycles)

---

### Option B: Function-by-Function (Faster)
**Focus**: Complete one function refactor at a time

1. **Phase 1**: Extract shared utilities
2. **Phase 2**: Complete `analyze-running-workout` refactor
   - Test all screens at end
3. **Phase 4**: Complete `compute-workout-analysis` refactor
   - Test all screens at end
4. **Phase 5**: End-to-end testing

**Pros**:
- ✅ Faster (fewer testing cycles)
- ✅ Complete refactor of one function before moving on

**Cons**:
- ⚠️ Harder to isolate issues if something breaks

---

## ✅ Recommended Approach: Hybrid

### Week 1: Shared Utilities (Low Risk)
- **Day 1-2**: Extract sensor data extraction
- **Day 3-4**: Extract pace/duration calculations
- **Day 5**: Test all screens (should work identically)

### Week 2: `analyze-running-workout` (Medium Risk)
- **Day 1-2**: Replace function calls with shared lib imports
- **Day 3**: Consolidate interval detection
- **Day 4**: Consolidate pace info extraction
- **Day 5**: Test Summary + Context screens

### Week 3: AI Prompt Refactoring (Higher Risk)
- **Day 1-2**: Extract prompt building functions
- **Day 3**: Extract context building functions
- **Day 4-5**: Test Context screen (AI insights)

### Week 4: `compute-workout-analysis` (Low Risk)
- **Day 1-2**: Replace function calls with shared lib imports
- **Day 3**: Test Details screen

### Week 5: Final Testing
- **Day 1-2**: End-to-end testing (all screens)
- **Day 3-4**: Database comparison (old vs new)
- **Day 5**: Frontend testing (all screens)

---

## 🛡️ Safety Measures

### 1. **Keep Original Code as Backup**
- Comment out old functions, don't delete
- Keep for 2-3 weeks as backup
- Example: `// OLD - replaced by shared lib on 2025-01-XX`

### 2. **Gradual Rollout**
- One function at a time
- Test thoroughly after each change
- Don't move on until current change is verified

### 3. **Database Comparison**
- Run same workout through old and new code
- Compare database writes byte-by-byte
- Verify all fields match exactly

### 4. **Screen Testing**
- Test Details screen after `compute-workout-analysis` changes
- Test Summary screen after `analyze-running-workout` changes
- Test Context screen after AI prompt changes

### 5. **Rollback Plan**
- Git commit after each successful phase
- Can rollback to any phase if issues arise
- Keep old code commented out for quick rollback

---

## 📋 Execution Checklist

### Phase 1: Shared Utilities
- [ ] Create shared library structure
- [ ] Extract `extractSensorData()` to shared lib
- [ ] Extract `normalizeSamples()` to shared lib
- [ ] Extract pace calculation utilities
- [ ] Extract duration calculation utilities
- [ ] Test: All screens still work identically

### Phase 2: `analyze-running-workout`
- [ ] Replace `extractSensorData()` calls
- [ ] Replace pace calculation calls
- [ ] Replace duration calculation calls
- [ ] Consolidate interval detection
- [ ] Consolidate pace info extraction
- [ ] Test: Summary screen execution scores
- [ ] Test: Context screen AI insights

### Phase 3: AI Prompt Refactoring
- [ ] Extract prompt building functions
- [ ] Extract context building functions
- [ ] Test: Context screen AI insights

### Phase 4: `compute-workout-analysis`
- [ ] Replace `normalizeSamples()` call
- [ ] Replace pace calculation calls
- [ ] Test: Details screen charts/splits/zones

### Phase 5: Final Testing
- [ ] End-to-end testing (all screens)
- [ ] Database comparison (old vs new)
- [ ] Frontend testing (all screens)

---

## ✅ Summary

### Execution Strategy:
1. **Start with shared utilities** (lowest risk, no screen impact)
2. **Refactor one function at a time** (easier to isolate issues)
3. **Test each screen after relevant changes** (verify integrity)
4. **Keep old code as backup** (quick rollback if needed)

### Focus:
- **NOT screen-by-screen** (functions affect multiple screens)
- **Function-by-function** (complete refactor, then test all screens)
- **Incremental** (one step at a time, verify before moving on)

### Timeline:
- **4-5 weeks** for complete refactor
- **1 week per major phase**
- **Thorough testing** at each step

**Ready to start with Phase 1 (shared utilities)?** ✅


