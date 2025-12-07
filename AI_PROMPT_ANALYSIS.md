# AI Prompt Analysis: Intervals vs Long Runs

## 🎯 Purpose
This document analyzes the current AI prompt structure to identify bloat and document clear prompts for intervals and long runs.

---

## 📊 Current State: Single Function with Conditional Logic

### Location
`supabase/functions/analyze-running-workout/index.ts` lines 4245-5201 (~950 lines)

### Detection Logic
**Lines 4601-4603**: Detects interval workout vs long run
```typescript
const hasIntervals = workSteps.length > 1 || 
  steps.some((step: any) => step.step_type === 'interval' || step.step_type === 'repeat') ||
  (workSteps.length >= 1 && recoverySteps.length >= 1 && steps.length > 2);
```

**Lines 4620-4648**: Extracts planned pace info
```typescript
const isRangeWorkout = firstRange.lower !== firstRange.upper;
// Sets plannedPaceInfo.type = 'range' or 'single'
```

---

## 🔍 Current Prompt Structure

### Base Prompt (Lines 4655-4694)
**Same for all workout types**:
```
You are analyzing a running workout. Generate 3-4 concise, data-driven observations...

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language
- NO subjective judgments
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data

Workout Profile:
- Type, Duration, Distance, Avg Pace, Avg HR, Max HR
- Training Effect, Performance Condition, Stamina
- Terrain & Elevation (if available)
- Weather & Conditions (if available)
```

---

### Conditional Sections

#### 1. Planned Workout Section (Lines 4696-4744)
**Only if `isPlannedWorkout === true`**:
```
Adherence Metrics (vs. Planned Workout):
- Execution: X%
- Pace: Y%
- Duration: Z%
- HR Drift: A bpm
- Pace Variability: B%

Planned Workout Details:
- Target Pace: [range or single target]
- Workout Type: [easy/aerobic or tempo/interval]

[PLAN CONTEXT if available]
```

---

#### 2. CRITICAL ANALYSIS RULES (Lines 4746-4772)
**Different rules based on workout type**:

**A. Interval Workouts** (`hasIntervals === true`):
```
- This is an INTERVAL workout with work intervals and recovery periods
- Focus on work interval performance (pace adherence, consistency across intervals)
- Do NOT compare overall average pace to work interval pace (overall includes warmup/recovery/cooldown)
- Report interval completion (X of Y intervals completed)
- Report pace adherence range across work intervals
- Note any fading pattern (pace getting slower) or consistency across intervals
- Do NOT analyze mile-by-mile breakdown for interval workouts
```

**B. Range Workouts** (`plannedPaceInfo.type === 'range'`):
```
- This is a RANGE workout (easy/aerobic run - variability expected)
- Compare each mile/segment to the RANGE (7:00-8:00/mi)
- Miles within range are acceptable (not "too fast" or "too slow")
- Miles faster than range start are "faster than range start" (not "faster than target")
- Miles slower than range end are "slower than range end" (not "slower than target")
- Average pace within range is GOOD execution (not a miss)
- Variability is NORMAL for range workouts (not a problem)
```

**C. Single-Target Workouts** (`plannedPaceInfo.type === 'single'`):
```
- This is a SINGLE-TARGET workout (tempo/interval run - consistency critical)
- Compare each mile/segment to the EXACT TARGET (7:00/mi)
- Consistency is CRITICAL - variability indicates pacing issues
- Miles faster than target are "too fast"
- Miles slower than target are "too slow"
- Average pace should match target closely
```

---

#### 3. Workout-Specific Data Sections

**A. Interval Workouts** (Lines 4774-4833):
```
PLANNED WORKOUT STRUCTURE:
Planned: X work intervals of Y distance each (Z min each) at [pace range]

INTERVAL BREAKDOWN (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- Completed X of Y planned work intervals
- Average pace adherence: Z%
- Pace adherence range: A% to B%

CRITICAL INSTRUCTION: For interval workouts, focus on work interval performance 
compared to the planned workout structure above. Do NOT analyze overall pace or 
mile-by-mile breakdown. Report interval completion and pace adherence as shown above.
```

**B. Long Runs** (Lines 4834-4871):
```
MILE-BY-MILE CATEGORIZATION (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- X of Y miles within range (Z%)
- Within range: Miles [1, 3, 5]
- Faster than range: Miles [2, 4]
- Slower than range: Miles [6, 7, 8]

CRITICAL INSTRUCTION: When summarizing the mile-by-mile breakdown, use EXACTLY 
these pre-calculated categorizations. Do NOT recalculate which miles are in/out 
of range. Simply report these findings as-is.

When you write "Mile-by-mile breakdown:", you MUST use the exact mile numbers shown above:
- If "Within range: Miles 4" is shown, say "Mile 4 was within range"
- If "Faster than range: Miles 1, 2, 3, 6" is shown, say "Miles 1, 2, 3, 6 were faster than range start"
- If "Slower than range: Miles 5, 7, 8" is shown, say "Miles 5, 7, 8 were slower than range end"

Do NOT make up different mile numbers. Do NOT recalculate. Use the numbers provided above.
```

---

#### 4. Example Observations (Lines 4890-5102)

**A. Interval Workouts**:
```
"Completed X of Y prescribed work intervals. Work interval pace adherence ranged 
from A% to B% (average Z%). [Fading/Consistent/Varied pattern]. [Weather conditions]."
```

**B. Range Workouts**:
```
"Maintained pace averaging X:XX min/mi, [within/essentially within/outside] the 
prescribed range of [7:00-8:00/mi]. Pace control varied significantly mile-to-mile, 
with only X of Y miles falling within the target range, though average pace remained excellent."

"Mile-by-mile breakdown: [CRITICAL: Use the PRE-CALCULATED mile categorization data 
from the MILE-BY-MILE CATEGORIZATION section above. Report EXACTLY which miles were 
within range, faster than range start, or slower than range end as shown in that section.]"
```

**C. Single-Target Workouts**:
```
"Maintained pace averaging X:XX min/mi, [matching/deviating from] the prescribed 
target of [7:00/mi]. Pace varied by A%, indicating [consistent/inconsistent] pacing."
```

---

## 🔍 Identified Bloat

### 1. **Duplicate Interval Detection**
- **Line 3163-3166**: `isIntervalWorkout` (for detailed analysis)
- **Line 4601-4603**: `hasIntervals` (for AI prompt)
- **Same logic, different variable names**

### 2. **Duplicate Pace Info Extraction**
- **Line 1156-1207**: Extracts `plannedPaceInfo` (for execution score)
- **Line 4574-4652**: Re-extracts `plannedPaceInfo` (for AI prompt)
- **Same extraction logic duplicated**

### 3. **Nested Conditional Prompt Building**
- **Lines 4774-4871**: Massive nested conditionals for prompt sections
- **Lines 4890-5102**: More nested conditionals for example observations
- **Hard to read and maintain**

### 4. **Duplicate Mile-by-Mile Data Extraction**
- **Lines 4836-4870**: Extracts mile categorizations from `detailedAnalysis.mile_by_mile_terrain`
- **Lines 5009-5015**: Re-extracts same data for example observations
- **Same data extracted twice**

### 5. **Complex Template Strings**
- **Lines 4890-5102**: Complex template strings with nested conditionals
- **Hard to debug and modify**

---

## ✅ Clear AI Prompts (What Should Exist)

### Prompt 1: Interval Workouts

```
You are analyzing a running workout. Generate 3-4 concise, data-driven observations.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
- Each observation should provide UNIQUE information

Workout Profile:
- Type: run
- Duration: X minutes
- Distance: Y miles
- Avg Pace: Z:ZZ min/mi
- Avg HR: A bpm (Max: B bpm)

Adherence Metrics (vs. Planned Workout):
- Execution: X%
- Pace: Y%
- Duration: Z%
- HR Drift: A bpm
- Pace Variability: B%

Planned Workout Structure:
Planned: X work intervals of Y distance each (Z min each) at [pace range]

INTERVAL BREAKDOWN (PRE-CALCULATED):
- Completed X of Y planned work intervals
- Average pace adherence: Z%
- Pace adherence range: A% to B%

CRITICAL ANALYSIS RULES:
- This is an INTERVAL workout with work intervals and recovery periods
- Focus on work interval performance (pace adherence, consistency across intervals)
- Do NOT compare overall average pace to work interval pace (overall includes warmup/recovery/cooldown)
- Report interval completion (X of Y intervals completed)
- Report pace adherence range across work intervals
- Note any fading pattern (pace getting slower) or consistency across intervals
- Do NOT analyze mile-by-mile breakdown for interval workouts

Generate 3-4 observations:
1. "Completed X of Y prescribed work intervals. Work interval pace adherence ranged from A% to B% (average Z%). [Fading/Consistent/Varied pattern]."
2. "Heart rate averaged X bpm with +Y bpm drift (A bpm early → B bpm late), [interpretation]. Peaked at Z bpm."
3. "Duration: X of Y minutes completed (Z% adherence)."
4. "Overall execution: X% (Y% pace adherence, Z% duration adherence)."
```

---

### Prompt 2: Long Runs (Range Workouts)

```
You are analyzing a running workout. Generate 3-4 concise, data-driven observations.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
- Each observation should provide UNIQUE information

Workout Profile:
- Type: run
- Duration: X minutes
- Distance: Y miles
- Avg Pace: Z:ZZ min/mi
- Avg HR: A bpm (Max: B bpm)

Adherence Metrics (vs. Planned Workout):
- Execution: X%
- Pace: Y%
- Duration: Z%
- HR Drift: A bpm
- Pace Variability: B%

Planned Workout Details:
- Target Pace: 7:00-8:00/mi (RANGE)
- Workout Type: easy/aerobic run (variability expected)

MILE-BY-MILE CATEGORIZATION (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- X of Y miles within range (Z%)
- Within range: Miles [1, 3, 5]
- Faster than range: Miles [2, 4]
- Slower than range: Miles [6, 7, 8]

CRITICAL ANALYSIS RULES:
- This is a RANGE workout (easy/aerobic run - variability expected)
- Compare each mile/segment to the RANGE (7:00-8:00/mi)
- Miles within range are acceptable (not "too fast" or "too slow")
- Miles faster than range start are "faster than range start" (not "faster than target")
- Miles slower than range end are "slower than range end" (not "slower than target")
- Average pace within range is GOOD execution (not a miss)
- Variability is NORMAL for range workouts (not a problem)

CRITICAL INSTRUCTION: When summarizing the mile-by-mile breakdown, use EXACTLY 
these pre-calculated categorizations. Do NOT recalculate which miles are in/out 
of range. Simply report these findings as-is.

Generate 3-4 observations:
1. "Maintained pace averaging X:XX min/mi, [within/essentially within/outside] the prescribed range of 7:00-8:00/mi."
2. "Mile-by-mile breakdown: Miles [1, 3, 5] were within range. Miles [2, 4] were faster than range start. Miles [6, 7, 8] were slower than range end."
3. "Heart rate averaged X bpm with +Y bpm drift (A bpm early → B bpm late), [interpretation]. Peaked at Z bpm."
4. "Duration: X of Y minutes completed (Z% adherence). Overall execution: X% (Y% pace adherence, Z% duration adherence)."
```

---

### Prompt 3: Single-Target Workouts

```
You are analyzing a running workout. Generate 3-4 concise, data-driven observations.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
- Each observation should provide UNIQUE information

Workout Profile:
- Type: run
- Duration: X minutes
- Distance: Y miles
- Avg Pace: Z:ZZ min/mi
- Avg HR: A bpm (Max: B bpm)

Adherence Metrics (vs. Planned Workout):
- Execution: X%
- Pace: Y%
- Duration: Z%
- HR Drift: A bpm
- Pace Variability: B%

Planned Workout Details:
- Target Pace: 7:00/mi (SINGLE TARGET)
- Workout Type: tempo/interval run (consistency critical)

CRITICAL ANALYSIS RULES:
- This is a SINGLE-TARGET workout (tempo/interval run - consistency critical)
- Compare each mile/segment to the EXACT TARGET (7:00/mi)
- Consistency is CRITICAL - variability indicates pacing issues
- Miles faster than target are "too fast"
- Miles slower than target are "too slow"
- Average pace should match target closely

Generate 3-4 observations:
1. "Maintained pace averaging X:XX min/mi, [matching/deviating from] the prescribed target of 7:00/mi. Pace varied by A%, indicating [consistent/inconsistent] pacing."
2. "Heart rate averaged X bpm with +Y bpm drift (A bpm early → B bpm late), [interpretation]. Peaked at Z bpm."
3. "Duration: X of Y minutes completed (Z% adherence)."
4. "Overall execution: X% (Y% pace adherence, Z% duration adherence)."
```

---

## 🎯 Recommendations for Refactoring

### 1. **Split into Separate Functions**
```typescript
// Extract prompt building into separate functions
function buildIntervalWorkoutPrompt(context, adherence, planned, detailed) { ... }
function buildLongRunPrompt(context, adherence, planned, detailed) { ... }
function buildSingleTargetPrompt(context, adherence, planned, detailed) { ... }
function buildFreeformRunPrompt(context, adherence) { ... }
```

### 2. **Extract Shared Logic**
```typescript
// Extract shared prompt building
function buildBasePrompt(workoutContext, planContext) { ... }
function buildAdherenceSection(adherenceContext) { ... }
function buildWorkoutProfileSection(workoutContext) { ... }
```

### 3. **Single Detection Point**
```typescript
// Detect workout type once, reuse everywhere
const workoutType = detectWorkoutType(plannedWorkout, intervals);
// workoutType = 'interval' | 'long_run_range' | 'long_run_single' | 'freeform'
```

### 4. **Template-Based Prompts**
```typescript
// Use template strings for clarity
const INTERVAL_PROMPT_TEMPLATE = `...`;
const LONG_RUN_RANGE_PROMPT_TEMPLATE = `...`;
const LONG_RUN_SINGLE_PROMPT_TEMPLATE = `...`;
```

---

## ✅ Summary

### Current State:
- ❌ **Single massive function** (~950 lines)
- ❌ **Nested conditionals** throughout
- ❌ **Duplicate detection logic** (isIntervalWorkout vs hasIntervals)
- ❌ **Duplicate data extraction** (plannedPaceInfo extracted twice)
- ❌ **Complex template strings** hard to maintain

### What Should Exist:
- ✅ **Clear prompt for interval workouts** (focus on work intervals)
- ✅ **Clear prompt for long runs** (focus on mile-by-mile breakdown)
- ✅ **Clear prompt for single-target workouts** (focus on consistency)
- ✅ **Separate functions** for each prompt type
- ✅ **Shared base prompt** with conditional sections

### Key Differences:

| Aspect | Interval Workouts | Long Runs (Range) | Long Runs (Single) |
|--------|------------------|-------------------|-------------------|
| **Focus** | Work interval performance | Mile-by-mile breakdown | Consistency vs target |
| **Data** | Interval breakdown | Mile-by-mile categorization | Overall pace vs target |
| **Rules** | Don't compare overall pace | Variability is normal | Consistency critical |
| **Output** | Interval completion + adherence | Mile categorization | Pace matching target |

---

## ✅ Verification Checklist

Before refactoring, verify:
- [x] Interval detection logic is understood
- [x] Prompt differences for intervals vs long runs are understood
- [x] Bloat identified (duplicate detection, duplicate extraction)
- [x] Clear prompts documented for each workout type

**Ready to proceed with refactoring!** ✅





